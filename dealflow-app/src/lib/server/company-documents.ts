import type { SupabaseClient } from '@supabase/supabase-js';
import { isDeckFile, type FoundAttachment } from './gmail-parse';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Files an email's attachments against a company, so the deck can be opened
 * from the company's Documents card later.
 *
 * The bytes stay in Gmail — this records which message holds them, and
 * /api/gmail/attachment streams one on demand. (A WhatsApp file has no message
 * to stream from, so that path copies the file into storage instead and sets
 * storage_path.)
 *
 * Best-effort by design: a failed insert must never cost the company the email
 * created, so errors are logged and swallowed.
 */
export async function saveEmailDocuments(
    db: SupabaseClient,
    companyId: string,
    attachments: FoundAttachment[],
    meta: { messageId: string; senderEmail: string; subject: string; receivedAt: string | null; label?: string },
): Promise<void> {
    if (attachments.length === 0) return;
    const rows = attachments.map(a => ({
        organization_id: ORGANIZATION_ID,
        company_id: companyId,
        file_name: a.filename,
        mime_type: a.mimeType,
        size_bytes: a.size,
        is_pitch_deck: isDeckFile(a.filename),
        source: 'email',
        gmail_message_id: meta.messageId,
        gmail_attachment_id: a.attachmentId,
        received_at: meta.receivedAt,
        sender_email: meta.senderEmail,
        subject: meta.subject,
    }));
    // onConflict matches the table's (company_id, gmail_message_id, file_name)
    // key, so the same email filed twice does not stack up duplicate rows.
    const { error } = await db
        .from('company_documents')
        .upsert(rows, { onConflict: 'company_id,gmail_message_id,file_name', ignoreDuplicates: true });
    if (error) console.error(`[${meta.label || 'documents'}] saveEmailDocuments:`, error.message);
}
