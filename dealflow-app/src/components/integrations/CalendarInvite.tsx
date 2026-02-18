'use client';

import React, { useState } from 'react';
import { X, Calendar, Video, Clock, Send, ExternalLink } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import { currentUser } from '@/lib/mock-data';

function buildGoogleCalendarUrl(
    title: string,
    date: string,
    time: string,
    durationMinutes: number,
    attendeeEmail: string,
    description: string
) {
    // Build start datetime in format YYYYMMDDTHHmmSS
    const startDt = date.replace(/-/g, '') + 'T' + time.replace(/:/g, '') + '00';
    // Compute end datetime
    const startDate = new Date(`${date}T${time}:00`);
    const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
    const endDt =
        endDate.getFullYear().toString() +
        String(endDate.getMonth() + 1).padStart(2, '0') +
        String(endDate.getDate()).padStart(2, '0') +
        'T' +
        String(endDate.getHours()).padStart(2, '0') +
        String(endDate.getMinutes()).padStart(2, '0') +
        '00';

    const params = new URLSearchParams({
        action: 'TEMPLATE',
        text: title,
        dates: `${startDt}/${endDt}`,
        details: description,
        add: attendeeEmail,
        crm: 'AVAILABLE',
        trp: 'true', // Enables "Add Google Meet video conferencing"
    });

    return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export default function CalendarInvite() {
    const { showCalendarInvite, setShowCalendarInvite, selectedCompany } = useAppContext();
    const [date, setDate] = useState('2026-02-20');
    const [time, setTime] = useState('14:00');
    const [duration, setDuration] = useState('30');
    const [notes, setNotes] = useState('');

    if (!showCalendarInvite || !selectedCompany) return null;

    const eventTitle = `Intro Call: ${selectedCompany.companyName}`;
    const eventDescription = `Call with ${selectedCompany.founderName} from ${selectedCompany.companyName}.\n\nHost: ${currentUser.name} (${currentUser.email})\nAttendee: ${selectedCompany.founderName} (${selectedCompany.founderEmail})${notes ? `\n\nNotes: ${notes}` : ''}\n\n--- Google Meet link will be auto-generated ---`;

    const handleSendInvite = () => {
        const calendarUrl = buildGoogleCalendarUrl(
            eventTitle,
            date,
            time,
            parseInt(duration),
            selectedCompany.founderEmail,
            eventDescription
        );
        window.open(calendarUrl, '_blank');
        setShowCalendarInvite(false);
    };

    const handleQuickMeet = () => {
        window.open('https://meet.google.com/new', '_blank');
    };

    return (
        <div className="modal-overlay" onClick={() => setShowCalendarInvite(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Calendar size={20} style={{ color: 'var(--primary)' }} />
                        <div className="modal-title">Schedule Google Meet Call</div>
                    </div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setShowCalendarInvite(false)}>
                        <X size={18} />
                    </button>
                </div>
                <div className="modal-body">
                    <div className="calendar-preview" style={{ marginBottom: 20 }}>
                        <div className="calendar-preview-row">
                            <span className="calendar-preview-label">Event</span>
                            <span className="calendar-preview-value" style={{ fontWeight: 600 }}>
                                {eventTitle}
                            </span>
                        </div>
                        <div className="calendar-preview-row">
                            <span className="calendar-preview-label">Host</span>
                            <span className="calendar-preview-value">{currentUser.name} ({currentUser.email})</span>
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
                                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>(link auto-generated on calendar)</span>
                            </span>
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Date</label>
                            <input className="form-input" type="date" value={date} onChange={e => setDate(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Time</label>
                            <input className="form-input" type="time" value={time} onChange={e => setTime(e.target.value)} />
                        </div>
                    </div>
                    <div className="form-group">
                        <label className="form-label">Duration</label>
                        <select className="form-select" value={duration} onChange={e => setDuration(e.target.value)}>
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
                        />
                    </div>

                    {/* Quick Meet link */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '10px 14px', borderRadius: 'var(--radius-md)',
                        background: 'rgba(0, 137, 123, 0.08)', border: '1px solid rgba(0, 137, 123, 0.2)',
                        marginTop: 4,
                    }}>
                        <Video size={16} style={{ color: '#00897B', flexShrink: 0 }} />
                        <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1 }}>
                            Need to meet right now instead?
                        </span>
                        <button
                            className="btn btn-sm"
                            onClick={handleQuickMeet}
                            style={{
                                background: '#00897B', color: '#fff',
                                display: 'flex', alignItems: 'center', gap: 4,
                                fontSize: 12, padding: '4px 10px',
                            }}
                        >
                            <ExternalLink size={12} /> Start Instant Meet
                        </button>
                    </div>
                </div>
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={() => setShowCalendarInvite(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleSendInvite} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Send size={14} /> Schedule with Google Meet
                    </button>
                </div>
            </div>
        </div>
    );
}
