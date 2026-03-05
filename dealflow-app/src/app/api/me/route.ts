import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

// This email always gets admin role regardless of what is stored in the DB.
const SUPER_ADMIN_EMAIL = 'aayush4jha@gmail.com';

// Decode JWT payload locally — no network call needed.
function parseJwt(token: string): Record<string, unknown> | null {
    try {
        const payload = token.split('.')[1];
        return JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    } catch {
        return null;
    }
}

export async function GET(request: NextRequest) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        return NextResponse.json({ profile: null }, { status: 500 });
    }

    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return NextResponse.json({ profile: null }, { status: 401 });
    }

    const jwt = parseJwt(authHeader.slice(7));
    const userId = jwt?.sub as string | undefined;
    const email = jwt?.email as string | undefined;

    if (!userId) {
        return NextResponse.json({ profile: null }, { status: 401 });
    }

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
        const isSuperAdmin = email === SUPER_ADMIN_EMAIL;
        // Ensure DB profile has organization_id and correct admin role
        const needsUpdate =
            !byId.organization_id ||
            (isSuperAdmin && byId.role !== 'admin');
        if (needsUpdate) {
            await db.from('profiles').update({
                organization_id: ORGANIZATION_ID,
                ...(isSuperAdmin ? { role: 'admin' } : {}),
            }).eq('id', userId);
        }
        const profile = isSuperAdmin
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
    if (email === SUPER_ADMIN_EMAIL) {
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
