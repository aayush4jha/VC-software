import { createClient as createServiceClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ApiActor } from '@/lib/api-auth';

export const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

/** The Notes page, and the two pages beneath it. */
export const NOTE_KINDS = ['notes', 'brief', 'detailed'];

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
    error: 'Notes need supabase/company-note-pages.sql run in the Supabase SQL editor.',
};

/** The name shown as "edited by" / a comment's author: the profile name, else the email. */
export async function actorName(db: SupabaseClient, actor: ApiActor): Promise<string> {
    const { data } = await db.from('profiles').select('name').eq('id', actor.userId).maybeSingle();
    return data?.name || actor.email || '';
}
