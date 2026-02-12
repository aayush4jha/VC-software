'use client';

import React from 'react';
import { Bell, UserPlus, AlertTriangle, ArrowRightCircle, MessageSquare, Package } from 'lucide-react';
import { notifications, currentUser } from '@/lib/mock-data';
import { useAppContext } from '@/lib/context';
import { formatDistanceToNow } from 'date-fns';
import { NotificationType } from '@/types/database';

const iconMap: Record<NotificationType, { icon: React.ElementType; bg: string; color: string }> = {
    assignment: { icon: UserPlus, bg: 'var(--info-bg)', color: 'var(--info)' },
    overdue: { icon: AlertTriangle, bg: 'var(--danger-bg)', color: 'var(--danger)' },
    stage_change: { icon: ArrowRightCircle, bg: 'var(--success-bg)', color: 'var(--success)' },
    new_company: { icon: Package, bg: 'var(--primary-bg)', color: 'var(--primary)' },
    comment: { icon: MessageSquare, bg: 'var(--warning-bg)', color: 'var(--warning)' },
};

export default function NotificationPanel() {
    const { setShowNotifications } = useAppContext();
    const userNotifs = notifications.filter(n => n.userId === currentUser.id);

    return (
        <>
            <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setShowNotifications(false)} />
            <div className="notification-panel" style={{ animation: 'slideDown 0.2s ease' }}>
                <div className="notification-panel-header">
                    <span className="notification-panel-title">Notifications</span>
                    <button className="btn btn-ghost btn-sm">Mark all read</button>
                </div>
                <div className="notification-list">
                    {userNotifs.map((notif) => {
                        const { icon: Icon, bg, color } = iconMap[notif.type];
                        return (
                            <div key={notif.id} className={`notification-item ${!notif.read ? 'unread' : ''}`}>
                                <div className="notification-icon" style={{ background: bg, color }}>
                                    <Icon size={18} />
                                </div>
                                <div className="notification-content">
                                    <div className="notification-title">{notif.title}</div>
                                    <div className="notification-message">{notif.message}</div>
                                    <div className="notification-time">
                                        {formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </>
    );
}
