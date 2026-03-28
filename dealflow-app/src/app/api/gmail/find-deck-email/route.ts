import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getRouteUser } from '@/lib/auth-helpers';
import { getAuthenticatedClientForUser } from '@/lib/google-tokens';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

export async function POST(request: NextRequest) {
    const user = await getRouteUser(request);
    if (!user) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const { companyId, companyName, founderName, founderEmail } = body;

    if (!companyName && !founderName && !founderEmail) {
        return NextResponse.json({ error: 'Provide at least one search field' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    try {
        // ─── Strategy 0: Check ingested_emails table (instant, no Gmail API call) ───
        if (supabaseUrl && serviceRoleKey) {
            const db = createServiceClient(supabaseUrl, serviceRoleKey);

            // 0a: Look up by company_id
            if (companyId) {
                const { data: ingested } = await db
                    .from('ingested_emails')
                    .select('gmail_message_id')
                    .eq('organization_id', ORGANIZATION_ID)
                    .eq('company_id', companyId)
                    .eq('status', 'processed')
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (ingested && ingested.length > 0 && ingested[0].gmail_message_id) {
                    return NextResponse.json({ found: true, messageId: ingested[0].gmail_message_id, source: 'database' });
                }
            }

            // 0b: Look up by sender_email
            if (founderEmail) {
                const { data: ingested } = await db
                    .from('ingested_emails')
                    .select('gmail_message_id')
                    .eq('organization_id', ORGANIZATION_ID)
                    .eq('sender_email', founderEmail)
                    .eq('status', 'processed')
                    .order('created_at', { ascending: false })
                    .limit(1);

                if (ingested && ingested.length > 0 && ingested[0].gmail_message_id) {
                    return NextResponse.json({ found: true, messageId: ingested[0].gmail_message_id, source: 'database' });
                }
            }
        }

        // ─── Strategy 1+: Search Gmail API ───
        const authResult = await getAuthenticatedClientForUser(user.id);
        if (!authResult) {
            return NextResponse.json({ found: false, messageId: null, reason: 'Google not connected' });
        }

        const gmail = google.gmail({ version: 'v1', auth: authResult.oauth2Client });

        async function searchGmail(query: string): Promise<string | null> {
            try {
                const res = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: 3 });
                const msg = res.data.messages?.[0];
                if (msg?.id) return msg.id;
            } catch (e) {
                console.error(`[find-deck-email] search failed: "${query}"`, (e as Error).message);
            }
            return null;
        }

        const searches: string[] = [];
        if (founderEmail) {
            searches.push(`from:${founderEmail} has:attachment`);
            searches.push(`from:${founderEmail}`);
        }
        if (companyName && founderEmail) {
            searches.push(`from:${founderEmail} ${companyName}`);
        }
        if (companyName) {
            searches.push(`${companyName} has:attachment`);
            searches.push(companyName);
        }
        if (founderName) {
            searches.push(`from:${founderName}`);
        }

        for (const query of searches) {
            const messageId = await searchGmail(query);
            if (messageId) {
                return NextResponse.json({ found: true, messageId, source: 'gmail' });
            }
        }

        return NextResponse.json({ found: false, messageId: null });
    } catch (error: unknown) {
        console.error('[gmail/find-deck-email] error:', error);
        return NextResponse.json({ error: (error as Error).message || 'Failed to search' }, { status: 500 });
    }
}
