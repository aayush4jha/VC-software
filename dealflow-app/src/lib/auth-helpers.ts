import { NextRequest } from 'next/server';
import { authenticateRequest } from '@/lib/api-auth';

/**
 * The current caller of a route handler, or null when they are not a signed-in
 * member of this workspace.
 *
 * Membership — not merely a valid Supabase login — is the bar. Anyone can get a
 * token from a public Supabase project, so "authenticated" on its own was never
 * evidence of being on this team; the profile row is. Every existing caller
 * already treats null as 401, so tightening the definition here closes the gap
 * across all of them at once.
 */
export async function getRouteUser(request: NextRequest): Promise<{ id: string; email: string | null } | null> {
    const actor = await authenticateRequest(request);
    if (!actor) return null;
    return { id: actor.userId, email: actor.email };
}
