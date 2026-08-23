import { NextRequest, NextResponse } from 'next/server';
import { isGoogleConnected, deleteGoogleTokens } from '@/lib/google-tokens';
import { getRouteUser } from '@/lib/auth-helpers';

export async function GET(request: NextRequest) {
    try {
        const user = await getRouteUser(request);
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
        const user = await getRouteUser(request);
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
