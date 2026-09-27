import { isSameCompanyName } from './company-dedupe';
import { emailDomain, isFreeEmailDomain, matchCompany } from './email-company';

// Turning a person's scanned pitch emails into "which companies pitched me".
// Pure, so the Email Workspace view and the daily email group identically.

export interface PitchEmailRow {
    gmail_message_id: string;
    sender_name: string;
    sender_email: string;
    subject: string;
    received_at: string | null;
    company_name: string;
    attachment_names: string[];
    has_pitch_deck: boolean;
}

export interface PlatformCompany {
    id: string;
    company_name: string;
    founder_email: string | null;
    terminal_status: string | null;
    pipeline_stage_id: string | null;
}

export interface DeckReportGroup {
    companyName: string;
    senders: { name: string; email: string }[];
    emails: {
        messageId: string;
        subject: string;
        receivedAt: string | null;
        attachments: string[];
        hasDeck: boolean;
    }[];
    deckCount: number;
    firstReceived: string | null;
    lastReceived: string | null;
    /** Already on the platform, and where; null when it would be new. */
    onPlatform: { id: string; name: string; where: string } | null;
}

/**
 * One group per company. Two emails belong together when their company names
 * are the same name (any spelling), or when they come from the same work
 * domain — a founder and a co-founder writing separately is one company.
 */
export function buildDeckReport(
    rows: PitchEmailRow[],
    companies: PlatformCompany[],
    stageNames: Record<string, string>,
): DeckReportGroup[] {
    const groups: (DeckReportGroup & { domains: Set<string> })[] = [];
    const sorted = [...rows].sort((a, b) => (a.received_at || '').localeCompare(b.received_at || ''));

    for (const r of sorted) {
        const domain = isFreeEmailDomain(r.sender_email) ? null : emailDomain(r.sender_email);
        let g = groups.find(x =>
            isSameCompanyName(x.companyName, r.company_name) || (domain != null && x.domains.has(domain)));
        if (!g) {
            g = {
                companyName: r.company_name || r.sender_name || r.sender_email,
                senders: [], emails: [], deckCount: 0,
                firstReceived: r.received_at, lastReceived: r.received_at,
                onPlatform: null, domains: new Set(),
            };
            groups.push(g);
        }
        if (domain) g.domains.add(domain);
        if (!g.senders.some(s => s.email.toLowerCase() === r.sender_email.toLowerCase())) {
            g.senders.push({ name: r.sender_name, email: r.sender_email });
        }
        g.emails.push({
            messageId: r.gmail_message_id,
            subject: r.subject,
            receivedAt: r.received_at,
            attachments: r.attachment_names,
            hasDeck: r.has_pitch_deck,
        });
        if (r.has_pitch_deck) g.deckCount++;
        g.lastReceived = r.received_at ?? g.lastReceived;
    }

    for (const g of groups) {
        for (const s of g.senders) {
            const m = matchCompany(companies, { companyName: g.companyName, senderEmail: s.email, senderName: s.name });
            if (m) {
                const c = companies.find(x => x.id === m.id)!;
                const where = c.terminal_status === 'Portfolio' ? 'Portfolio'
                    : c.terminal_status ? c.terminal_status
                        : `Deal Flow${c.pipeline_stage_id && stageNames[c.pipeline_stage_id] ? ` · ${stageNames[c.pipeline_stage_id]}` : ''}`;
                g.onPlatform = { id: c.id, name: c.company_name, where };
                break;
            }
        }
        g.emails.reverse();                 // newest first for display
    }

    return groups
        .sort((a, b) => (b.lastReceived || '').localeCompare(a.lastReceived || ''))
        .map(g => ({
            companyName: g.companyName, senders: g.senders, emails: g.emails, deckCount: g.deckCount,
            firstReceived: g.firstReceived, lastReceived: g.lastReceived, onPlatform: g.onPlatform,
        }));
}
