'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { X, Calendar, Video, Clock, Send, ExternalLink, CheckCircle, AlertCircle, Loader2, LogIn, Link2, Plus, Users } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import { useGoogleAuth } from '@/lib/useGoogleAuth';

type SendStatus = 'idle' | 'creating' | 'success' | 'error' | 'auth-required' | 'booking-sent';

interface HostSlot { start: string; end: string; date: string; time: string }

export default function CalendarInvite() {
    const { showCalendarInvite, setShowCalendarInvite, selectedCompany, user, updateCompany } = useAppContext();
    const { isConnected, isChecking, connect } = useGoogleAuth();
    // Sensible defaults: today, rounded up to the next half-hour
    const defaultDateTime = () => {
        const d = new Date();
        d.setMinutes(d.getMinutes() + (30 - (d.getMinutes() % 30)), 0, 0);
        const pad = (n: number) => String(n).padStart(2, '0');
        return {
            date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
            time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
        };
    };
    const [date, setDate] = useState(defaultDateTime().date);
    const [time, setTime] = useState(defaultDateTime().time);
    const [duration, setDuration] = useState('30');
    const [notes, setNotes] = useState('');
    const [sendStatus, setSendStatus] = useState<SendStatus>('idle');
    const [statusMessage, setStatusMessage] = useState('');
    const [meetLink, setMeetLink] = useState<string | null>(null);
    const [eventLink, setEventLink] = useState<string | null>(null);
    const [bookingUrl, setBookingUrl] = useState<string | null>(null);
    const [creatingBooking, setCreatingBooking] = useState(false);
    const [emailSent, setEmailSent] = useState<boolean | null>(null);
    const [emailError, setEmailError] = useState<string | null>(null);

    // Pick-a-slot flow state
    const [pickerOpen, setPickerOpen] = useState(false);
    const [hostSlots, setHostSlots] = useState<HostSlot[]>([]);
    const [loadingHostSlots, setLoadingHostSlots] = useState(false);
    const [hostSlotsError, setHostSlotsError] = useState<string | null>(null);
    const [selectedSlotKeys, setSelectedSlotKeys] = useState<Set<string>>(new Set());
    const [guestEmailInput, setGuestEmailInput] = useState('');
    const [guestEmails, setGuestEmails] = useState<string[]>([]);
    const [migrationSql, setMigrationSql] = useState<string | null>(null);

    // Load host's own free slots once the picker opens — must stay above any
    // early return so the hook count stays stable across renders
    const loadHostSlots = useCallback(async () => {
        setLoadingHostSlots(true);
        setHostSlotsError(null);
        try {
            const res = await fetch(`/api/calendar/my-slots?duration=${parseInt(duration)}`);
            const data = await res.json();
            if (!res.ok) {
                setHostSlotsError(data.error || 'Failed to load your availability.');
                setHostSlots([]);
            } else {
                setHostSlots(data.slots || []);
            }
        } catch {
            setHostSlotsError('Network error while loading your availability.');
        }
        setLoadingHostSlots(false);
    }, [duration]);

    useEffect(() => {
        if (pickerOpen) loadHostSlots();
    }, [pickerOpen, loadHostSlots]);

    // Refresh the default date/time each time the modal opens so stale state
    // from a previous open doesn't push the next booking into the past.
    useEffect(() => {
        if (showCalendarInvite) {
            const { date: nd, time: nt } = defaultDateTime();
            setDate(nd);
            setTime(nt);
        }
    }, [showCalendarInvite]);

    if (!showCalendarInvite || !selectedCompany) return null;

    const eventTitle = `Intro Call: ${selectedCompany.companyName}`;

    const handleCreateEvent = async () => {
        if (!isConnected) {
            setSendStatus('auth-required');
            setStatusMessage('Connect your Google account to create events directly.');
            return;
        }

        // Refuse past datetimes so the booking doesn't silently vanish from
        // the "Scheduled Calls" dashboard (which only lists upcoming meetings).
        const when = new Date(`${date}T${time}:00`);
        if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 60 * 1000) {
            setSendStatus('error');
            setStatusMessage('Pick a date and time in the future.');
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
                    hostName: user?.name || '',
                    companyId: selectedCompany.id,
                    companyName: selectedCompany.companyName,
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

            // Save event title + date on the company so we can find the recording later
            await updateCompany(selectedCompany.id, {
                meetEventTitle: eventTitle,
                meetEventDate: `${date}T${time}:00`,
            });
        } catch {
            setSendStatus('error');
            setStatusMessage('Network error. Please try again.');
        }
    };

    const openPicker = () => {
        if (!isConnected) {
            setSendStatus('auth-required');
            setStatusMessage('Connect your Google account so we can load your availability.');
            return;
        }
        setPickerOpen(true);
        setSendStatus('idle');
        setStatusMessage('');
    };

    const toggleSlot = (key: string) => {
        setSelectedSlotKeys(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const addGuestEmail = () => {
        const raw = guestEmailInput.trim().toLowerCase();
        if (!raw) return;
        if (!/.+@.+\..+/.test(raw)) {
            setStatusMessage(`"${raw}" doesn't look like a valid email.`);
            return;
        }
        if (guestEmails.includes(raw) || raw === (selectedCompany?.founderEmail || '').toLowerCase()) {
            setGuestEmailInput('');
            return;
        }
        setGuestEmails(g => [...g, raw]);
        setGuestEmailInput('');
        setStatusMessage('');
    };

    const removeGuestEmail = (email: string) => {
        setGuestEmails(g => g.filter(e => e !== email));
    };

    const handleSendBookingLink = async () => {
        const chosenSlots = hostSlots.filter(s => selectedSlotKeys.has(s.start));
        if (chosenSlots.length === 0) {
            setStatusMessage('Pick at least one slot to offer the founder.');
            return;
        }
        setCreatingBooking(true);
        setStatusMessage('');
        setEmailSent(null);
        setEmailError(null);
        try {
            const res = await fetch('/api/calendar/create-booking-link', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    companyId: selectedCompany.id,
                    companyName: selectedCompany.companyName,
                    attendeeName: selectedCompany.founderName,
                    attendeeEmail: selectedCompany.founderEmail,
                    hostName: user?.name || '',
                    hostEmail: user?.email || '',
                    eventTitle,
                    durationMinutes: parseInt(duration),
                    allowedSlots: chosenSlots.map(s => ({ start: s.start, end: s.end })),
                    additionalGuests: guestEmails,
                }),
            });
            const data = await res.json();
            if (!res.ok) { setStatusMessage(data.error || 'Failed'); setCreatingBooking(false); return; }
            setBookingUrl(data.bookingUrl);
            setSendStatus('booking-sent');
            setMigrationSql(data.migrationSql || null);
            setStatusMessage(data.degraded
                ? 'Booking link generated, but per-link slot filtering isn\u2019t enabled yet. Run the SQL below, then re-send the link.'
                : 'Booking link generated. Sending email to founder...');

            // Also send it via email — check the response so we surface failures
            try {
                const mailRes = await fetch('/api/gmail/send', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        to: selectedCompany.founderEmail,
                        companyId: selectedCompany.id,
                        subject: `Schedule a call - ${selectedCompany.companyName} | Dholakia Ventures`,
                        body: `Hi ${selectedCompany.founderName},\n\nPlease pick a time slot that works for you using the link below:\n\n${data.bookingUrl}\n\nThis will automatically create a Google Meet call and send calendar invites to both of us.\n\nLooking forward to our conversation!\n\nBest regards,\n${user?.name || 'Dholakia Ventures'}`,
                    }),
                });
                const mailData = await mailRes.json().catch(() => ({}));
                if (!mailRes.ok) {
                    setEmailSent(false);
                    setEmailError(mailData.error || 'Failed to send email. Copy the link and send it manually.');
                    setStatusMessage('Booking link ready, but email failed to send. Copy it manually below.');
                } else {
                    setEmailSent(true);
                    setStatusMessage(`Booking link emailed to ${selectedCompany.founderEmail}.`);
                }
            } catch {
                setEmailSent(false);
                setEmailError('Network error while sending email. Copy the link and send it manually.');
                setStatusMessage('Booking link ready, but email failed to send.');
            }
        } catch {
            setStatusMessage('Network error. Please try again.');
        }
        setCreatingBooking(false);
    };

    const handleClose = () => {
        setShowCalendarInvite(false);
        setSendStatus('idle');
        setStatusMessage('');
        setMeetLink(null);
        setEventLink(null);
        setBookingUrl(null);
        setEmailSent(null);
        setEmailError(null);
        setPickerOpen(false);
        setHostSlots([]);
        setHostSlotsError(null);
        setSelectedSlotKeys(new Set());
        setGuestEmailInput('');
        setGuestEmails([]);
        setMigrationSql(null);
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
                    {/* Pick-a-slot composer — host selects slots + guests before generating the link */}
                    {pickerOpen && sendStatus !== 'booking-sent' && (
                        <div style={{
                            marginTop: 12, padding: 14, borderRadius: 'var(--radius-md)',
                            background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                                <Users size={14} style={{ color: 'var(--primary)' }} />
                                <span style={{ fontSize: 13, fontWeight: 600 }}>Additional guests (optional)</span>
                            </div>
                            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                                <input
                                    className="form-input"
                                    value={guestEmailInput}
                                    onChange={e => setGuestEmailInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addGuestEmail(); } }}
                                    placeholder="colleague@firm.com"
                                    style={{ fontSize: 13, flex: 1 }}
                                />
                                <button
                                    type="button"
                                    className="btn btn-secondary btn-sm"
                                    onClick={addGuestEmail}
                                    style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
                                >
                                    <Plus size={12} /> Add
                                </button>
                            </div>
                            {guestEmails.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                                    {guestEmails.map(email => (
                                        <span
                                            key={email}
                                            style={{
                                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                                padding: '3px 8px', fontSize: 12,
                                                background: 'rgba(99,102,241,0.1)', color: '#4f46e5',
                                                border: '1px solid rgba(99,102,241,0.25)', borderRadius: 999,
                                            }}
                                        >
                                            {email}
                                            <button
                                                type="button"
                                                onClick={() => removeGuestEmail(email)}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, display: 'flex' }}
                                                aria-label={`Remove ${email}`}
                                            >
                                                <X size={12} />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 14 }}>
                                Everyone added here will be invited to the meeting and receive the Google Meet link once the founder picks a slot.
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Clock size={14} style={{ color: 'var(--primary)' }} />
                                    <span style={{ fontSize: 13, fontWeight: 600 }}>
                                        Offer these slots ({selectedSlotKeys.size} selected)
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    onClick={loadHostSlots}
                                    disabled={loadingHostSlots}
                                    style={{ fontSize: 11 }}
                                >
                                    {loadingHostSlots ? <Loader2 size={12} className="spin" /> : 'Refresh'}
                                </button>
                            </div>

                            {loadingHostSlots ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-secondary)', padding: '12px 0' }}>
                                    <Loader2 size={14} className="spin" /> Loading your free slots...
                                </div>
                            ) : hostSlotsError ? (
                                <div style={{ fontSize: 12, color: '#ef4444', padding: '8px 0' }}>{hostSlotsError}</div>
                            ) : hostSlots.length === 0 ? (
                                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '8px 0' }}>
                                    No free slots found in the next 7 weekdays between 9am and 7pm IST.
                                </div>
                            ) : (
                                <div style={{ maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {Object.entries(
                                        hostSlots.reduce<Record<string, HostSlot[]>>((acc, s) => {
                                            (acc[s.date] ||= []).push(s);
                                            return acc;
                                        }, {}),
                                    ).map(([d, list]) => (
                                        <div key={d}>
                                            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                                                {d}
                                            </div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                                {list.map(s => {
                                                    const on = selectedSlotKeys.has(s.start);
                                                    return (
                                                        <button
                                                            key={s.start}
                                                            type="button"
                                                            onClick={() => toggleSlot(s.start)}
                                                            style={{
                                                                padding: '5px 10px', fontSize: 12,
                                                                border: on ? '1.5px solid #6366f1' : '1px solid var(--border)',
                                                                borderRadius: 6, cursor: 'pointer',
                                                                background: on ? 'rgba(99,102,241,0.12)' : 'var(--bg-secondary)',
                                                                color: on ? '#4f46e5' : 'var(--text-primary)',
                                                                fontWeight: on ? 600 : 400,
                                                                fontFamily: 'inherit',
                                                            }}
                                                        >
                                                            {s.time}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Booking link result */}
                    {sendStatus === 'booking-sent' && bookingUrl && (
                        <div style={{
                            padding: '12px 14px', borderRadius: 'var(--radius-md)',
                            background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
                            marginTop: 8,
                        }}>
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                                Booking Link {emailSent === true
                                    ? `(emailed to ${selectedCompany.founderEmail})`
                                    : emailSent === false
                                        ? '(email failed — copy and send manually)'
                                        : '(sending email...)'}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <input
                                    className="form-input"
                                    value={bookingUrl}
                                    readOnly
                                    onClick={e => (e.target as HTMLInputElement).select()}
                                    style={{ fontSize: 12, flex: 1 }}
                                />
                                <button
                                    className="btn btn-sm"
                                    onClick={() => navigator.clipboard.writeText(bookingUrl)}
                                    style={{ padding: '4px 8px', fontSize: 11 }}
                                >
                                    <Link2 size={12} /> Copy
                                </button>
                            </div>
                            <div style={{ fontSize: 11, color: '#6366f1', marginTop: 6 }}>
                                The founder will see your available calendar slots and can pick a time. A Google Meet will be created automatically.
                            </div>
                            {emailError && (
                                <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>
                                    {emailError}
                                </div>
                            )}
                            {migrationSql && (
                                <div style={{
                                    marginTop: 10, padding: '10px 12px',
                                    borderRadius: 'var(--radius-md)',
                                    background: 'rgba(234,179,8,0.08)',
                                    border: '1px solid rgba(234,179,8,0.3)',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: '#b45309', marginBottom: 6 }}>
                                        <AlertCircle size={14} />
                                        One-time setup: enable per-link slot & guest storage
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>
                                        Paste this into your Supabase SQL editor (Dashboard &rarr; SQL &rarr; New query &rarr; Run). Then regenerate the link and your chosen slots and guests will be honoured.
                                    </div>
                                    <pre style={{
                                        margin: 0, padding: 10,
                                        fontSize: 11, fontFamily: 'var(--font-mono, monospace)',
                                        background: 'var(--bg-secondary)', color: 'var(--text-primary)',
                                        border: '1px solid var(--border)', borderRadius: 6,
                                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                    }}>{migrationSql}</pre>
                                    <button
                                        className="btn btn-sm"
                                        onClick={() => navigator.clipboard.writeText(migrationSql)}
                                        style={{ marginTop: 8, padding: '4px 10px', fontSize: 11 }}
                                    >
                                        <Link2 size={12} /> Copy SQL
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={handleClose}>
                        {sendStatus === 'success' || sendStatus === 'booking-sent' ? 'Close' : 'Cancel'}
                    </button>
                    {sendStatus !== 'success' && sendStatus !== 'booking-sent' && (
                        <>
                            <button
                                className="btn btn-ghost"
                                onClick={pickerOpen ? handleSendBookingLink : openPicker}
                                disabled={sendStatus === 'creating' || creatingBooking || (pickerOpen && selectedSlotKeys.size === 0)}
                                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}
                            >
                                {creatingBooking ? (
                                    <><Loader2 size={14} className="spin" /> Sending...</>
                                ) : pickerOpen ? (
                                    <><Send size={14} /> Send {selectedSlotKeys.size > 0 ? `${selectedSlotKeys.size} slot${selectedSlotKeys.size === 1 ? '' : 's'}` : 'slots'}</>
                                ) : (
                                    <><Calendar size={14} /> Let Them Pick a Slot</>
                                )}
                            </button>
                            {!pickerOpen && (
                                <button
                                    className="btn btn-primary"
                                    onClick={handleCreateEvent}
                                    disabled={sendStatus === 'creating' || creatingBooking}
                                    style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: sendStatus === 'creating' ? 0.7 : 1 }}
                                >
                                    {sendStatus === 'creating' ? (
                                        <><Loader2 size={14} className="spin" /> Creating...</>
                                    ) : (
                                        <><Send size={14} /> Create Event &amp; Meet</>
                                    )}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
