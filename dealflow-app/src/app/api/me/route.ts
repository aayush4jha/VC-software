import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { verifyRequestUser } from '@/lib/api-auth';
import { isSuperAdmin } from '@/lib/permissions';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

export async function GET(request: NextRequest) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        return NextResponse.json({ profile: null }, { status: 500 });
    }

    // This route provisions the super-admin's profile on first login, so it
    // verifies the token rather than requiring an existing membership row.
    // Verification is the part that matters: the identity used to come from an
    // unchecked base64 decode, so any forged token naming the super-admin
    // email was handed an admin profile.
    const user = await verifyRequestUser(request);
    if (!user) {
        return NextResponse.json({ profile: null }, { status: 401 });
    }
    const userId = user.id;
    const email = user.email ?? undefined;

    const db = createServiceClient(supabaseUrl, serviceRoleKey);

    // ── Ensure organization row exists (service role bypasses RLS) ──
    const { data: orgExists } = await db
        .from('organizations').select('id').eq('id', ORGANIZATION_ID).single();
    if (!orgExists) {
        await db.from('organizations').upsert({
            id: ORGANIZATION_ID,
            name: 'Dholakia Ventures',
            slug: 'dholakia-ventures',
        }, { onConflict: 'id' });
    }

    // Primary lookup: by auth UID
    const { data: byId } = await db
        .from('profiles').select('*').eq('id', userId).single();

    if (byId) {
        const superAdmin = isSuperAdmin(email);
        // Ensure DB profile has organization_id and correct admin role
        const needsUpdate =
            !byId.organization_id ||
            (superAdmin && byId.role !== 'admin');
        if (needsUpdate) {
            await db.from('profiles').update({
                organization_id: ORGANIZATION_ID,
                ...(superAdmin ? { role: 'admin' } : {}),
            }).eq('id', userId);
        }
        const profile = superAdmin
            ? { ...byId, role: 'admin', organization_id: ORGANIZATION_ID }
            : { ...byId, organization_id: byId.organization_id || ORGANIZATION_ID };
        return NextResponse.json({ profile });
    }

    // Fallback: by email (handles UUID mismatch from manually-created profiles)
    const { data: byEmail } = email
        ? await db.from('profiles').select('*').eq('email', email).single()
        : { data: null };

    // For the super-admin email, guarantee admin access and create a real
    // DB profile with the auth UID so that RLS policies (which join on auth.uid())
    // work correctly when fetchAllData runs on the client.
    if (isSuperAdmin(email)) {
        const source = byEmail || byId;
        const profileData = {
            id: userId,
            email,
            name: source?.name || email,
            avatar_url: source?.avatar_url || null,
            role: 'admin',
            organization_id: ORGANIZATION_ID,
        };

        if (!byId) {
            // Try inserting a profile with the auth UID.
            const { error: insertErr } = await db.from('profiles').insert(profileData);

            if (insertErr) {
                // Insert failed (probably email unique-constraint with old UUID row).
                // Update the existing row's id to the auth UID so RLS works.
                await db.from('profiles').update({ id: userId, role: 'admin', organization_id: ORGANIZATION_ID }).eq('email', email);
            }
        }

        return NextResponse.json({ profile: profileData });
    }

    if (byEmail) {
        // Ensure org_id is set for non-super-admin users too
        if (!byEmail.organization_id) {
            await db.from('profiles').update({ organization_id: ORGANIZATION_ID }).eq('id', byEmail.id);
            byEmail.organization_id = ORGANIZATION_ID;
        }
        return NextResponse.json({ profile: byEmail });
    }

    return NextResponse.json({ profile: null });
}
