import type { gmail_v1 } from 'googleapis';
import { signatureToText } from '@/lib/signature';

/**
 * The signature Gmail holds for the account, as text, or ''.
 *
 * Never throws. An account connected before the settings scope was requested
 * answers 403, and a mail that goes out unsigned is better than one that does
 * not go out at all — the Email Workspace says when a reconnect is needed.
 */
export async function fetchGmailSignature(gmail: gmail_v1.Gmail): Promise<string> {
    try {
        const { data } = await gmail.users.settings.sendAs.list({ userId: 'me' });
        const addresses = data.sendAs || [];
        const mine = addresses.find(a => a.isDefault) || addresses[0];
        return signatureToText(mine?.signature || '');
    } catch (err) {
        const message = (err as Error).message;
        console.warn('[gmail-signature] not read:', message);
        return '';
    }
}
