import { NextRequest, NextResponse } from 'next/server';
import { requireMember } from '@/lib/api-auth';
import { listSubpages, isLivePage, notesDb, missingTable, NEEDS_MIGRATION, actorName, ORGANIZATION_ID } from '@/lib/server/company-notes';

/**
 * GET ?companyId= — the company's Notes page, the pages beneath it (the list,
 * and each one's text), and its comment thread. A page nobody has written yet
 * comes back empty, not missing.
 */
export async function GET(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const db = notesDb();
    if (!db) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const companyId = new URL(request.url).searchParams.get('companyId');
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 });

    const [pages, comments, list] = await Promise.all([
        db.from('company_note_pages').select('kind, content, updated_by_name, updated_at').eq('company_id', companyId),
        db.from('company_note_comments').select('id, author_id, author_name, body, attachments, created_at')
            .eq('company_id', companyId).order('created_at'),
        listSubpages(db, companyId),
    ]);
    const error = pages.error?.message || comments.error?.message || list.error;
    if (error) {
        if (missingTable(error)) return NextResponse.json(NEEDS_MIGRATION);
        return NextResponse.json({ error }, { status: 500 });
    }

    const byKind = Object.fromEntries((pages.data || []).map(p => [p.kind, p]));
    return NextResponse.json({
        subpages: list.subpages,
        pages: Object.fromEntries(['notes', ...list.subpages.map(p => p.key)].map(kind => [kind, {
            content: byKind[kind]?.content ?? null,
            updatedByName: byKind[kind]?.updated_by_name ?? null,
            updatedAt: byKind[kind]?.updated_at ?? null,
        }])),
        comments: (comments.data || []).map(c => ({
            id: c.id, authorId: c.author_id, authorName: c.author_name,
            body: c.body, attachments: c.attachments || [], createdAt: c.created_at,
        })),
        me: auth.actor.userId,
    });
}

/**
 * PUT { companyId, kind, content, baseUpdatedAt } — saves one page.
 *
 * baseUpdatedAt is when the page was last saved as the editor loaded it. If it
 * has been saved since, by someone else, the save is refused with the newer
 * version, so the person can choose rather than overwrite unseen work.
 */
export async function PUT(request: NextRequest) {
    const auth = await requireMember(request);
    if (auth.response) return auth.response;
    const db = notesDb();
    if (!db) return NextResponse.json({ error: 'Server config missing' }, { status: 500 });

    const { companyId, kind, content, baseUpdatedAt, force } = await request.json();
    if (!companyId || typeof kind !== 'string' || typeof content !== 'object' || content === null) {
        return NextResponse.json({ error: 'companyId, kind and content are required' }, { status: 400 });
    }
    if (!(await isLivePage(db, companyId, kind))) {
        return NextResponse.json({ error: 'This page has been deleted' }, { status: 404 });
    }

    const { data: current, error: readError } = await db.from('company_note_pages')
        .select('content, updated_by_name, updated_at').eq('company_id', companyId).eq('kind', kind).maybeSingle();
    if (readError) {
        if (missingTable(readError.message)) return NextResponse.json(NEEDS_MIGRATION, { status: 503 });
        return NextResponse.json({ error: readError.message }, { status: 500 });
    }
    // Compared as instants: Postgres hands back "+00:00" where we wrote "Z".
    const sameVersion = !!baseUpdatedAt && new Date(current?.updated_at).getTime() === new Date(baseUpdatedAt).getTime();
    if (current && !force && !sameVersion) {
        return NextResponse.json({
            conflict: true,
            content: current.content, updatedByName: current.updated_by_name, updatedAt: current.updated_at,
        }, { status: 409 });
    }

    const updatedAt = new Date().toISOString();
    const name = await actorName(db, auth.actor);
    const { error } = await db.from('company_note_pages').upsert({
        organization_id: ORGANIZATION_ID, company_id: companyId, kind, content,
        updated_by: auth.actor.userId, updated_by_name: name, updated_at: updatedAt,
    }, { onConflict: 'company_id,kind' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ updatedAt, updatedByName: name });
}
