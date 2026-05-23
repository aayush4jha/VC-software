import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

// This email is always granted admin access, regardless of what is stored in the DB.
// It will be created automatically on first login if no profile exists yet.
const SUPER_ADMIN_EMAIL = 'aayush4jha@gmail.com';

export async function GET(request: Request) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get('code');
    const next = searchParams.get('next') ?? '/';

    if (code) {
        const supabase = await createClient();
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error && data.session) {
            const user = data.session.user;
            const userEmail = user.email ? user.email.toLowerCase() : null;

            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

            if (supabaseUrl && serviceRoleKey) {
                const serviceClient = createServiceClient(supabaseUrl, serviceRoleKey);

                // 1. Try looking up profile by auth UID (the normal case)
                let existingProfileId: string | null = null;
                let existingRole: string | null = null;

                const { data: profileById } = await serviceClient
                    .from('profiles')
                    .select('id, role')
                    .eq('id', user.id)
                    .single();

                if (profileById) {
                    existingProfileId = profileById.id;
                    existingRole = profileById.role;
                } else if (userEmail) {
                    // 2. Fallback: look up by email — handles profiles that were manually
                    //    created in Supabase with a different UUID than the auth UID
                    const { data: profileByEmail } = await serviceClient
                        .from('profiles')
                        .select('id, role')
                        .eq('email', userEmail)
                        .single();

                    if (profileByEmail) {
                        existingProfileId = profileByEmail.id;
                        existingRole = profileByEmail.role;
                    }
                }

                const isSuperAdmin = userEmail === SUPER_ADMIN_EMAIL;

                // 3. Check the server-side allowlist (pending_invites). This is the
                //    sole source of truth for whether an unknown email may register —
                //    URL params are no longer trusted, so anyone hitting /login
                //    without a real invite (or existing profile) is rejected.
                let pendingRole: string | null = null;
                let pendingPermissions: string[] = [];
                if (!existingRole && !isSuperAdmin && userEmail) {
                    const { data: invite } = await serviceClient
                        .from('pending_invites')
                        .select('role, permissions')
                        .eq('email', userEmail)
                        .single();

                    if (invite) {
                        pendingRole = invite.role;
                        pendingPermissions = Array.isArray(invite.permissions) ? invite.permissions : [];
                    }
                }

                // Block users with no profile, no pending invite, and not the super-admin.
                if (!existingRole && !pendingRole && !isSuperAdmin) {
                    await supabase.auth.signOut();
                    return NextResponse.redirect(`${origin}/login?error=unauthorized`);
                }

                const name =
                    user.user_metadata?.full_name ||
                    user.user_metadata?.name ||
                    user.email ||
                    '';

                const avatarUrl =
                    user.user_metadata?.avatar_url ||
                    user.user_metadata?.picture ||
                    null;

                if (existingProfileId) {
                    // Profile already exists (found by ID or email fallback).
                    // Refresh display fields. Also ensure the super-admin email always
                    // retains admin role even if it was manually changed in the DB.
                    await serviceClient.from('profiles').update({
                        name,
                        avatar_url: avatarUrl,
                        organization_id: ORGANIZATION_ID,
                        ...(isSuperAdmin ? { role: 'admin' } : {}),
                    }).eq('id', existingProfileId);
                } else {
                    // No existing profile — create one using the server-trusted invite,
                    // or admin defaults for the super-admin.
                    await serviceClient.from('profiles').insert({
                        id: user.id,
                        email: user.email,
                        name,
                        avatar_url: avatarUrl,
                        role: isSuperAdmin ? 'admin' : (pendingRole || 'analyst'),
                        permissions: isSuperAdmin ? [] : pendingPermissions,
                        organization_id: ORGANIZATION_ID,
                    });

                    // Consume the invite so it cannot be reused.
                    if (pendingRole && userEmail) {
                        await serviceClient
                            .from('pending_invites')
                            .delete()
                            .eq('email', userEmail);
                    }
                }
            }

            return NextResponse.redirect(`${origin}${next}`);
        }
    }

    return NextResponse.redirect(`${origin}/login?error=auth`);
}
