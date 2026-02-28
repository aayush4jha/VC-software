'use client';

import React, { useState } from 'react';
import { X, Calendar, Video, Clock, Send, ExternalLink, CheckCircle, AlertCircle, Loader2, LogIn, Link2 } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import { useGoogleAuth } from '@/lib/useGoogleAuth';

type SendStatus = 'idle' | 'creating' | 'success' | 'error' | 'auth-required';

export default function CalendarInvite() {
    const { showCalendarInvite, setShowCalendarInvite, selectedCompany, user } = useAppContext();
    const { isConnected, isChecking, connect } = useGoogleAuth();
    const [date, setDate] = useState('2026-02-20');
    const [time, setTime] = useState('14:00');
    const [duration, setDuration] = useState('30');
    const [notes, setNotes] = useState('');
    const [sendStatus, setSendStatus] = useState<SendStatus>('idle');
    const [statusMessage, setStatusMessage] = useState('');
    const [meetLink, setMeetLink] = useState<string | null>(null);
    const [eventLink, setEventLink] = useState<string | null>(null);

    if (!showCalendarInvite || !selectedCompany) return null;

    const eventTitle = `Intro Call: ${selectedCompany.companyName}`;

    const handleCreateEvent = async () => {
        if (!isConnected) {
            setSendStatus('auth-required');
            setStatusMessage('Connect your Google account to create events directly.');
            return;
        }

        setSendStatus('creating');
        setStatusMessage('');
        setMeetLink(null);
        setEventLink(null);

        try {
            const res = await fetch('/api/calendar/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: eventTitle,
                    date,
                    time,
                    durationMinutes: parseInt(duration),
                    attendeeEmail: selectedCompany.founderEmail,
                    attendeeName: selectedCompany.founderName,
                    hostEmail: user?.email || '',
                    notes: notes || `Meeting with ${selectedCompany.founderName} from ${selectedCompany.companyName}.\n\nHost: ${user?.name || ''} (${user?.email || ''})`,
                }),
            });

            const data = await res.json();

            if (!res.ok) {
                if (res.status === 401) {
                    setSendStatus('auth-required');
                    setStatusMessage(data.error || 'Please reconnect your Google account.');
                } else {
                    setSendStatus('error');
                    setStatusMessage(data.error || 'Failed to create event.');
                }
                return;
            }

            setSendStatus('success');
            setMeetLink(data.meetLink);
            setEventLink(data.eventLink);
            setStatusMessage('Calendar event created with Google Meet!');
        } catch {
            setSendStatus('error');
            setStatusMessage('Network error. Please try again.');
        }
    };

    const handleClose = () => {
        setShowCalendarInvite(false);
        setSendStatus('idle');
        setStatusMessage('');
        setMeetLink(null);
        setEventLink(null);
    };

    return (
        <div className="modal-overlay" onClick={handleClose}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Calendar size={20} style={{ color: 'var(--primary)' }} />
                        <div className="modal-title">Schedule Google Meet Call</div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={handleClose}>
                        <X size={18} />
                    </button>
                </div>
                <div className="modal-body">
                    {/* Google account status */}
                    {!isChecking && !isConnected && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 10,
                            padding: '10px 14px', borderRadius: 'var(--radius-md)',
                            background: 'rgba(234, 179, 8, 0.08)', border: '1px solid rgba(234, 179, 8, 0.25)',
                            marginBottom: 16,
                        }}>
                            <AlertCircle size={16} style={{ color: '#eab308', flexShrink: 0 }} />
                            <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>
                                Connect your Google account to create events with Meet links directly.
                            </span>
                            <button
                                className="btn btn-sm"
                                onClick={connect}
                                style={{
                                    background: '#4285f4', color: '#fff',
                                    display: 'flex', alignItems: 'center', gap: 4,
                                    fontSize: 12, padding: '4px 12px',
                                }}
                            >
                                <LogIn size={12} /> Connect Google
                            </button>
                        </div>
                    )}

                    {!isChecking && isConnected && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '8px 14px', borderRadius: 'var(--radius-md)',
                            background: 'rgba(0, 137, 123, 0.08)', border: '1px solid rgba(0, 137, 123, 0.2)',
                            marginBottom: 16,
                        }}>
                            <CheckCircle size={14} style={{ color: '#00897B' }} />
                            <span style={{ fontSize: 12, color: '#00897B', fontWeight: 500 }}>
                                Google account connected — events created directly via Calendar API
                            </span>
                        </div>
                    )}

                    <div className="calendar-preview" style={{ marginBottom: 20 }}>
                        <div className="calendar-preview-row">
                            <span className="calendar-preview-label">Event</span>
                            <span className="calendar-preview-value" style={{ fontWeight: 600 }}>
                                {eventTitle}
                            </span>
                        </div>
                        <div className="calendar-preview-row">
                            <span className="calendar-preview-label">Host</span>
                            <span className="calendar-preview-value">{user?.name || ''} ({user?.email || ''})</span>
                        </div>
                        <div className="calendar-preview-row">
                            <span className="calendar-preview-label">Attendee</span>
                            <span className="calendar-preview-value">{selectedCompany.founderName} ({selectedCompany.founderEmail})</span>
                        </div>
                        <div className="calendar-preview-row">
                            <span className="calendar-preview-label">Platform</span>
                            <span className="calendar-preview-value" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Video size={14} style={{ color: '#00897B' }} />
                                <span style={{ color: '#00897B', fontWeight: 600 }}>Google Meet</span>
                                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>(auto-generated)</span>
                            </span>
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Date</label>
                            <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} disabled={sendStatus === 'success'} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Time</label>
                            <input className="form-input" type="time" value={time} onChange={e => setTime(e.target.value)} disabled={sendStatus === 'success'} />
                        </div>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Duration</label>
                        <select className="form-select" value={duration} onChange={e => setDuration(e.target.value)} disabled={sendStatus === 'success'}>
                            <option value="15">15 minutes</option>
                            <option value="30">30 minutes</option>
                            <option value="45">45 minutes</option>
                            <option value="60">60 minutes</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Notes (optional)</label>
                        <textarea
                            className="form-input"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Add any agenda items or notes for the call..."
                            rows={3}
                            style={{ resize: 'vertical' }}
                            disabled={sendStatus === 'success'}
                        />
                    </div>

                    {/* Status / result */}
                    {statusMessage && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                            padding: '10px 14px', borderRadius: 'var(--radius-md)',
                            marginTop: 4,
                            background: sendStatus === 'success' ? 'rgba(0, 137, 123, 0.08)' :
                                sendStatus === 'error' ? 'rgba(239, 68, 68, 0.08)' :
                                sendStatus === 'auth-required' ? 'rgba(234, 179, 8, 0.08)' : 'var(--bg-tertiary)',
                            border: `1px solid ${
                                sendStatus === 'success' ? 'rgba(0, 137, 123, 0.2)' :
                                sendStatus === 'error' ? 'rgba(239, 68, 68, 0.2)' :
                                sendStatus === 'auth-required' ? 'rgba(234, 179, 8, 0.25)' : 'var(--border)'
                            }`,
                        }}>
                            {sendStatus === 'success' && <CheckCircle size={16} style={{ color: '#00897B', flexShrink: 0 }} />}
                            {sendStatus === 'error' && <AlertCircle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />}
                            {sendStatus === 'auth-required' && <AlertCircle size={16} style={{ color: '#eab308', flexShrink: 0 }} />}
                            <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>
                                {statusMessage}
                            </span>
                            {sendStatus === 'auth-required' && (
                                <button
                                    className="btn btn-sm"
                                    onClick={connect}
                                    style={{
                                        background: '#4285f4', color: '#fff',
                                        display: 'flex', alignItems: 'center', gap: 4,
                                        fontSize: 12, padding: '4px 12px',
                                    }}
                                >
                                    <LogIn size={12} /> Connect
                                </button>
                            )}
                        </div>
                    )}

                    {/* Meet link result */}
                    {sendStatus === 'success' && meetLink && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '10px 14px', borderRadius: 'var(--radius-md)',
                            background: 'rgba(0, 137, 123, 0.08)', border: '1px solid rgba(0, 137, 123, 0.2)',
                            marginTop: 8,
                        }}>
                            <Video size={16} style={{ color: '#00897B', flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 2 }}>Google Meet Link</div>
                                <a
                                    href={meetLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ fontSize: 13, color: '#00897B', fontWeight: 500, textDecoration: 'none' }}
                                >
                                    {meetLink}
                                </a>
                            </div>
                            <button
                                className="btn btn-sm"
                                onClick={() => navigator.clipboard.writeText(meetLink)}
                                style={{ padding: '4px 8px', fontSize: 11 }}
                                title="Copy link"
                            >
                                <Link2 size={12} /> Copy
                            </button>
                        </div>
                    )}

                    {sendStatus === 'success' && eventLink && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '8px 14px', borderRadius: 'var(--radius-md)',
                            marginTop: 6,
                        }}>
                            <a
                                href={eventLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ fontSize: 12, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                            >
                                <ExternalLink size={12} /> View in Google Calendar
                            </a>
                        </div>
                    )}
                </div>
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={handleClose}>
                        {sendStatus === 'success' ? 'Close' : 'Cancel'}
                    </button>
                    {sendStatus !== 'success' && (
                        <button
                            className="btn btn-primary"
                            onClick={handleCreateEvent}
                            disabled={sendStatus === 'creating'}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: sendStatus === 'creating' ? 0.7 : 1 }}
                        >
                            {sendStatus === 'creating' ? (
                                <><Loader2 size={14} className="spin" /> Creating...</>
                            ) : (
                                <><Send size={14} /> Create Event &amp; Meet</>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
