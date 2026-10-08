import { NextResponse } from 'next/server';

// Always answered by the deployment that is actually running, never cached.
export const dynamic = 'force-dynamic';

/**
 * GET — which build is serving right now.
 *
 * A browser tab holds the JavaScript it was loaded with. Across a deploy that
 * bundle keeps running, and the person sees an interface that no longer
 * matches the code — a feature that shipped is simply absent, with nothing on
 * screen to explain it. Comparing this against the SHA baked into the bundle
 * is how the tab finds out.
 */
export async function GET() {
    return NextResponse.json({
        sha: process.env.VERCEL_GIT_COMMIT_SHA || 'dev',
        builtAt: process.env.VERCEL_DEPLOYMENT_ID || null,
    });
}
