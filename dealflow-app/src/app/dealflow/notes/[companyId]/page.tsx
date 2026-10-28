'use client';

export const dynamic = 'force-dynamic';

import { useParams } from 'next/navigation';
import { NotesHome } from '@/components/notes/CompanyNotes';

/** /dealflow/notes/<company> — a company's Notes window, full screen. */
export default function CompanyNotesPage() {
    const { companyId } = useParams<{ companyId: string }>();
    return <NotesHome companyId={companyId} />;
}
