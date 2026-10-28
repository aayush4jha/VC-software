'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor, useEditorState, EditorContent, Node, mergeAttributes, type Editor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import Image from '@tiptap/extension-image';
import { Placeholder } from '@tiptap/extensions';
import { TaskList, TaskItem } from '@tiptap/extension-list';
import {
    Bold, Italic, Underline, Strikethrough, Heading1, Heading2, Heading3, Pilcrow,
    List, ListOrdered, ListTodo, Quote, Code, Minus, Link as LinkIcon, Table,
    ImagePlus, Paperclip, Undo2, Redo2, BetweenHorizontalEnd, BetweenVerticalEnd,
    Rows3, Columns3, Trash2, Loader2, Check, AlertTriangle,
} from 'lucide-react';
import { uploadCompanyFile, noteFileUrl, formatBytes } from '@/lib/upload-company-file';

/**
 * A file dropped into a note: a chip that opens the file. A node of its own
 * rather than a link in the text, so it reads as an attachment, moves as one
 * piece, and cannot be half-deleted.
 */
const FileAttachment = Node.create({
    name: 'fileAttachment',
    group: 'block',
    atom: true,
    draggable: true,
    addAttributes() {
        return {
            href: { default: null },
            name: { default: 'file' },
            size: { default: '' },
        };
    },
    parseHTML() {
        return [{
            tag: 'a[data-note-file]',
            getAttrs: el => ({
                href: el.getAttribute('href'),
                name: el.getAttribute('data-name'),
                size: el.getAttribute('data-size'),
            }),
        }];
    },
    renderHTML({ node, HTMLAttributes }) {
        const { href, name, size } = node.attrs;
        return ['a', mergeAttributes(HTMLAttributes, {
            'data-note-file': '', class: 'note-file', href, target: '_blank', rel: 'noreferrer',
            'data-name': name, 'data-size': size,
        }),
            ['span', { class: 'note-file-icon' }, '📎'],
            ['span', { class: 'note-file-name' }, name],
            ['span', { class: 'note-file-size' }, size || ''],
        ];
    },
});

const IMAGE = /^image\/(png|jpe?g|gif|webp)$/;

const NOTHING_ACTIVE = {
    bold: false, italic: false, underline: false, strike: false, h1: false, h2: false, h3: false,
    bullet: false, ordered: false, task: false, quote: false, code: false, link: false, table: false,
    canUndo: false, canRedo: false,
};

export interface NotePageData {
    content: JSONContent | null;
    updatedAt: string | null;
    updatedByName: string | null;
}

type SaveState =
    | { kind: 'saved' }
    | { kind: 'unsaved' }
    | { kind: 'saving' }
    | { kind: 'error'; message: string }
    | { kind: 'conflict'; theirs: NotePageData };

function when(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

/** A toolbar button. mousedown is swallowed so the editor keeps its selection. */
function B({ on, title, onClick, disabled, children }: {
    on?: boolean; title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode;
}) {
    return (
        <button
            type="button" title={title} aria-label={title} aria-pressed={on}
            className={`note-tool${on ? ' on' : ''}`} disabled={disabled}
            onMouseDown={e => e.preventDefault()} onClick={onClick}
        >
            {children}
        </button>
    );
}

/**
 * One note page — Notes, Brief or Detailed Note — edited in place and saved as
 * you go. A second before the last keystroke the page is sent; if someone else
 * saved it in the meantime, the save is refused and both versions are offered
 * rather than one quietly replacing the other.
 */
export default function NoteEditor({ companyId, kind, initial, placeholder }: {
    companyId: string;
    kind: 'notes' | 'brief' | 'detailed';
    initial: NotePageData;
    placeholder: string;
}) {
    const [state, setState] = useState<SaveState>({ kind: 'saved' });
    const [lastSaved, setLastSaved] = useState({ at: initial.updatedAt, by: initial.updatedByName });
    const [uploading, setUploading] = useState<string | null>(null);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const baseUpdatedAt = useRef(initial.updatedAt);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const dirty = useRef(false);
    const imageInput = useRef<HTMLInputElement>(null);
    const fileInput = useRef<HTMLInputElement>(null);
    const editorRef = useRef<Editor | null>(null);

    const save = useCallback(async (opts: { force?: boolean; keepalive?: boolean } = {}) => {
        const editor = editorRef.current;
        if (!editor) return;
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        dirty.current = false;
        setState({ kind: 'saving' });
        try {
            const res = await fetch('/api/company-notes', {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, keepalive: opts.keepalive,
                body: JSON.stringify({
                    companyId, kind, content: editor.getJSON(),
                    baseUpdatedAt: baseUpdatedAt.current, force: opts.force,
                }),
            });
            const j = await res.json();
            if (res.status === 409 && j.conflict) {
                setState({ kind: 'conflict', theirs: { content: j.content, updatedAt: j.updatedAt, updatedByName: j.updatedByName } });
                return;
            }
            if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
            baseUpdatedAt.current = j.updatedAt;
            setLastSaved({ at: j.updatedAt, by: j.updatedByName });
            setState(dirty.current ? { kind: 'unsaved' } : { kind: 'saved' });
        } catch (err) {
            dirty.current = true;
            setState({ kind: 'error', message: (err as Error).message });
        }
    }, [companyId, kind]);

    const insertFiles = useCallback(async (files: File[], at?: number) => {
        const editor = editorRef.current;
        if (!editor || files.length === 0) return;
        setUploadError(null);
        const failed: string[] = [];
        for (const file of files) {
            setUploading(file.name);
            try {
                const up = await uploadCompanyFile(companyId, file, 'notes');
                const node = IMAGE.test(file.type)
                    ? { type: 'image', attrs: { src: noteFileUrl(up.path), alt: up.name } }
                    : { type: 'fileAttachment', attrs: { href: noteFileUrl(up.path), name: up.name, size: formatBytes(up.size) } };
                const chain = editor.chain().focus();
                (at != null ? chain.insertContentAt(at, node) : chain.insertContent(node)).run();
                at = undefined;
            } catch (err) {
                failed.push(`${file.name}: ${(err as Error).message}`);
            }
        }
        setUploading(null);
        if (failed.length) setUploadError(failed.join(' · '));
    }, [companyId]);

    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
            TableKit.configure({ table: { resizable: true } }),
            Image,
            TaskList,
            TaskItem.configure({ nested: true }),
            FileAttachment,
            Placeholder.configure({ placeholder }),
        ],
        content: initial.content && Object.keys(initial.content).length ? initial.content : '',
        editorProps: {
            attributes: { class: 'note-prose' },
            handlePaste: (_view, event) => {
                const files = Array.from(event.clipboardData?.files || []);
                if (!files.length) return false;
                insertFiles(files);
                return true;
            },
            handleDrop: (view, event) => {
                const files = Array.from(event.dataTransfer?.files || []);
                if (!files.length) return false;
                event.preventDefault();
                const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
                insertFiles(files, pos);
                return true;
            },
            // Inside an editor a click places the cursor; an attachment should open.
            handleClick: (_view, _pos, event) => {
                const chip = (event.target as HTMLElement).closest('a.note-file') as HTMLAnchorElement | null;
                if (chip?.href) { window.open(chip.href, '_blank', 'noreferrer'); return true; }
                return false;
            },
        },
        onUpdate: () => {
            dirty.current = true;
            setState(s => s.kind === 'conflict' ? s : { kind: 'unsaved' });
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => { save(); }, 1000);
        },
    });
    useEffect(() => { editorRef.current = editor; }, [editor]);

    // Leaving the page or switching tab sends what is pending, rather than
    // waiting out the timer and losing the last sentence.
    useEffect(() => {
        const flush = () => { if (dirty.current) save({ keepalive: true }); };
        const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
        const onLeave = (e: BeforeUnloadEvent) => { if (dirty.current) { flush(); e.preventDefault(); } };
        document.addEventListener('visibilitychange', onHide);
        window.addEventListener('beforeunload', onLeave);
        return () => {
            document.removeEventListener('visibilitychange', onHide);
            window.removeEventListener('beforeunload', onLeave);
            flush();
        };
    }, [save]);

    // useEditorState only produces a snapshot on the editor's first
    // transaction, so it is null until then. Waiting on it before rendering
    // the editor meant there could never be a transaction: the page sat on
    // "Loading editor…" for good. The toolbar starts with nothing lit instead.
    const editorState = useEditorState({
        editor,
        selector: ({ editor: e }) => e ? {
            bold: e.isActive('bold'), italic: e.isActive('italic'), underline: e.isActive('underline'),
            strike: e.isActive('strike'), h1: e.isActive('heading', { level: 1 }), h2: e.isActive('heading', { level: 2 }),
            h3: e.isActive('heading', { level: 3 }), bullet: e.isActive('bulletList'), ordered: e.isActive('orderedList'),
            task: e.isActive('taskList'), quote: e.isActive('blockquote'), code: e.isActive('codeBlock'),
            link: e.isActive('link'), table: e.isActive('table'),
            canUndo: e.can().undo(), canRedo: e.can().redo(),
        } : null,
    });
    const active = editorState ?? NOTHING_ACTIVE;

    const takeTheirs = () => {
        if (state.kind !== 'conflict' || !editor) return;
        const theirs = state.theirs;
        editor.commands.setContent(theirs.content && Object.keys(theirs.content).length ? theirs.content : '', { emitUpdate: false });
        baseUpdatedAt.current = theirs.updatedAt;
        dirty.current = false;
        setLastSaved({ at: theirs.updatedAt, by: theirs.updatedByName });
        setState({ kind: 'saved' });
    };

    const setLink = () => {
        if (!editor) return;
        const previous = editor.getAttributes('link').href as string | undefined;
        const url = window.prompt('Link address', previous || 'https://');
        if (url === null) return;
        if (url.trim() === '' ) editor.chain().focus().extendMarkRange('link').unsetLink().run();
        else editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run();
    };

    if (!editor) return <div className="note-loading">Loading editor…</div>;

    const c = () => editor.chain().focus();

    return (
        <div className="note-editor">
            <div className="note-toolbar" role="toolbar" aria-label="Formatting">
                <B title="Text" on={!active.h1 && !active.h2 && !active.h3} onClick={() => c().setParagraph().run()}><Pilcrow size={15} /></B>
                <B title="Heading 1" on={active.h1} onClick={() => c().toggleHeading({ level: 1 }).run()}><Heading1 size={15} /></B>
                <B title="Heading 2" on={active.h2} onClick={() => c().toggleHeading({ level: 2 }).run()}><Heading2 size={15} /></B>
                <B title="Heading 3" on={active.h3} onClick={() => c().toggleHeading({ level: 3 }).run()}><Heading3 size={15} /></B>
                <span className="note-tool-sep" />
                <B title="Bold" on={active.bold} onClick={() => c().toggleBold().run()}><Bold size={15} /></B>
                <B title="Italic" on={active.italic} onClick={() => c().toggleItalic().run()}><Italic size={15} /></B>
                <B title="Underline" on={active.underline} onClick={() => c().toggleUnderline().run()}><Underline size={15} /></B>
                <B title="Strikethrough" on={active.strike} onClick={() => c().toggleStrike().run()}><Strikethrough size={15} /></B>
                <B title="Link" on={active.link} onClick={setLink}><LinkIcon size={15} /></B>
                <span className="note-tool-sep" />
                <B title="Bulleted list" on={active.bullet} onClick={() => c().toggleBulletList().run()}><List size={15} /></B>
                <B title="Numbered list" on={active.ordered} onClick={() => c().toggleOrderedList().run()}><ListOrdered size={15} /></B>
                <B title="Checklist" on={active.task} onClick={() => c().toggleTaskList().run()}><ListTodo size={15} /></B>
                <B title="Quote" on={active.quote} onClick={() => c().toggleBlockquote().run()}><Quote size={15} /></B>
                <B title="Code" on={active.code} onClick={() => c().toggleCodeBlock().run()}><Code size={15} /></B>
                <B title="Divider" onClick={() => c().setHorizontalRule().run()}><Minus size={15} /></B>
                <span className="note-tool-sep" />
                <B title="Insert table" on={active.table} onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><Table size={15} /></B>
                <B title="Insert image" onClick={() => imageInput.current?.click()}><ImagePlus size={15} /></B>
                <B title="Attach file" onClick={() => fileInput.current?.click()}><Paperclip size={15} /></B>
                <span className="note-tool-sep" />
                <B title="Undo" disabled={!active.canUndo} onClick={() => c().undo().run()}><Undo2 size={15} /></B>
                <B title="Redo" disabled={!active.canRedo} onClick={() => c().redo().run()}><Redo2 size={15} /></B>

                <span className="note-save-state">
                    {uploading ? <><Loader2 size={13} className="spin" /> Uploading {uploading}…</>
                        : state.kind === 'saving' ? <><Loader2 size={13} className="spin" /> Saving…</>
                        : state.kind === 'unsaved' ? 'Unsaved changes'
                        : state.kind === 'error' ? <span style={{ color: 'var(--danger)' }}><AlertTriangle size={13} /> Not saved — {state.message}</span>
                        : state.kind === 'conflict' ? <span style={{ color: 'var(--warning)' }}><AlertTriangle size={13} /> Edited elsewhere</span>
                        : lastSaved.at ? <><Check size={13} /> Saved · {lastSaved.by ? `${lastSaved.by}, ` : ''}{when(lastSaved.at)}</>
                        : 'Nothing written yet'}
                </span>
                {state.kind === 'error' && <button type="button" className="btn btn-secondary btn-sm" onClick={() => save()}>Retry</button>}
            </div>

            {active.table && (
                <div className="note-table-tools" role="toolbar" aria-label="Table">
                    <span>Table:</span>
                    <B title="Add row below" onClick={() => c().addRowAfter().run()}><BetweenHorizontalEnd size={14} /> Row</B>
                    <B title="Add column right" onClick={() => c().addColumnAfter().run()}><BetweenVerticalEnd size={14} /> Column</B>
                    <B title="Delete row" onClick={() => c().deleteRow().run()}><Rows3 size={14} /> Delete row</B>
                    <B title="Delete column" onClick={() => c().deleteColumn().run()}><Columns3 size={14} /> Delete column</B>
                    <B title="Header row on/off" onClick={() => c().toggleHeaderRow().run()}>Header row</B>
                    <B title="Delete table" onClick={() => c().deleteTable().run()}><Trash2 size={14} /> Delete table</B>
                </div>
            )}

            {state.kind === 'conflict' && (
                <div className="note-conflict">
                    <AlertTriangle size={15} />
                    <span>
                        {state.theirs.updatedByName || 'Someone'} saved this page at {when(state.theirs.updatedAt)}, after you opened it.
                        Your changes are not saved yet.
                    </span>
                    <button type="button" className="btn btn-secondary btn-sm" onClick={takeTheirs}>Load their version</button>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => save({ force: true })}>Keep mine</button>
                </div>
            )}
            {uploadError && <div className="note-upload-error">{uploadError}</div>}

            <EditorContent editor={editor} />

            <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden
                onChange={e => { insertFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
            <input ref={fileInput} type="file" multiple hidden
                accept=".pdf,.ppt,.pptx,.key,.odp,.doc,.docx,.xls,.xlsx,.csv,.txt,.rtf,.zip,image/*"
                onChange={e => { insertFiles(Array.from(e.target.files || [])); e.target.value = ''; }} />
        </div>
    );
}
