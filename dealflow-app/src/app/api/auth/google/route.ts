import { NextRequest, NextResponse } from 'next/server';
import { getAuthUrl } from '@/lib/google';
import { requireMember } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
    // Starting the Google link flow is a member action — the resulting tokens
    // are stored against whoever completes the callback.
    const auth = await requireMember(request);
    if (auth.response) return auth.response;

    try {
        const url = getAuthUrl(request);
        return NextResponse.json({ url });
    } catch (error) {
        console.error('Error generating auth URL:', error);
        return NextResponse.json({ error: 'Failed to generate auth URL' }, { status: 500 });
    }
}
