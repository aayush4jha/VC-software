'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export type NotesPage = 'notes' | 'brief' | 'detailed';

/**
 * Opens and closes a company's notes dialog, over whatever page you are on.
 *
 * The dialog lives in the address (?notes=<company>&notesPage=brief) rather
 * than in memory, so Back closes it or steps out of a sub-page, and a link to
 * a company's Detailed Note can be sent to someone. Other query parameters on
 * the page are kept.
 *
 * The query is read when a button is pressed, not while rendering: a hook that
 * reads it during render must sit inside a Suspense boundary on every page
 * that uses it, and the Notes buttons are on cards across the app.
 */
export function useOpenNotes() {
    const router = useRouter();
    const pathname = usePathname();

    const open = useCallback((companyId: string | null, page: NotesPage = 'notes') => {
        const next = new URLSearchParams(window.location.search);
        next.delete('notes');
        next.delete('notesPage');
        if (companyId) {
            next.set('notes', companyId);
            if (page !== 'notes') next.set('notesPage', page);
        }
        const query = next.toString();
        router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }, [router, pathname]);

    return { open, close: useCallback(() => open(null), [open]) };
}

/** Which company's notes the address asks for, and which page. For the dialog, under Suspense. */
export function useNotesInUrl(): { companyId: string | null; page: NotesPage } {
    const params = useSearchParams();
    const page = params.get('notesPage');
    return {
        companyId: params.get('notes'),
        page: page === 'brief' || page === 'detailed' ? page : 'notes',
    };
}
