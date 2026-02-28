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
    const roleParam = searchParams.get('role');   // null = direct login (not an invite link)
    const role = roleParam || 'analyst';
    const next = searchParams.get('next') ?? '/';

    if (code) {
        const supabase = await createClient();
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error && data.session) {
            const user = data.session.user;

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
                } else if (user.email) {
                    // 2. Fallback: look up by email — handles profiles that were manually
                    //    created in Supabase with a different UUID than the auth UID
                    const { data: profileByEmail } = await serviceClient
                        .from('profiles')
                        .select('id, role')
                        .eq('email', user.email)
                        .single();

                    if (profileByEmail) {
                        existingProfileId = profileByEmail.id;
                        existingRole = profileByEmail.role;
                    }
                }

                const isSuperAdmin = user.email === SUPER_ADMIN_EMAIL;

                // Block users who have no profile at all and are not from an invite link.
                // Super-admin is always allowed through — their profile is auto-created below.
                if (!existingRole && !roleParam && !isSuperAdmin) {
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
                        ...(isSuperAdmin ? { role: 'admin' } : {}),
                    }).eq('id', existingProfileId);
                } else {
                    // No existing profile — create one.
                    // Super-admin gets admin role; invited users get the role from the link.
                    await serviceClient.from('profiles').insert({
                        id: user.id,
                        email: user.email,
                        name,
                        avatar_url: avatarUrl,
                        role: isSuperAdmin ? 'admin' : role,
                        organization_id: ORGANIZATION_ID,
                    });
                }
            }

            return NextResponse.redirect(`${origin}${next}`);
        }
    }

    return NextResponse.redirect(`${origin}/login?error=auth`);
}
