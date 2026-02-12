'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Home, LayoutGrid, Briefcase, Users, Mail, Sparkles, Settings, LogOut, UserCircle
} from 'lucide-react';
import { currentUser } from '@/lib/mock-data';

const navItems = [
    { label: 'Dashboard', href: '/', icon: Home },
    { label: 'Deal Flow', href: '/dealflow', icon: LayoutGrid, badge: 3 },
    { label: 'Portfolio', href: '/portfolio', icon: Briefcase },
    { label: 'Contacts', href: '/contacts', icon: Users },
    { label: 'Emails', href: '/emails', icon: Mail },
    { label: 'Dealflow AI', href: '/ai', icon: Sparkles },
];

const bottomNav = [
    { label: 'Settings', href: '/settings', icon: Settings },
];

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <aside className="sidebar">
            <div className="sidebar-brand">
                <div className="sidebar-brand-icon">DV</div>
                <div>
                    <div className="sidebar-brand-text">Dholakia Ventures</div>
                    <div className="sidebar-brand-sub">Deal Flow Management</div>
                </div>
            </div>

            <nav className="sidebar-nav">
                <div className="sidebar-section-label">Main</div>
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                        >
                            <Icon />
                            {item.label}
                            {item.badge && <span className="sidebar-nav-badge">{item.badge}</span>}
                        </Link>
                    );
                })}

                <div style={{ flex: 1 }} />

                <div className="sidebar-section-label">System</div>
                {bottomNav.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
                        >
                            <Icon />
                            {item.label}
                        </Link>
                    );
                })}
                <div className="sidebar-nav-item" style={{ cursor: 'pointer' }}>
                    <LogOut />
                    Log Out
                </div>
            </nav>

            <div className="sidebar-user">
                <div className="sidebar-user-avatar">
                    {currentUser.name.split(' ').map(n => n[0]).join('')}
                </div>
                <div className="sidebar-user-info">
                    <div className="sidebar-user-name">{currentUser.name}</div>
                    <div className="sidebar-user-role">{currentUser.role}</div>
                </div>
            </div>
        </aside>
    );
}
