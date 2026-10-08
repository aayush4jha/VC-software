import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { hasAnyPermission, isSuperAdmin, permissionsForRoute } from '@/lib/permissions';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Hard cap on any single Supabase network call in middleware. Without this, a
// slow/paused/unreachable Supabase makes the fetch hang until Vercel kills the
// whole request → 504 MIDDLEWARE_INVOCATION_TIMEOUT. Failing fast lets us
// degrade gracefully (treat as unauthenticated) instead of taking the site down.
const SUPABASE_TIMEOUT_MS = 5000;

// A timed-out lookup is "unknown", not "denied" — see the handling below.
const TIMED_OUT = Symbol('timed-out');

interface ProfileRow {
    role: string | null;
    permissions: string[] | null;
}

async function withTimeout<T>(promise: Promise<T>, fallback: T): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), SUPABASE_TIMEOUT_MS);
    });
    try {
        return await Promise.race([promise, timeout]);
    } catch {
        return fallback;
    } finally {
        if (timer) clearTimeout(timer);
    }
}

// API routes that are deliberately reachable without a session: the founder-
// facing booking flow (authorised by a one-time token in the URL) and the
// OAuth callbacks, which establish the session in the first place. Every
// other route under /api requires a signed-in member — and re-checks that
// for itself, since middleware is a gate, not the guard.
//
// Two callers can never hold a session, so each route authenticates itself:
//   /api/whatsapp/webhook — Meta. Verified by the X-Hub-Signature-256 HMAC.
//   /api/cron/            — Vercel Cron. Verified by the CRON_SECRET bearer,
//                           and refuses to run at all when it is unset.
//   /api/version          — which build is serving. It holds nothing but a
//                           commit hash, and has to be readable without a
//                           session: every other API path answers 401 whether
//                           or not it exists, so there was no way to tell a
//                           deployed build from a failed one from outside.
const PUBLIC_API_PATHS = [
    '/api/calendar/book', '/api/calendar/slots', '/api/auth/google/callback',
    '/api/whatsapp/webhook', '/api/cron/', '/api/version',
];

function isPublicApi(pathname: string): boolean {
    return PUBLIC_API_PATHS.some(p => pathname === p || pathname.startsWith(p));
}

// Every navigation re-ran the profile lookup (and, on a UUID mismatch, a
// second one by email) before any HTML was sent — two serial round trips to
// Supabase on the critical path of each page.
//
// The TTL is deliberately short. Access removal clears the API-layer cache
// directly, but middleware may run in a separate isolate that the clear
// cannot reach, so this window is the longest a just-removed account could
// still be handed a page shell. It cannot load data: every API route
// re-authorises independently.
const PROFILE_TTL_MS = 15_000;
const PROFILE_CACHE_MAX = 500;
const middlewareProfileCache = new Map<string, { profile: ProfileRow | null; expires: number }>();

function cachedProfile(key: string): ProfileRow | null | undefined {
    const hit = middlewareProfileCache.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
        middlewareProfileCache.delete(key);
        return undefined;
    }
    return hit.profile;
}

function cacheProfile(key: string, profile: ProfileRow | null) {
    if (middlewareProfileCache.size >= PROFILE_CACHE_MAX) {
        const oldest = middlewareProfileCache.keys().next();
        if (!oldest.done) middlewareProfileCache.delete(oldest.value);
    }
    middlewareProfileCache.set(key, { profile, expires: Date.now() + PROFILE_TTL_MS });
}

export async function updateSession(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request });

    const supabase = createServerClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
                    supabaseResponse = NextResponse.next({ request });
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    const lookup = await withTimeout<
        { id: string; email: string | null } | null | typeof TIMED_OUT
    >(
        (async () => {
            try {
                const { data } = await supabase.auth.getUser();
                return data.user ? { id: data.user.id, email: data.user.email ?? null } : null;
            } catch {
                return null;
            }
        })(),
        TIMED_OUT,
    );

    const timedOut = lookup === TIMED_OUT;
    const user = timedOut ? null : lookup;
    const pathname = request.nextUrl.pathname;
    const isApi = pathname.startsWith('/api/');

    // ── API routes ──
    // These used to be exempt from middleware entirely. They now need a
    // session, answered with a 401 rather than a redirect so fetch() callers
    // see the failure instead of a login page's HTML. A timed-out lookup is
    // passed through: every route verifies the caller itself, so a Supabase
    // hiccup must not turn into a wall of spurious 401s.
    if (isApi) {
        if (isPublicApi(pathname) || timedOut) return supabaseResponse;
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        return supabaseResponse;
    }

    // ── Pages ──
    // /auth/callback and /book are reachable by anyone; the callback is what
    // establishes the session in the first place, and /book is the founder-
    // facing scheduling page.
    if (pathname.startsWith('/auth/callback') || pathname === '/book' || pathname.startsWith('/book/')) {
        return supabaseResponse;
    }

    const isLoginPage = pathname === '/login';

    if (!user) {
        if (isLoginPage) return supabaseResponse;
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        url.search = '';
        return NextResponse.redirect(url);
    }

    // Super-admin email always has access — no DB lookup needed.
    if (isSuperAdmin(user.email)) {
        if (isLoginPage) {
            const url = request.nextUrl.clone();
            url.pathname = '/';
            url.search = '';
            return NextResponse.redirect(url);
        }
        return supabaseResponse;
    }

    // Service role so RLS never blocks these checks.
    const serviceClient = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const loadProfile = (column: 'id' | 'email', value: string) =>
        withTimeout<ProfileRow | null | typeof TIMED_OUT>(
            (async () => {
                try {
                    const { data } = await serviceClient
                        .from('profiles')
                        .select('role, permissions')
                        .eq(column, value)
                        .maybeSingle();
                    return data as ProfileRow | null;
                } catch {
                    return null;
                }
            })(),
            TIMED_OUT,
        );

    const cacheKey = user.id;
    let profile: ProfileRow | null | typeof TIMED_OUT | undefined = cachedProfile(cacheKey);

    if (profile === undefined) {
        profile = await loadProfile('id', user.id);
        // Email fallback for profiles created with a different UUID.
        if (profile === null && user.email) profile = await loadProfile('email', user.email);
        // A timeout is an unknown answer, not an absent profile — never cache it.
        if (profile !== TIMED_OUT) cacheProfile(cacheKey, profile);
    }

    // A slow Supabase must not log everyone out: an unknown answer falls
    // through to the page, which cannot load any data without the API layer
    // independently authorising the same request.
    if (profile === TIMED_OUT) return supabaseResponse;

    // A Supabase login is not the same thing as membership here. Without a
    // profile row the account was never granted access — or has since been
    // removed — so nothing is reachable. Staying on /login rather than
    // bouncing back to '/' is what keeps this from ping-ponging.
    if (!profile) {
        if (isLoginPage) return supabaseResponse;
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        url.search = '';
        url.searchParams.set('error', 'unauthorized');
        return NextResponse.redirect(url);
    }

    if (isLoginPage) {
        const url = request.nextUrl.clone();
        url.pathname = '/';
        url.search = '';
        return NextResponse.redirect(url);
    }

    const subject = {
        email: user.email,
        role: profile.role,
        permissions: profile.permissions,
    };

    const required = permissionsForRoute(pathname);
    if (required && !hasAnyPermission(subject, required)) {
        const url = request.nextUrl.clone();
        url.pathname = '/';
        url.search = '';
        // Tells the dashboard why it was bounced, rather than looking like a
        // stray click.
        url.searchParams.set('denied', required[0]);
        return NextResponse.redirect(url);
    }

    return supabaseResponse;
}
