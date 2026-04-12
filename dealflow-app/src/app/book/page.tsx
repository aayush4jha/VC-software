'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Calendar, Clock, CheckCircle, Video } from 'lucide-react';

interface Slot {
    start: string;
    end: string;
    date: string;
    time: string;
}

function BookingContent() {
    const searchParams = useSearchParams();
    const token = searchParams.get('token');
    const userId = searchParams.get('user');

    const [slots, setSlots] = useState<Slot[]>([]);
    const [companyName, setCompanyName] = useState('');
    const [hostName, setHostName] = useState('');
    const [duration, setDuration] = useState(30);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
    const [booking, setBooking] = useState(false);
    const [booked, setBooked] = useState<{ meetLink: string | null; start: string } | null>(null);

    const fetchSlots = useCallback(async () => {
        if (!token || !userId) { setError('Invalid booking link'); setLoading(false); return; }
        setLoading(true);
        try {
            const res = await fetch(`/api/calendar/slots?token=${token}&userId=${userId}`);
            const data = await res.json();
            if (!res.ok) { setError(data.error || 'Failed to load slots'); return; }
            setSlots(data.slots || []);
            setCompanyName(data.companyName || '');
            setHostName(data.hostName || '');
            setDuration(data.duration || 30);
        } catch { setError('Network error'); }
        setLoading(false);
    }, [token, userId]);

    useEffect(() => { fetchSlots(); }, [fetchSlots]);

    const handleBook = async () => {
        if (!selectedSlot || !token || !userId) return;
        setBooking(true);
        try {
            const res = await fetch('/api/calendar/book', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, userId, slotStart: selectedSlot.start, slotEnd: selectedSlot.end }),
            });
            const data = await res.json();
            if (!res.ok) { alert(data.error || 'Booking failed'); setBooking(false); return; }
            setBooked({ meetLink: data.meetLink, start: selectedSlot.start });
        } catch { alert('Network error'); }
        setBooking(false);
    };

    // Group slots by date
    const slotsByDate: Record<string, Slot[]> = {};
    for (const s of slots) {
        if (!slotsByDate[s.date]) slotsByDate[s.date] = [];
        slotsByDate[s.date].push(s);
    }

    if (error) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
                <div style={{ textAlign: 'center', padding: 40 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: '#ef4444', marginBottom: 8 }}>Link Error</div>
                    <div style={{ color: '#64748b' }}>{error}</div>
                </div>
            </div>
        );
    }

    if (booked) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
                <div style={{ textAlign: 'center', padding: 40, maxWidth: 500 }}>
                    <CheckCircle size={48} style={{ color: '#10b981', marginBottom: 16 }} />
                    <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Meeting Confirmed!</div>
                    <div style={{ color: '#64748b', marginBottom: 20 }}>
                        Your meeting with {hostName} is scheduled for<br />
                        <strong style={{ color: '#1e293b' }}>
                            {new Date(booked.start).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} at {new Date(booked.start).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}
                        </strong>
                    </div>
                    {booked.meetLink && (
                        <a
                            href={booked.meetLink}
                            target="_blank"
                            rel="noopener"
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: 8,
                                padding: '12px 24px', background: '#6366f1', color: '#fff',
                                borderRadius: 10, fontWeight: 600, fontSize: 15,
                                textDecoration: 'none',
                            }}
                        >
                            <Video size={18} /> Join Google Meet
                        </a>
                    )}
                    <div style={{ marginTop: 16, fontSize: 13, color: '#94a3b8' }}>
                        A calendar invite has been sent to your email.
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', padding: '40px 20px' }}>
            <div style={{ maxWidth: 600, margin: '0 auto' }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: 32 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#6366f1', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                        Dholakia Ventures
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                        Schedule a Meeting
                    </div>
                    <div style={{ color: '#64748b', fontSize: 15 }}>
                        {hostName && <>with <strong>{hostName}</strong> &middot; </>}{duration} min &middot; Google Meet
                    </div>
                    {companyName && (
                        <div style={{ marginTop: 8, fontSize: 13, color: '#94a3b8' }}>
                            Re: {companyName}
                        </div>
                    )}
                </div>

                {loading ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 8, color: '#64748b' }}>
                        <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} /> Loading available slots...
                    </div>
                ) : slots.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>
                        <Calendar size={32} style={{ marginBottom: 8, opacity: 0.4 }} />
                        <div style={{ fontWeight: 600 }}>No available slots</div>
                        <div style={{ fontSize: 13, marginTop: 4 }}>Please contact us directly to schedule.</div>
                    </div>
                ) : (
                    <>
                        <div style={{ fontSize: 14, fontWeight: 600, color: '#64748b', marginBottom: 16 }}>
                            Pick a time that works for you:
                        </div>
                        {Object.entries(slotsByDate).map(([date, dateSlots]) => (
                            <div key={date} style={{ marginBottom: 20 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <Calendar size={14} style={{ color: '#6366f1' }} /> {date}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                    {dateSlots.map(s => {
                                        const isSelected = selectedSlot?.start === s.start;
                                        return (
                                            <button
                                                key={s.start}
                                                onClick={() => setSelectedSlot(s)}
                                                style={{
                                                    padding: '8px 16px', fontSize: 13, fontWeight: 500,
                                                    border: isSelected ? '2px solid #6366f1' : '1px solid #e2e8f0',
                                                    borderRadius: 8, cursor: 'pointer',
                                                    background: isSelected ? '#eef2ff' : '#fff',
                                                    color: isSelected ? '#4f46e5' : '#334155',
                                                    fontFamily: 'inherit',
                                                    transition: 'all 0.15s',
                                                }}
                                            >
                                                <Clock size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
                                                {s.time}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}

                        {selectedSlot && (
                            <div style={{
                                position: 'sticky', bottom: 20, padding: 16,
                                background: '#fff', borderRadius: 12, boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
                                border: '1px solid #e2e8f0',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            }}>
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 600 }}>{selectedSlot.date} at {selectedSlot.time}</div>
                                    <div style={{ fontSize: 12, color: '#64748b' }}>{duration} minutes &middot; Google Meet</div>
                                </div>
                                <button
                                    onClick={handleBook}
                                    disabled={booking}
                                    style={{
                                        padding: '10px 24px', background: '#6366f1', color: '#fff',
                                        border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14,
                                        cursor: booking ? 'wait' : 'pointer', opacity: booking ? 0.7 : 1,
                                        fontFamily: 'inherit',
                                    }}
                                >
                                    {booking ? 'Booking...' : 'Confirm Booking'}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

export default function BookPage() {
    return (
        <Suspense>
            <BookingContent />
        </Suspense>
    );
}
