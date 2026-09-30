import type { SupabaseClient } from '@supabase/supabase-js';
import { blanksToFill, describeFill, type ExtractedFacts } from '@/lib/company-fill';

/**
 * Applies what a later email adds, to the fields that are still empty. Logs
 * what it filled on the company's activity trail, so a value that appeared
 * without anyone typing it can be traced to the email that brought it.
 *
 * Best-effort: a failed fill must never cost the filing of the email itself.
 */
export async function fillCompanyBlanks(
    db: SupabaseClient,
    companyId: string,
    facts: ExtractedFacts,
    context: { userId: string | null; source: string; label?: string },
): Promise<string[]> {
    try {
        const { data: company } = await db.from('companies')
            .select('founder_name, founder_email, total_fund_raise, valuation, sub_industry, quick_summary, industry_id')
            .eq('id', companyId).maybeSingle();
        if (!company) return [];

        const patch = blanksToFill(company, facts);
        const fields = Object.keys(patch);
        if (fields.length === 0) return [];

        const { error } = await db.from('companies').update(patch).eq('id', companyId);
        if (error) {
            console.error(`[${context.label || 'fill'}] could not fill blanks:`, error.message);
            return [];
        }
        await db.from('activity_logs').insert({
            company_id: companyId,
            user_id: context.userId,
            action: 'updated',
            details: `Filled from ${context.source}: ${describeFill(patch)} (fields that were empty)`,
        });
        return fields;
    } catch (err) {
        console.error(`[${context.label || 'fill'}] fill failed:`, (err as Error).message);
        return [];
    }
}
