import { NextRequest, NextResponse } from 'next/server';
import { requireMember } from '@/lib/api-auth';
import { COMPANY_DOCS_BUCKET } from '@/lib/server/file-store';
import { notesDb, notesFolder, missingTable, NEEDS_MIGRATION, actorName, ORGANIZATION_ID } from '@/lib/server/company-notes';

interface Attachment { name: string; path: string; size: number; mimeType: string }

/**
 * POST { companyId, body, attachments } — adds a comment to the company's
 * Notes. Attachments are files already uploaded to the company's notes folder.
 */
export async function POST(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const db = notesDb();
    if (!db) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const { companyId, body, attachments } = await request.json();
    const text = String(body || '').trim().slice(0, 20000);
    // Only files in this company's notes folder: a comment cannot be made to
    // point at another company's documents.
    const files: Attachment[] = (Array.isArray(attachments) ? attachments : [])
        .filter((a: Attachment) => typeof a?.path === 'string' && a.path.startsWith(notesFolder(String(companyId))))
        .slice(0, 20)
        .map((a: Attachment) => ({
            name: String(a.name || 'file').slice(0, 255), path: a.path,
            size: Number(a.size) || 0, mimeType: String(a.mimeType || ''),
        }));
    if (!companyId || (!text && files.length === 0)) {
        return NextResponse.json({ error: 'A comment needs text or a file' }, { status: 400 });
    }

    const { data, error } = await db.from('company_note_comments').insert({
        organization_id: ORGANIZATION_ID, company_id: companyId,
        author_id: auth.actor.userId, author_name: await actorName(db, auth.actor),
        body: text, attachments: files,
    }).select('id, author_id, author_name, body, attachments, created_at').single();
    if (error) {
        if (missingTable(error.message)) return NextResponse.json(NEEDS_MIGRATION, { status: 503 });
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
        comment: {
            id: data.id, authorId: data.author_id, authorName: data.author_name,
            body: data.body, attachments: data.attachments, createdAt: data.created_at,
        },
    });
}

/** DELETE ?id= — removes a comment and its files. Its author or an admin only. */
export async function DELETE(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const db = notesDb();
    if (!db) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const id = new URL(request.url).searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const { data: comment } = await db.from('company_note_comments')
        .select('author_id, attachments').eq('id', id).maybeSingle();
    if (!comment) return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    if (comment.author_id !== auth.actor.userId && auth.actor.role !== 'admin') {
        return NextResponse.json({ error: 'Only the person who wrote it, or an admin, can delete a comment' }, { status: 403 });
    }

    const { error } = await db.from('company_note_comments').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const paths = ((comment.attachments || []) as Attachment[]).map(a => a.path).filter(Boolean);
    if (paths.length) await db.storage.from(COMPANY_DOCS_BUCKET).remove(paths);
    return NextResponse.json({ ok: true });
}
