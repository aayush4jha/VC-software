import { NextRequest, NextResponse } from 'next/server';
import { requireMember } from '@/lib/api-auth';
import { listSubpages, notesDb, missingTable, NEEDS_MIGRATION, ORGANIZATION_ID } from '@/lib/server/company-notes';

const cleanTitle = (t: unknown) => (typeof t === 'string' ? t.trim().slice(0, 120) : '');

/** POST { companyId, title } — adds a page at the end of the company's list. */
export async function POST(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const db = notesDb();
    if (!db) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const { companyId, title } = await request.json();
    const name = cleanTitle(title) || 'Untitled';
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 });

    // Brief and Detailed first, if this is the company's first look at its notes.
    const list = await listSubpages(db, companyId);
    if (list.error) {
        if (missingTable(list.error)) return NextResponse.json(NEEDS_MIGRATION, { status: 503 });
        return NextResponse.json({ error: list.error }, { status: 500 });
    }
    const { data: last } = await db.from('company_note_subpages').select('position')
        .eq('company_id', companyId).order('position', { ascending: false }).limit(1).maybeSingle();

    const key = crypto.randomUUID();
    const { error } = await db.from('company_note_subpages').insert({
        organization_id: ORGANIZATION_ID, company_id: companyId, key, title: name,
        position: (last?.position ?? -1) + 1, created_by: auth.actor.userId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await db.from('activity_logs').insert({
        company_id: companyId, user_id: auth.actor.userId,
        action: 'note_page_created', details: `Created note page "${name}"`,
    });
    return NextResponse.json({ subpage: { key, title: name } });
}

/** PATCH { companyId, key, title } — renames a page. */
export async function PATCH(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const db = notesDb();
    if (!db) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const { companyId, key, title } = await request.json();
    const name = cleanTitle(title);
    if (!companyId || !key || !name) return NextResponse.json({ error: 'companyId, key and title are required' }, { status: 400 });

    const { data, error } = await db.from('company_note_subpages').update({ title: name })
        .eq('company_id', companyId).eq('key', key).is('deleted_at', null).select('key').maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'This page has been deleted' }, { status: 404 });
    return NextResponse.json({ subpage: { key, title: name } });
}

/**
 * DELETE ?companyId=&key= — deletes a page and what was written in it. The
 * list keeps a marked row (see the migration); the text itself is removed.
 */
export async function DELETE(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const db = notesDb();
    if (!db) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const params = new URL(request.url).searchParams;
    const companyId = params.get('companyId');
    const key = params.get('key');
    if (!companyId || !key) return NextResponse.json({ error: 'companyId and key are required' }, { status: 400 });

    const { data, error } = await db.from('company_note_subpages').update({ deleted_at: new Date().toISOString() })
        .eq('company_id', companyId).eq('key', key).is('deleted_at', null).select('title').maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'This page has already been deleted' }, { status: 404 });

    await db.from('company_note_pages').delete().eq('company_id', companyId).eq('kind', key);
    await db.from('activity_logs').insert({
        company_id: companyId, user_id: auth.actor.userId,
        action: 'note_page_deleted', details: `Deleted note page "${data.title}"`,
    });
    return NextResponse.json({ ok: true });
}
