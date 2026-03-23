'use client';

import React, { useCallback } from 'react';
import { Search, Bell, Menu } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import NotificationPanel from '@/components/notifications/NotificationPanel';

interface TopHeaderProps {
    title: string;
    subtitle?: string;
}

export default function TopHeader({ title, subtitle }: TopHeaderProps) {
    const { searchQuery, setSearchQuery, showNotifications, setShowNotifications, getUnreadNotifications } = useAppContext();
    const unreadCount = getUnreadNotifications().length;

    const toggleMobileSidebar = useCallback(() => {
        const sidebar = document.querySelector('.sidebar');
        const overlay = document.querySelector('.sidebar-overlay');
        sidebar?.classList.toggle('mobile-open');
        overlay?.classList.toggle('active');
    }, []);

    return (
        <header className="top-header">
            <div className="top-header-left">
                <button className="mobile-menu-btn" onClick={toggleMobileSidebar}>
                    <Menu size={18} />
                </button>
                <div>
                    <div className="top-header-title">{title}</div>
                    {subtitle && <div className="top-header-subtitle">{subtitle}</div>}
                </div>
            </div>

            <div className="top-header-right">
                <div className="header-search">
                    <Search />
                    <input
                        type="text"
                        placeholder="Search companies, founders..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div style={{ position: 'relative' }}>
                    <button
                        className="header-icon-btn"
                        onClick={() => setShowNotifications(!showNotifications)}
                    >
                        <Bell size={20} />
                        {unreadCount > 0 && <span className="badge" />}
                    </button>
                    {showNotifications && <NotificationPanel />}
                </div>
            </div>
        </header>
    );
}
