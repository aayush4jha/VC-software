import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ApiActor } from '@/lib/api-auth';

export const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

/** The pages every company starts with beneath its Notes window. */
export const DEFAULT_SUBPAGES = [
    { key: 'brief', title: 'Brief' },
    { key: 'detailed', title: 'Detailed Note' },
];

export interface Subpage { key: string; title: string }

/**
 * The company's pages beneath Notes, in order. The first time a company's
 * notes are opened it is given Brief and Detailed Note; a page deleted later
 * keeps its row, so that does not happen twice.
 */
export async function listSubpages(db: SupabaseClient, companyId: string): Promise<{ subpages: Subpage[]; error?: string }> {
    const read = () => db.from('company_note_subpages').select('key, title, position, deleted_at, created_at')
        .eq('company_id', companyId).order('position').order('created_at');
    let { data, error } = await read();
    if (error) return { subpages: [], error: error.message };
    if (!data?.length) {
        const seeded = await db.from('company_note_subpages').upsert(
            DEFAULT_SUBPAGES.map((p, i) => ({ organization_id: ORGANIZATION_ID, company_id: companyId, key: p.key, title: p.title, position: i })),
            { onConflict: 'company_id,key', ignoreDuplicates: true },
        );
        if (seeded.error) return { subpages: [], error: seeded.error.message };
        ({ data, error } = await read());
        if (error) return { subpages: [], error: error.message };
    }
    return { subpages: (data || []).filter(p => !p.deleted_at).map(p => ({ key: p.key, title: p.title })) };
}

/** A page a note can be saved to: the Notes page itself, or one of the company's live pages. */
export async function isLivePage(db: SupabaseClient, companyId: string, kind: string): Promise<boolean> {
    if (kind === 'notes') return true;
    const { data } = await db.from('company_note_subpages').select('key')
        .eq('company_id', companyId).eq('key', kind).is('deleted_at', null).maybeSingle();
    return !!data;
}

/** Every note image and file sits under this, inside the company's folder. */
export const notesFolder = (companyId: string) => `company/${companyId}/notes/`;

export function notesDb(): SupabaseClient | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return url && key ? createServiceClient(url, key) : null;
}

export const missingTable = (m: string) => /relation .* does not exist|schema cache|could not find the table/i.test(m);

export const NEEDS_MIGRATION = {
    needsMigration: true,
    error: 'Notes need supabase/company-note-pages.sql and supabase/company-note-subpages.sql run in the Supabase SQL editor.',
};

/** The name shown as "edited by" / a comment's author: the profile name, else the email. */
export async function actorName(db: SupabaseClient, actor: ApiActor): Promise<string> {
    const { data } = await db.from('profiles').select('name').eq('id', actor.userId).maybeSingle();
    return data?.name || actor.email || '';
}
