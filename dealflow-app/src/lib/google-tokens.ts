import { createClient as createServiceClient } from '@supabase/supabase-js';
import { getOAuth2Client } from './google';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function getDB() {
    return createServiceClient(supabaseUrl, serviceRoleKey);
}

interface StoredTokens {
    access_token: string;
    refresh_token: string | null;
    expiry_date: number | null;
    connected_at: string;
}

/**
 * Save or update Google tokens for a user in the database.
 */
export async function saveGoogleTokens(
    userId: string,
    organizationId: string,
    tokens: { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null },
) {
    const db = getDB();

    // Check if row exists
    const { data: existing } = await db
        .from('google_tokens')
        .select('id, refresh_token')
        .eq('user_id', userId)
        .limit(1)
        .single();

    if (existing) {
        // Update — keep existing refresh_token if new one isn't provided
        const update: Record<string, unknown> = {
            access_token: tokens.access_token || '',
            expiry_date: tokens.expiry_date || null,
            updated_at: new Date().toISOString(),
        };
        if (tokens.refresh_token) {
            update.refresh_token = tokens.refresh_token;
        }
        await db.from('google_tokens').update(update).eq('id', existing.id);
    } else {
        // Insert
        await db.from('google_tokens').insert({
            user_id: userId,
            organization_id: organizationId,
            access_token: tokens.access_token || '',
            refresh_token: tokens.refresh_token || null,
            expiry_date: tokens.expiry_date || null,
        });
    }
}

/**
 * Load Google tokens for a user. Auto-refreshes if the access token is expired.
 * Returns null if the user has no stored tokens.
 */
export async function getGoogleTokens(userId: string): Promise<StoredTokens | null> {
    const db = getDB();

    const { data, error } = await db
        .from('google_tokens')
        .select('access_token, refresh_token, expiry_date, connected_at, user_id, organization_id')
        .eq('user_id', userId)
        .limit(1)
        .single();

    if (error || !data) return null;

    // Check if access token is expired (with 5 min buffer)
    const isExpired = data.expiry_date && Date.now() > (data.expiry_date - 5 * 60 * 1000);

    if (isExpired && data.refresh_token) {
        // Auto-refresh
        try {
            const oauth2Client = getOAuth2Client();
            oauth2Client.setCredentials({ refresh_token: data.refresh_token });
            const { credentials } = await oauth2Client.refreshAccessToken();

            // Save new tokens
            await saveGoogleTokens(userId, data.organization_id, {
                access_token: credentials.access_token,
                refresh_token: credentials.refresh_token || data.refresh_token,
                expiry_date: credentials.expiry_date,
            });

            return {
                access_token: credentials.access_token || data.access_token,
                refresh_token: credentials.refresh_token || data.refresh_token,
                expiry_date: credentials.expiry_date || null,
                connected_at: data.connected_at,
            };
        } catch (err) {
            const msg = (err as Error).message || '';
            console.error('[google-tokens] Failed to refresh access token:', msg);
            // If the refresh token itself is invalid/revoked, clear stored tokens
            // so the user is forced to reconnect cleanly.
            if (msg.includes('invalid_grant')) {
                await db.from('google_tokens').delete().eq('user_id', userId);
                return null;
            }
            // Transient failure — keep tokens, let caller retry
            return {
                access_token: data.access_token,
                refresh_token: data.refresh_token,
                expiry_date: data.expiry_date,
                connected_at: data.connected_at,
            };
        }
    }

    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expiry_date: data.expiry_date,
        connected_at: data.connected_at,
    };
}

/**
 * Check if a user has Google connected.
 */
export async function isGoogleConnected(userId: string): Promise<boolean> {
    const db = getDB();
    const { data } = await db
        .from('google_tokens')
        .select('id')
        .eq('user_id', userId)
        .limit(1);
    return !!(data && data.length > 0);
}

/**
 * Delete stored Google tokens (disconnect).
 */
export async function deleteGoogleTokens(userId: string): Promise<void> {
    const db = getDB();
    await db.from('google_tokens').delete().eq('user_id', userId);
}

/**
 * Get an authenticated OAuth2 client for a user, auto-refreshing as needed.
 * Returns null if no tokens stored.
 */
export async function getAuthenticatedClientForUser(userId: string) {
    const tokens = await getGoogleTokens(userId);
    if (!tokens) return null;

    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || undefined,
    });
    return { oauth2Client, connectedAt: tokens.connected_at };
}
