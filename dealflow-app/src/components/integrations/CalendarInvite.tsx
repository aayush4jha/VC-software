'use client';

import React, { useState } from 'react';
import { X, Calendar, Video, Clock, Send } from 'lucide-react';
import { useAppContext } from '@/lib/context';
import { currentUser } from '@/lib/mock-data';

export default function CalendarInvite() {
    const { showCalendarInvite, setShowCalendarInvite, selectedCompany } = useAppContext();
    const [date, setDate] = useState('2026-02-15');
    const [time, setTime] = useState('14:00');
    const [duration, setDuration] = useState('30');

    if (!showCalendarInvite || !selectedCompany) return null;

    return (
        <div className="modal-overlay" onClick={() => setShowCalendarInvite(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Calendar size={20} style={{ color: 'var(--primary)' }} />
                        <div className="modal-title">Schedule Call</div>
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
                                Intro Call: {selectedCompany.companyName}
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
                                <Video size={14} style={{ color: 'var(--primary)' }} /> Google Meet (auto-generated)
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
                </div>
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={() => setShowCalendarInvite(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={() => setShowCalendarInvite(false)}>
                        <Send size={14} /> Send Calendar Invite
                    </button>
                </div>
            </div>
        </div>
    );
}
