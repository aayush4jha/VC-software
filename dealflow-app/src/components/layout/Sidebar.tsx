'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Home, LayoutGrid, Briefcase, Users, Mail, Settings, LogOut, ChevronsLeft, ChevronsRight, Shield, BarChart3, Activity,
} from 'lucide-react';
import { useAppContext } from '@/lib/context';
import type { PagePermission } from '@/types/database';

const navItems: { label: string; href: string; icon: React.ElementType; permission: PagePermission }[] = [
    { label: 'Dashboard', href: '/', icon: Home, permission: 'dashboard' },
    { label: 'Deal Flow', href: '/dealflow', icon: LayoutGrid, permission: 'dealflow' },
    { label: 'Portfolio', href: '/portfolio', icon: Briefcase, permission: 'portfolio' },
    { label: 'Analytics', href: '/analytics', icon: BarChart3, permission: 'portfolio' },
    { label: 'Pipeline Analytics', href: '/pipeline-analytics', icon: Activity, permission: 'dealflow' },
    { label: 'Contacts', href: '/contacts', icon: Users, permission: 'contacts' },
    { label: 'Email Workspace', href: '/emails', icon: Mail, permission: 'emails' },
];

function hasPermission(userPermissions: PagePermission[] | undefined, required: PagePermission): boolean {
    if (!userPermissions || userPermissions.length === 0) return true; // backward compat: no permissions = show all
    return userPermissions.includes(required);
}

export default function Sidebar() {
    const pathname = usePathname();
    const [collapsed, setCollapsed] = useState(false);
    const { user, signOut } = useAppContext();

    const userPerms = user?.permissions;

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
                    .filter(item => hasPermission(userPerms, item.permission))
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

                {hasPermission(userPerms, 'admin') && (
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

                {!collapsed && hasPermission(userPerms, 'settings') && <div className="sidebar-section-label">System</div>}
                {hasPermission(userPerms, 'settings') && (
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
