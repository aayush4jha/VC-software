import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { requireAdmin, invalidateAuthCache } from '@/lib/api-auth';
import { isSuperAdmin } from '@/lib/permissions';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Remove a team member and every access they hold.
 *
 * Deleting the profile row alone would only hide them from the UI — their
 * Supabase login would still work and the session cookie in their browser
 * would still carry a valid token. So this also deletes the auth user, which
 * is what actually ends their sessions, and clears any outstanding invite so
 * the address cannot simply register again.
 */
export async function POST(request: NextRequest) {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
        return NextResponse.json({ error: 'Server config missing' }, { status: 500 });
    }

    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;
    const actor = auth.actor;

    const { userId } = (await request.json()) as { userId?: string };
    if (!userId) {
        return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    if (userId === actor.userId) {
        return NextResponse.json(
            { error: 'You cannot remove yourself. Ask another admin to do it.' },
            { status: 400 },
        );
    }

    const db = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: target, error: lookupError } = await db
        .from('profiles')
        .select('id, email, name')
        .eq('id', userId)
        .maybeSingle();

    if (lookupError) {
        return NextResponse.json({ error: lookupError.message }, { status: 500 });
    }
    if (!target) {
        return NextResponse.json({ error: 'That team member no longer exists.' }, { status: 404 });
    }
    if (isSuperAdmin(target.email)) {
        return NextResponse.json(
            { error: 'The owner account cannot be removed.' },
            { status: 400 },
        );
    }

    // Hand back anything assigned to them rather than deleting the deal.
    await db.from('companies').update({ analyst_id: null }).eq('analyst_id', userId);

    // comments.author_id and activity_logs.user_id are declared NOT NULL with
    // ON DELETE SET NULL, a combination Postgres cannot satisfy — the profile
    // delete below fails outright unless these rows go first. audit_logs and
    // company_notes are nullable, so the trail of who did what survives.
    await db.from('comments').delete().eq('author_id', userId);
    await db.from('activity_logs').delete().eq('user_id', userId);

    // Cascading rows (notifications, saved_views, booking_tokens) go with the
    // profile; these two are keyed by email / auth id instead.
    if (target.email) {
        await db.from('pending_invites').delete().eq('email', target.email.toLowerCase());
    }
    await db.from('google_tokens').delete().eq('user_id', userId);

    const { error: profileError } = await db.from('profiles').delete().eq('id', userId);
    if (profileError) {
        return NextResponse.json(
            { error: `Could not remove the profile: ${profileError.message}` },
            { status: 500 },
        );
    }

    // Revoke the login itself. Their existing JWT stops verifying as soon as
    // the auth user is gone, which is what closes any session already open.
    let authDeleted = true;
    let authError: string | null = null;
    const { error: deleteAuthError } = await db.auth.admin.deleteUser(userId);
    if (deleteAuthError) {
        // Profiles created by hand can carry a different UUID than the auth
        // user; fall back to matching on the verified email address.
        let recovered = false;
        if (target.email) {
            const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
            const match = list?.users.find(
                u => u.email?.toLowerCase() === target.email!.toLowerCase(),
            );
            if (match) {
                const { error: secondTry } = await db.auth.admin.deleteUser(match.id);
                recovered = !secondTry;
                if (secondTry) authError = secondTry.message;
            }
        }
        if (!recovered) {
            authDeleted = false;
            authError = authError || deleteAuthError.message;
        }
    }

    // Drop cached token verifications so the removal takes effect at once
    // rather than at the end of the cache window.
    invalidateAuthCache();

    return NextResponse.json({
        success: true,
        authDeleted,
        // Surfaced so the admin knows the login may linger if this failed —
        // the profile is gone either way, and no profile means no access.
        authError,
        removed: { id: target.id, name: target.name, email: target.email },
    });
}
