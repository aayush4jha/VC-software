'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Home, LayoutGrid, Briefcase, Users, Mail, Settings, LogOut, ChevronsLeft, ChevronsRight, Shield, BarChart3, Activity, FileText, Newspaper, Scale, Wallet, PiggyBank,
} from 'lucide-react';
import { useAppContext } from '@/lib/context';
import type { PagePermission } from '@/types/database';
import { hasAnyPermission, hasPermission } from '@/lib/permissions';

// Each entry lists the permissions that open the page; holding any one shows
// the link. The lists mirror ROUTE_PERMISSIONS, which is what middleware
// enforces — a link is only ever shown for a page you can actually open.
const navItems: { label: string; href: string; icon: React.ElementType; permissions: PagePermission[] }[] = [
    { label: 'Dashboard', href: '/', icon: Home, permissions: ['dashboard'] },
    { label: 'Deal Flow', href: '/dealflow', icon: LayoutGrid, permissions: ['dealflow'] },
    { label: 'Portfolio', href: '/portfolio', icon: Briefcase, permissions: ['portfolio'] },
    { label: 'Legal', href: '/legal', icon: Scale, permissions: ['legal', 'portfolio'] },
    { label: 'Fund', href: '/fund', icon: Wallet, permissions: ['fund'] },
    { label: 'Fund Investments', href: '/fund-investments', icon: PiggyBank, permissions: ['fund'] },
    { label: 'Analytics', href: '/analytics', icon: BarChart3, permissions: ['analytics'] },
    { label: 'Pipeline Analytics', href: '/pipeline-analytics', icon: Activity, permissions: ['pipeline-analytics'] },
    { label: 'Audit Trail', href: '/audit-trail', icon: FileText, permissions: ['audit-trail'] },
    { label: 'Contacts', href: '/contacts', icon: Users, permissions: ['contacts'] },
    { label: 'Email Workspace', href: '/emails', icon: Mail, permissions: ['emails'] },
    { label: 'News', href: '/news', icon: Newspaper, permissions: ['news'] },
];


export default function Sidebar() {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const { user, signOut } = useAppContext();

    // One subject, matching what middleware and the API evaluate, so a link
    // is shown exactly when the page behind it is actually reachable.
    const subject = { email: user?.email, role: user?.role, permissions: user?.permissions };

    const closeMobileSidebar = () => {
        document.querySelector('.sidebar')?.classList.remove('mobile-open');
        document.querySelector('.sidebar-overlay')?.classList.remove('active');
    };

    return (
        <>
        <div className="sidebar-overlay" onClick={closeMobileSidebar} />
        <aside className={`sidebar ${collapsed ? 'sidebar-collapsed' : ''}`}>
            <div className="sidebar-brand">
                {!collapsed && (
                    <div>
                        <div className="sidebar-brand-text">Dholakia Ventures</div>
                        <div className="sidebar-brand-sub">Deal Flow Management</div>
                    </div>
                )}
            </div>

            <nav className="sidebar-nav">
                {!collapsed && <div className="sidebar-section-label">Main</div>}
                {navItems
                    .filter(item => hasAnyPermission(subject, item.permissions))
                    .map((item) => {
                        const Icon = item.icon;
                        const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                                title={collapsed ? item.label : undefined}
                                onClick={closeMobileSidebar}
                            >
                                <Icon />
                                {!collapsed && item.label}
                            </Link>
                        );
                    })}

                {hasPermission(subject, 'admin') && (
                    <Link
                        href="/admin"
                        className={`sidebar-nav-item ${pathname.startsWith('/admin') ? 'active' : ''}`}
                        title={collapsed ? 'Admin' : undefined}
                        onClick={closeMobileSidebar}
                    >
                        <Shield />
                        {!collapsed && 'Admin'}
                    </Link>
                )}

                <div style={{ flex: 1 }} />

                {!collapsed && hasPermission(subject, 'settings') && <div className="sidebar-section-label">System</div>}
                {hasPermission(subject, 'settings') && (
                    <Link
                        href="/settings"
                        className={`sidebar-nav-item ${pathname === '/settings' ? 'active' : ''}`}
                        title={collapsed ? 'Settings' : undefined}
                        onClick={closeMobileSidebar}
                    >
                        <Settings />
                        {!collapsed && 'Settings'}
                    </Link>
                )}
                <div className="sidebar-nav-item" style={{ cursor: 'pointer' }} title={collapsed ? 'Log Out' : undefined} onClick={() => signOut()}>
                    <LogOut />
                    {!collapsed && 'Log Out'}
                </div>
            </nav>

            <div className="sidebar-collapse-btn" onClick={() => setCollapsed(!collapsed)}>
                {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
                {!collapsed && <span>Collapse</span>}
            </div>

            <div className="sidebar-user">
                {!collapsed && user && (
                    <div className="sidebar-user-info">
                        <div className="sidebar-user-name">{user.email}</div>
                        <div className="sidebar-user-role">{user.role}</div>
                    </div>
                )}
            </div>
        </aside>
        </>
    );
}
