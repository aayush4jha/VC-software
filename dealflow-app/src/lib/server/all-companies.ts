import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';
const PAGE = 1000;

/**
 * Every company in the organisation, newest first.
 *
 * Supabase returns at most 1,000 rows per request and says nothing when it
 * stops there. Once the Notion import took the table past 3,000, a plain
 * select left the board showing the newest 1,000 and let the duplicate
 * matchers miss everything older — so this reads a page at a time until a
 * short page comes back.
 */
export async function allCompanies<T = Record<string, unknown>>(
    db: SupabaseClient,
    columns = '*',
): Promise<{ data: T[]; error: PostgrestError | null }> {
    const rows: T[] = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await db.from('companies').select(columns)
            .eq('organization_id', ORGANIZATION_ID)
            // id breaks ties, so rows sharing a created_at cannot shift between pages.
            .order('created_at', { ascending: false }).order('id')
            .range(from, from + PAGE - 1);
        if (error) return { data: rows, error };
        rows.push(...((data || []) as T[]));
        if (!data || data.length < PAGE) return { data: rows, error: null };
    }
}
