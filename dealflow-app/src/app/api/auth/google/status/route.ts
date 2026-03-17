import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isGoogleConnected, deleteGoogleTokens } from '@/lib/google-tokens';

async function getSupabaseUser(request: NextRequest) {
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

export async function GET(request: NextRequest) {
    try {
        const user = await getSupabaseUser(request);
        if (!user) {
            return NextResponse.json({ connected: false });
        }

        const connected = await isGoogleConnected(user.id);
        return NextResponse.json({ connected });
    } catch {
        return NextResponse.json({ connected: false });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const user = await getSupabaseUser(request);
        if (user) {
            await deleteGoogleTokens(user.id);
        }

        const response = NextResponse.json({ disconnected: true });
        // Clear the marker cookie
        response.cookies.delete('google_connected');
        // Clear legacy cookies if any
        response.cookies.delete('google_access_token');
        response.cookies.delete('google_refresh_token');
        response.cookies.delete('google_connected_at');
        return response;
    } catch {
        return NextResponse.json({ error: 'Failed to disconnect' }, { status: 500 });
    }
}
