// Shared page-permission rules.
//
// One copy of the logic for the middleware (which gates page routes), the API
// layer (which gates data access) and the client nav. Anything that decides
// "may this person see X" must go through here, so a rule can never drift
// between the UI that hides a link and the server that serves the data.

// This email is always treated as an admin, even before a profile row exists.
export const SUPER_ADMIN_EMAIL = 'aayush4jha@gmail.com';

export interface PermissionSubject {
    email?: string | null;
    role?: string | null;
    permissions?: string[] | null;
}

// What a profile can reach when its `permissions` array is empty — accounts
// that predate the permissions redesign. The client applies exactly this table
// when mapping a profile, so nav, middleware and the API agree on what a
// legacy account can see.
export const DEFAULT_PERMISSIONS_BY_ROLE: Record<string, string[]> = {
    admin: ['dashboard', 'dealflow', 'portfolio', 'legal', 'fund', 'analytics', 'pipeline-analytics', 'audit-trail', 'contacts', 'emails', 'news', 'admin', 'settings'],
    partner: ['dashboard', 'dealflow', 'portfolio', 'legal', 'fund', 'analytics', 'pipeline-analytics', 'audit-trail', 'contacts', 'emails', 'news'],
    analyst: ['dashboard', 'dealflow', 'contacts', 'emails', 'news'],
};

export function defaultPermissionsForRole(role?: string | null): string[] {
    if (!role) return [];
    return DEFAULT_PERMISSIONS_BY_ROLE[role] ?? DEFAULT_PERMISSIONS_BY_ROLE.analyst;
}

export function isSuperAdmin(email?: string | null): boolean {
    return !!email && email.toLowerCase() === SUPER_ADMIN_EMAIL;
}

export function isAdmin(subject: PermissionSubject | null | undefined): boolean {
    if (!subject) return false;
    if (isSuperAdmin(subject.email)) return true;
    if (subject.role === 'admin') return true;
    return (subject.permissions || []).includes('admin');
}

// A profile with an empty `permissions` array predates the permissions
// redesign, so its access still falls back to the old role defaults. Treating
// empty as "denied" would lock existing members out; treating it as
// "everything" would hand analysts the admin page. Role defaults are the
// behaviour those accounts already had.
export function hasPermission(
    subject: PermissionSubject | null | undefined,
    permission: string,
): boolean {
    if (!subject) return false;
    if (isSuperAdmin(subject.email)) return true;

    const permissions = subject.permissions || [];
    if (permissions.length > 0) return permissions.includes(permission);

    return defaultPermissionsForRole(subject.role).includes(permission);
}

// True when the subject holds at least one of the listed permissions. Used for
// data that backs several pages — cap-table rounds feed Portfolio, Analytics
// and Legal, so holding any one of them is enough to read them.
export function hasAnyPermission(
    subject: PermissionSubject | null | undefined,
    permissions: string[],
): boolean {
    return permissions.some(p => hasPermission(subject, p));
}

// Route prefix → the permissions that open it; holding any one is enough.
// Longest prefix wins, so nested routes inherit their section's rule. `/` is
// deliberately absent: it is the redirect target for a denied page, and gating
// it would loop.
export const ROUTE_PERMISSIONS: Record<string, string[]> = {
    '/admin': ['admin'],
    '/settings': ['settings'],
    '/dealflow': ['dealflow'],
    '/portfolio': ['portfolio'],
    // Legal grew out of Portfolio and has since gained its own key; either
    // one opens it, so neither an old nor a new grant locks anyone out.
    '/legal': ['legal', 'portfolio'],
    '/fund': ['fund'],
    // Funds we invest IN, as opposed to our own entities' balances. Same
    // grant, so nobody's access has to change for the new page.
    '/fund-investments': ['fund'],
    '/analytics': ['analytics'],
    '/contacts': ['contacts'],
    '/emails': ['emails'],
    '/pipeline-analytics': ['pipeline-analytics'],
    '/audit-trail': ['audit-trail'],
    '/news': ['news'],
    '/ai': ['dealflow'],
};

export function permissionsForRoute(pathname: string): string[] | null {
    let best: { route: string; permissions: string[] } | null = null;
    for (const [route, permissions] of Object.entries(ROUTE_PERMISSIONS)) {
        if (pathname === route || pathname.startsWith(`${route}/`)) {
            if (!best || route.length > best.route.length) best = { route, permissions };
        }
    }
    return best?.permissions ?? null;
}
