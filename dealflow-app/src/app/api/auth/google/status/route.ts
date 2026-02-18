import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
    const connected = request.cookies.get('google_connected')?.value;
    const hasAccessToken = !!request.cookies.get('google_access_token')?.value;

    return NextResponse.json({
        connected: connected === 'true' && hasAccessToken,
    });
}

export async function DELETE(request: NextRequest) {
    const response = NextResponse.json({ disconnected: true });
    response.cookies.delete('google_access_token');
    response.cookies.delete('google_refresh_token');
    response.cookies.delete('google_connected');
    return response;
}
