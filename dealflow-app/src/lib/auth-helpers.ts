import { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Extract the current Supabase user from a route handler request.
 * Returns the user object or null if not authenticated.
 */
export async function getRouteUser(request: NextRequest) {
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll();
                },
                setAll() {},
            },
        },
    );
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}
