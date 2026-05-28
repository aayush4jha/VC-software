'use client';

import { useEffect } from 'react';

/**
 * Close-on-Escape for modals and side panels. Attaches a keydown listener
 * whenever `active` is true and calls `onEscape` when the Escape key fires.
 *
 * Multiple components calling this at once is fine — each component's
 * handler runs in capture order; if a modal is the topmost open one,
 * its handler closes it and re-renders unmount it before the next layer
 * sees the event.
 */
export function useEscapeKey(active: boolean, onEscape: () => void): void {
    useEffect(() => {
        if (!active) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onEscape();
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [active, onEscape]);
}
