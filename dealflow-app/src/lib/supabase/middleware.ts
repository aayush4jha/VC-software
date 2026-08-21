import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Always grants admin access on every request, regardless of DB state.
const SUPER_ADMIN_EMAIL = 'aayush4jha@gmail.com';

// Hard cap on any single Supabase network call in middleware. Without this, a
// slow/paused/unreachable Supabase makes the fetch hang until Vercel kills the
// whole request → 504 MIDDLEWARE_INVOCATION_TIMEOUT. Failing fast lets us
// degrade gracefully (treat as unauthenticated) instead of taking the site down.
const SUPABASE_TIMEOUT_MS = 5000;

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
                    cookiesToSet.forEach(({ name, value, options }) =>
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

    const user = await withTimeout(
        (async () => {
            try {
                const { data } = await supabase.auth.getUser();
                return data.user;
            } catch {
                return null;
            }
        })(),
        null
    );
    const pathname = request.nextUrl.pathname;

    // Public paths that don't need auth
    const publicPaths = ['/login', '/auth/callback', '/api/', '/book'];
    const isPublic = publicPaths.some(p => pathname.startsWith(p));

    if (!user && !isPublic) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        return NextResponse.redirect(url);
    }

    // If logged in user visits /login, redirect to home
    if (user && pathname === '/login') {
        const url = request.nextUrl.clone();
        url.pathname = '/';
        return NextResponse.redirect(url);
    }

    // Page-level permission protection
    // Map routes to permission keys
    const routePermissionMap: Record<string, string> = {
        '/admin': 'admin',
        '/settings': 'settings',
        '/dealflow': 'dealflow',
        '/portfolio': 'portfolio',
        '/fund': 'fund',
        '/analytics': 'analytics',
        '/contacts': 'contacts',
        '/emails': 'emails',
        '/pipeline-analytics': 'pipeline-analytics',
        '/audit-trail': 'audit-trail',
        '/news': 'news',
    };

    const matchedPermission = Object.entries(routePermissionMap).find(
        ([route]) => pathname.startsWith(route)
    );

    if (user && matchedPermission) {
        const requiredPermission = matchedPermission[1];

        // Super-admin email always has access — no DB lookup needed.
        const isSuperAdmin = user.email === SUPER_ADMIN_EMAIL;

        if (!isSuperAdmin) {
            // Use service role key so RLS never blocks this check
            const serviceClient = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY);
            const profileById = await withTimeout(
                (async () => {
                    try {
                        const { data } = await serviceClient
                            .from('profiles')
                            .select('role, permissions')
                            .eq('id', user.id)
                            .single();
                        return data;
                    } catch {
                        return null;
                    }
                })(),
                null
            );

            let hasAccess = false;

            if (profileById) {
                const permissions = profileById.permissions as string[] | null;
                if (permissions && permissions.length > 0) {
                    hasAccess = permissions.includes(requiredPermission);
                } else {
                    // Backward compat: if no permissions set, use role-based defaults
                    hasAccess = profileById.role === 'admin' ||
                        (profileById.role === 'partner' && !['admin', 'settings'].includes(requiredPermission)) ||
                        (profileById.role === 'analyst' && !['admin', 'settings'].includes(requiredPermission));
                }
            }

            // Email fallback for UUID mismatch
            if (!hasAccess && user.email) {
                const profileByEmail = await withTimeout(
                    (async () => {
                        try {
                            const { data } = await serviceClient
                                .from('profiles')
                                .select('role, permissions')
                                .eq('email', user.email)
                                .single();
                            return data;
                        } catch {
                            return null;
                        }
                    })(),
                    null
                );

                if (profileByEmail) {
                    const permissions = profileByEmail.permissions as string[] | null;
                    if (permissions && permissions.length > 0) {
                        hasAccess = permissions.includes(requiredPermission);
                    } else {
                        hasAccess = profileByEmail.role === 'admin' ||
                            (profileByEmail.role === 'partner' && !['admin', 'settings'].includes(requiredPermission)) ||
                            (profileByEmail.role === 'analyst' && !['admin', 'settings'].includes(requiredPermission));
                    }
                }
            }

            if (!hasAccess) {
                const url = request.nextUrl.clone();
                url.pathname = '/';
                return NextResponse.redirect(url);
            }
        }
    }

    return supabaseResponse;
}
