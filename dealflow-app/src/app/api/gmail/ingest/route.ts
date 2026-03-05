import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getAuthenticatedClient } from '@/lib/google';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';
const TARGET_EMAIL = 'pipeline@dholakiaventures.com';
const PITCH_DECK_EXTENSIONS = ['.pdf', '.pptx', '.ppt', '.key', '.odp'];

function parseJwt(token: string): Record<string, unknown> | null {
    try {
        const payload = token.split('.')[1];
        return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    } catch {
        return null;
    }
}

function extractSenderInfo(fromHeader: string): { name: string; email: string } {
    const match = fromHeader.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+)>?$/);
    if (match) {
        return {
            name: (match[1] || '').trim() || match[2].split('@')[0],
            email: match[2].trim(),
        };
    }
    return { name: fromHeader.split('@')[0], email: fromHeader };
}

function isPitchDeckAttachment(filename: string): boolean {
    const lower = filename.toLowerCase();
    return PITCH_DECK_EXTENSIONS.some(ext => lower.endsWith(ext));
}

export async function POST(request: NextRequest) {
    const accessToken = request.cookies.get('google_access_token')?.value;
    const refreshToken = request.cookies.get('google_refresh_token')?.value;

    if (!accessToken) {
        return NextResponse.json(
            { error: 'Not authenticated with Google. Please connect your account.' },
            { status: 401 },
        );
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const jwt = parseJwt(authHeader.slice(7));
    const userId = jwt?.sub as string | undefined;
    if (!userId) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) {
        return NextResponse.json({ error: 'Server config missing' }, { status: 500 });
    }

    try {
        const oauth2Client = getAuthenticatedClient(accessToken, refreshToken);
        const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
        const db = createServiceClient(supabaseUrl, serviceRoleKey);

        // Get the first pipeline stage (Thesis Check) by order
        const { data: stages } = await db
            .from('pipeline_stages')
            .select('id')
            .eq('organization_id', ORGANIZATION_ID)
            .order('order', { ascending: true })
            .limit(1);

        const firstStageId = stages?.[0]?.id;
        if (!firstStageId) {
            return NextResponse.json({ error: 'No pipeline stages configured' }, { status: 400 });
        }

        // Fetch already-processed Gmail message IDs for dedup
        const { data: existingEmails } = await db
            .from('ingested_emails')
            .select('gmail_message_id')
            .eq('organization_id', ORGANIZATION_ID);

        const processedIds = new Set((existingEmails || []).map((e: { gmail_message_id: string }) => e.gmail_message_id));

        // List messages sent to the pipeline email
        const listResponse = await gmail.users.messages.list({
            userId: 'me',
            q: `to:${TARGET_EMAIL}`,
            maxResults: 50,
        });

        const messages = listResponse.data.messages || [];

        if (messages.length === 0) {
            return NextResponse.json({ success: true, processed: 0, skipped: 0, created: [], message: 'No emails found' });
        }

        let processed = 0;
        let skipped = 0;
        const created: Array<{ companyName: string; companyId: string }> = [];
        const errors: string[] = [];

        for (const msg of messages) {
            if (!msg.id) continue;

            // Dedup: skip already-processed messages
            if (processedIds.has(msg.id)) {
                skipped++;
                continue;
            }

            try {
                const fullMsg = await gmail.users.messages.get({
                    userId: 'me',
                    id: msg.id,
                    format: 'metadata',
                    metadataHeaders: ['From', 'Subject', 'Date'],
                });

                const headers = fullMsg.data.payload?.headers || [];
                const fromHeader = headers.find(h => h.name === 'From')?.value || '';
                const subject = headers.find(h => h.name === 'Subject')?.value || '(No Subject)';
                const dateHeader = headers.find(h => h.name === 'Date')?.value;

                const { name: senderName, email: senderEmail } = extractSenderInfo(fromHeader);

                // Check for attachments
                const parts = fullMsg.data.payload?.parts || [];
                const attachmentNames = parts
                    .filter(p => p.filename && p.filename.length > 0)
                    .map(p => p.filename!);
                const hasPitchDeck = attachmentNames.some(isPitchDeckAttachment);
                const hasAttachments = attachmentNames.length > 0;

                // Derive company name from subject
                let companyName = subject.replace(/^(re|fwd|fw):\s*/gi, '').trim();
                if (!companyName || companyName === '(No Subject)') {
                    const domain = senderEmail.split('@')[1]?.split('.')[0] || 'Unknown';
                    companyName = domain.charAt(0).toUpperCase() + domain.slice(1);
                }

                // Check if a company with this founder email already exists
                const { data: existingCompany } = await db
                    .from('companies')
                    .select('id, company_name')
                    .eq('organization_id', ORGANIZATION_ID)
                    .eq('founder_email', senderEmail)
                    .limit(1);

                if (existingCompany && existingCompany.length > 0) {
                    await db.from('ingested_emails').insert({
                        organization_id: ORGANIZATION_ID,
                        gmail_message_id: msg.id,
                        gmail_thread_id: msg.threadId || null,
                        sender_name: senderName,
                        sender_email: senderEmail,
                        subject,
                        received_at: dateHeader ? new Date(dateHeader).toISOString() : null,
                        has_attachments: hasAttachments,
                        attachment_names: attachmentNames,
                        company_id: existingCompany[0].id,
                        status: 'skipped',
                        error_message: `Company already exists: ${existingCompany[0].company_name}`,
                    });
                    skipped++;
                    continue;
                }

                // Create the company as a draft
                const customTags = ['email-ingested'];
                if (hasPitchDeck) customTags.push('has-pitch-deck');

                const { data: newCompany, error: companyError } = await db
                    .from('companies')
                    .insert({
                        organization_id: ORGANIZATION_ID,
                        company_name: companyName,
                        founder_name: senderName,
                        founder_email: senderEmail,
                        pipeline_stage_id: firstStageId,
                        priority_level: 'Medium',
                        company_round: 'Seed',
                        deal_source_type: 'Founder Network',
                        share_type: 'Primary',
                        needs_review: true,
                        ingestion_source: 'email',
                        custom_tags: customTags,
                    })
                    .select()
                    .single();

                if (companyError) {
                    await db.from('ingested_emails').insert({
                        organization_id: ORGANIZATION_ID,
                        gmail_message_id: msg.id,
                        gmail_thread_id: msg.threadId || null,
                        sender_name: senderName,
                        sender_email: senderEmail,
                        subject,
                        received_at: dateHeader ? new Date(dateHeader).toISOString() : null,
                        has_attachments: hasAttachments,
                        attachment_names: attachmentNames,
                        status: 'error',
                        error_message: companyError.message,
                    });
                    errors.push(`Failed to create company for ${senderEmail}: ${companyError.message}`);
                    continue;
                }

                // Record in ingested_emails
                await db.from('ingested_emails').insert({
                    organization_id: ORGANIZATION_ID,
                    gmail_message_id: msg.id,
                    gmail_thread_id: msg.threadId || null,
                    sender_name: senderName,
                    sender_email: senderEmail,
                    subject,
                    received_at: dateHeader ? new Date(dateHeader).toISOString() : null,
                    has_attachments: hasAttachments,
                    attachment_names: attachmentNames,
                    company_id: newCompany.id,
                    status: 'processed',
                });

                // Add activity log
                await db.from('activity_logs').insert({
                    company_id: newCompany.id,
                    user_id: userId,
                    action: 'created',
                    details: `Auto-created from email: "${subject}" from ${senderEmail}`,
                });

                // Notify all other users
                const { data: profiles } = await db
                    .from('profiles')
                    .select('id')
                    .eq('organization_id', ORGANIZATION_ID)
                    .neq('id', userId);

                if (profiles && profiles.length > 0) {
                    const notifs = profiles.map((p: { id: string }) => ({
                        user_id: p.id,
                        type: 'new_company',
                        title: 'Email Ingested',
                        message: `${companyName} auto-created from email (needs review)`,
                        company_id: newCompany.id,
                    }));
                    await db.from('notifications').insert(notifs);
                }

                created.push({ companyName, companyId: newCompany.id });
                processed++;
            } catch (err) {
                const errMsg = (err as Error).message;
                errors.push(`Error processing message ${msg.id}: ${errMsg}`);
                try {
                    await db.from('ingested_emails').insert({
                        organization_id: ORGANIZATION_ID,
                        gmail_message_id: msg.id,
                        sender_name: '',
                        sender_email: '',
                        subject: '',
                        status: 'error',
                        error_message: errMsg,
                    });
                } catch { /* ignore */ }
            }
        }

        return NextResponse.json({ success: true, processed, skipped, created, errors: errors.length > 0 ? errors : undefined });
    } catch (error: unknown) {
        const err = error as { code?: number; message?: string };
        if (err.code === 401) {
            const response = NextResponse.json(
                { error: 'Google session expired. Please reconnect your account.' },
                { status: 401 },
            );
            response.cookies.delete('google_access_token');
            response.cookies.delete('google_connected');
            return response;
        }
        console.error('[gmail/ingest] error:', error);
        return NextResponse.json({ error: err.message || 'Failed to ingest emails' }, { status: 500 });
    }
}
