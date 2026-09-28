import type { SupabaseClient } from '@supabase/supabase-js';
import type { gmail_v1 } from 'googleapis';
import { isDeckFile, type FoundAttachment } from './gmail-parse';
import { documentPath, isWorthStoring, storeFile } from './file-store';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Files an email's attachments against a company, so the deck can be opened
 * from the company's Documents card later.
 *
 * Given a Gmail client, a real copy of each document is kept in storage, and
 * the Gmail message is recorded alongside it as a fallback. Without one — or
 * when a file is too big, or the download fails — the row still points at the
 * message, which is better than no document at all.
 *
 * Best-effort throughout: nothing here may cost the company the email created.
 */
export async function saveEmailDocuments(
    db: SupabaseClient,
    companyId: string,
    attachments: FoundAttachment[],
    meta: { messageId: string; senderEmail: string; subject: string; receivedAt: string | null; label?: string },
    gmail?: gmail_v1.Gmail,
): Promise<void> {
    if (attachments.length === 0) return;
    const label = meta.label || 'documents';

    // Download the documents worth keeping and store a real copy.
    const stored = new Map<string, string>();
    if (gmail && meta.messageId) {
        for (const a of attachments) {
            if (!isWorthStoring(a.filename, a.size)) continue;
            try {
                const res = await gmail.users.messages.attachments.get({
                    userId: 'me', messageId: meta.messageId, id: a.attachmentId,
                });
                const data = res.data.data;
                if (!data) continue;
                const buffer = Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
                const path = await storeFile(
                    db,
                    documentPath(companyId, 'email', `${meta.messageId}-${a.attachmentId.slice(-8)}`, a.filename),
                    buffer, a.mimeType, label,
                );
                if (path) stored.set(a.attachmentId, path);
            } catch (err) {
                // Keep the Gmail pointer for this one and carry on.
                console.error(`[${label}] could not copy ${a.filename}:`, (err as Error).message);
            }
        }
    }

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
        storage_path: stored.get(a.attachmentId) ?? null,
        received_at: meta.receivedAt,
        sender_email: meta.senderEmail,
        subject: meta.subject,
    }));
    // onConflict matches the table's (company_id, gmail_message_id, file_name)
    // key, so the same email filed twice does not stack up duplicate rows.
    const { error } = await db
        .from('company_documents')
        .upsert(rows, { onConflict: 'company_id,gmail_message_id,file_name', ignoreDuplicates: true });
    if (error) console.error(`[${label}] saveEmailDocuments:`, error.message);
}
