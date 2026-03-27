import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getRouteUser } from '@/lib/auth-helpers';
import { getAuthenticatedClientForUser } from '@/lib/google-tokens';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

function buildGmailLink(messageId: string): string {
    return `https://mail.google.com/mail/u/0/#inbox/${messageId}`;
}

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
        // ─── Strategy 0: Check ingested_emails table first (instant, no API call) ───
        if (companyId && supabaseUrl && serviceRoleKey) {
            const db = createServiceClient(supabaseUrl, serviceRoleKey);
            const { data: ingested } = await db
                .from('ingested_emails')
                .select('gmail_message_id')
                .eq('organization_id', ORGANIZATION_ID)
                .eq('company_id', companyId)
                .eq('status', 'processed')
                .order('created_at', { ascending: false })
                .limit(1);

            if (ingested && ingested.length > 0 && ingested[0].gmail_message_id) {
                const link = buildGmailLink(ingested[0].gmail_message_id);
                return NextResponse.json({ found: true, link, source: 'database' });
            }
        }

        // ─── Strategy 1+: Search Gmail API ───
        const authResult = await getAuthenticatedClientForUser(user.id);
        if (!authResult) {
            return NextResponse.json({ found: false, link: null, error: 'Google not connected' });
        }

        const gmail = google.gmail({ version: 'v1', auth: authResult.oauth2Client });

        // Helper: search Gmail with a query and return the first message link
        async function searchGmail(query: string): Promise<{ id: string; link: string } | null> {
            try {
                const res = await gmail.users.messages.list({
                    userId: 'me',
                    q: query,
                    maxResults: 5,
                });
                const messages = res.data.messages || [];
                if (messages.length > 0 && messages[0].id) {
                    return { id: messages[0].id, link: buildGmailLink(messages[0].id) };
                }
            } catch (e) {
                console.error(`[find-deck-email] Gmail search failed for query "${query}":`, (e as Error).message);
            }
            return null;
        }

        let result: { id: string; link: string } | null = null;

        // Strategy 1: from:<founderEmail> with attachment (most precise)
        if (founderEmail) {
            result = await searchGmail(`from:${founderEmail} has:attachment`);
        }

        // Strategy 2: from:<founderEmail> without attachment filter
        if (!result && founderEmail) {
            result = await searchGmail(`from:${founderEmail}`);
        }

        // Strategy 3: company name in subject/body from the founder email
        if (!result && companyName && founderEmail) {
            result = await searchGmail(`from:${founderEmail} ${companyName}`);
        }

        // Strategy 4: company name with attachment
        if (!result && companyName) {
            result = await searchGmail(`${companyName} has:attachment`);
        }

        // Strategy 5: company name anywhere
        if (!result && companyName) {
            result = await searchGmail(companyName);
        }

        // Strategy 6: founder name with attachment
        if (!result && founderName) {
            result = await searchGmail(`from:${founderName} has:attachment`);
        }

        // Strategy 7: founder name anywhere
        if (!result && founderName) {
            result = await searchGmail(`from:${founderName}`);
        }

        if (result) {
            return NextResponse.json({ found: true, link: result.link, source: 'gmail' });
        }

        return NextResponse.json({ found: false, link: null });
    } catch (error: unknown) {
        console.error('[gmail/find-deck-email] error:', error);
        return NextResponse.json({ error: (error as Error).message || 'Failed to search' }, { status: 500 });
    }
}
