'use client';

export const dynamic = 'force-dynamic';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { NoteSubPage, SUB_PAGES } from '@/components/notes/CompanyNotes';

/** /dealflow/notes/<company>/brief or /detailed — one of the pages under Notes. */
export default function CompanyNoteSubPage() {
    const { companyId, kind } = useParams<{ companyId: string; kind: string }>();
    const page = SUB_PAGES.find(p => p.kind === kind);
    if (!page) {
        return (
            <div className="notes-message">
                No such page. <Link href={`/dealflow/notes/${companyId}`}>Back to the notes</Link>
            </div>
        );
    }
    return <NoteSubPage companyId={companyId} kind={page.kind} />;
}
