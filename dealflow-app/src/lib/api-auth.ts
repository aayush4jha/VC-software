import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { isAdmin, isSuperAdmin } from '@/lib/permissions';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * The caller of an API route, after their token has been *verified* with
 * Supabase and matched to a profile row.
 *
 * The routes used to identify callers by base64-decoding the JWT payload and
 * trusting its `sub`. A decode is not a verification: any string shaped like a
 * JWT was accepted, so an unauthenticated request could name any user id and
 * drive the service-role database proxy as them. Everything here goes through
 * `auth.getUser(token)`, which checks the signature against the auth server.
 */
export interface ApiActor {
    userId: string;
    email: string | null;
    role: string;
    permissions: string[];
    isAdmin: boolean;
}

interface VerifiedUser {
    id: string;
    email: string | null;
}

// Verifying a token costs a round trip to the auth server, and the client
// makes many small /api/db calls per page. A short TTL keeps that to roughly
// one verification per minute per session while still expiring promptly when
// access is revoked. Bounded so a flood of junk tokens cannot grow it without
// limit.
const TOKEN_CACHE_TTL_MS = 60_000;
const TOKEN_CACHE_MAX = 500;
const tokenCache = new Map<string, { user: VerifiedUser | null; expires: number }>();

function cacheGet(token: string): VerifiedUser | null | undefined {
    const hit = tokenCache.get(token);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
        tokenCache.delete(token);
        return undefined;
    }
    return hit.user;
}

function cacheSet(token: string, user: VerifiedUser | null) {
    if (tokenCache.size >= TOKEN_CACHE_MAX) {
        // Cheapest sane eviction: drop the oldest insertion.
        const oldest = tokenCache.keys().next();
        if (!oldest.done) tokenCache.delete(oldest.value);
    }
    tokenCache.set(token, { user, expires: Date.now() + TOKEN_CACHE_TTL_MS });
}

// Membership/permission lookups are cached the same way and for the same
// reason: /api/db is called many times per page and each call would otherwise
// add a profile query. Kept short, and dropped outright whenever a profile is
// written, so a permission change or a removal takes effect at once rather
// than at the end of the window.
const PROFILE_CACHE_TTL_MS = 30_000;
const profileCache = new Map<string, { actor: ApiActor | null; expires: number }>();

/** Clears cached verifications — call after revoking or changing access. */
export function invalidateAuthCache() {
    tokenCache.clear();
    profileCache.clear();
}

function serviceClient() {
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return null;
    return createSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

/**
 * Verify the caller's identity from an `Authorization: Bearer` header, falling
 * back to the session cookie. Returns null when neither yields a valid user.
 */
export async function verifyRequestUser(request: NextRequest): Promise<VerifiedUser | null> {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;

    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        if (!token) return null;

        const cached = cacheGet(token);
        if (cached !== undefined) return cached;

        const client = createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        try {
            const { data, error } = await client.auth.getUser(token);
            const user = error || !data.user ? null : { id: data.user.id, email: data.user.email ?? null };
            cacheSet(token, user);
            return user;
        } catch {
            cacheSet(token, null);
            return null;
        }
    }

    // Cookie-based fallback for routes hit by a browser navigation rather than
    // by fetch() with an explicit token.
    const client = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        cookies: {
            getAll() { return request.cookies.getAll(); },
            setAll() {},
        },
    });
    try {
        const { data } = await client.auth.getUser();
        return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
    } catch {
        return null;
    }
}

/**
 * Verify the caller *and* confirm they are a provisioned member of the
 * workspace. A valid Supabase login is not by itself permission to use the
 * platform — anyone can create an account against a public Supabase project,
 * so membership is what the profile row represents.
 */
export async function authenticateRequest(request: NextRequest): Promise<ApiActor | null> {
    const user = await verifyRequestUser(request);
    if (!user) return null;

    const cached = profileCache.get(user.id);
    if (cached && cached.expires > Date.now()) return cached.actor;

    const db = serviceClient();
    if (!db) return null;

    const { data: byId } = await db
        .from('profiles')
        .select('id, email, role, permissions')
        .eq('id', user.id)
        .maybeSingle();

    let profile = byId;
    if (!profile && user.email) {
        // Profiles created by hand in Supabase can carry a different UUID than
        // the auth user; the rest of the app already falls back to email.
        const { data: byEmail } = await db
            .from('profiles')
            .select('id, email, role, permissions')
            .eq('email', user.email)
            .maybeSingle();
        profile = byEmail;
    }

    const superAdmin = isSuperAdmin(user.email);

    const remember = (actor: ApiActor | null) => {
        if (profileCache.size >= TOKEN_CACHE_MAX) {
            const oldest = profileCache.keys().next();
            if (!oldest.done) profileCache.delete(oldest.value);
        }
        profileCache.set(user.id, { actor, expires: Date.now() + PROFILE_CACHE_TTL_MS });
        return actor;
    };

    if (!profile && !superAdmin) return remember(null);

    const subject = {
        email: user.email,
        role: (profile?.role as string | null) ?? (superAdmin ? 'admin' : null),
        permissions: (profile?.permissions as string[] | null) ?? [],
    };

    return remember({
        userId: user.id,
        email: user.email,
        role: subject.role ?? 'analyst',
        permissions: subject.permissions ?? [],
        isAdmin: isAdmin(subject),
    });
}

export function unauthorized(message = 'Unauthorized') {
    return NextResponse.json({ error: message }, { status: 401 });
}

export function forbidden(message = 'Forbidden') {
    return NextResponse.json({ error: message }, { status: 403 });
}

/**
 * Guard for routes that any signed-in member may use. Returns either the
 * actor or the response to send back.
 */
export async function requireMember(
    request: NextRequest,
): Promise<{ actor: ApiActor; response?: never } | { actor?: never; response: NextResponse }> {
    const actor = await authenticateRequest(request);
    if (!actor) return { response: unauthorized() };
    return { actor };
}

/** Guard for routes only an admin may use. */
export async function requireAdmin(
    request: NextRequest,
): Promise<{ actor: ApiActor; response?: never } | { actor?: never; response: NextResponse }> {
    const actor = await authenticateRequest(request);
    if (!actor) return { response: unauthorized() };
    if (!actor.isAdmin) return { response: forbidden('Admin access required') };
    return { actor };
}
