import type { SupabaseClient } from '@supabase/supabase-js';
import { daysBetween, reminderStageFor, termCount, type ReminderStage } from '@/lib/debt-schedule';
import { type FacilityRow, type PaymentRow, todayIST, facilityTerms } from './debt';
import { resolveSender, sendAsUser } from './gmail-send';

// The daily pass that emails borrowers about repayments.
//
// For the one term each facility currently owes, at most one email a day:
//   * "upcoming" — once, when it comes within reminder_days_before
//   * "due"      — once, on the due date
//   * "overdue"  — on the first run past the due date, then weekly until paid
// Each is recorded on the payment row the moment it is sent, so a re-run of
// the job the same day (Vercel retries, a manual trigger) sends nothing twice.

export function reminderStage(p: PaymentRow, f: FacilityRow, today: string): ReminderStage | null {
    return reminderStageFor({
        dueDate: p.due_date,
        reminderDaysBefore: f.reminder_days_before,
        beforeSentAt: p.reminder_before_sent_at,
        dueSentAt: p.reminder_due_sent_at,
        lastOverdueAt: p.last_overdue_reminder_at,
    }, today);
}

const inr = (n: number) =>
    `₹${n.toLocaleString('en-IN', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;

function longDate(iso: string): string {
    return new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', {
        day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
    });
}

export function reminderEmail(stage: ReminderStage, p: PaymentRow, totalTerms: number, companyName: string, today: string) {
    const due = longDate(p.due_date);
    const total = inr(Number(p.total_due));
    const days = daysBetween(today, p.due_date.slice(0, 10));
    const subject = stage === 'overdue'
        ? `Overdue: ${total} was due on ${due} — ${companyName}`
        : stage === 'due'
            ? `Payment due today: ${total} — ${companyName}`
            : `Payment reminder: ${total} due on ${due} — ${companyName}`;
    const when = stage === 'overdue'
        ? `was due on ${due} and is now ${-days} day${-days === 1 ? '' : 's'} overdue`
        : stage === 'due'
            ? `is due today, ${due}`
            : `is due on ${due}, in ${days} day${days === 1 ? '' : 's'}`;

    const rows: [string, string][] = [
        ['Term', `${p.term_number} of ${totalTerms}`],
        ['Due date', due],
        ['Interest', inr(Number(p.interest_due))],
        ['Principal', inr(Number(p.principal_due))],
        ['Total due', total],
    ];
    const text = [
        `Dear ${companyName} team,`,
        '',
        `This is a reminder that the following repayment to Dholakia Ventures ${when}:`,
        '',
        ...rows.map(([k, v]) => `  ${k.padEnd(11)} ${v}`),
        '',
        'If you have already made this payment, please reply with the transaction reference so we can record it.',
        '',
        'Regards,',
        'Dholakia Ventures',
    ].join('\n');
    const html = `<p>Dear ${escapeHtml(companyName)} team,</p>
<p>This is a reminder that the following repayment to Dholakia Ventures ${escapeHtml(when)}:</p>
<table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
${rows.map(([k, v]) => `<tr><td style="color:#666">${k}</td><td style="font-weight:${k === 'Total due' ? 700 : 400}">${escapeHtml(v)}</td></tr>`).join('\n')}
</table>
<p>If you have already made this payment, please reply with the transaction reference so we can record it.</p>
<p>Regards,<br>Dholakia Ventures</p>`;
    return { subject, text, html };
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function runDebtReminders(db: SupabaseClient): Promise<{
    checked: number; sent: number; skipped: string[]; errors: string[];
}> {
    const today = todayIST();
    const result = { checked: 0, sent: 0, skipped: [] as string[], errors: [] as string[] };

    const { data: payments, error } = await db.from('debt_payments').select('*').eq('status', 'Pending');
    if (error) {
        result.errors.push(`debt_payments: ${error.message}`);
        return result;
    }
    if (!payments?.length) return result;

    const facilityIds = [...new Set(payments.map((p: PaymentRow) => p.facility_id))];
    const { data: facilities } = await db.from('debt_facilities').select('*').in('id', facilityIds);
    const byId = new Map((facilities || []).map((f: FacilityRow) => [f.id, f]));
    const companyIds = [...new Set((facilities || []).map((f: FacilityRow) => f.company_id))];
    const { data: companies } = await db.from('companies').select('id, company_name, founder_email').in('id', companyIds);
    const companyById = new Map((companies || []).map((c: { id: string; company_name: string; founder_email: string | null }) => [c.id, c]));

    for (const p of payments as PaymentRow[]) {
        result.checked++;
        const f = byId.get(p.facility_id);
        if (!f || f.status !== 'Active' || !f.reminders_enabled) continue;
        const stage = reminderStage(p, f, today);
        if (!stage) continue;

        const company = companyById.get(f.company_id);
        const to = f.borrower_email || company?.founder_email || '';
        const name = company?.company_name || 'your company';
        if (!to) { result.skipped.push(`${name} term ${p.term_number}: no borrower email`); continue; }

        const senderId = await resolveSender(db, f.owner_user_id);
        if (!senderId) { result.skipped.push(`${name} term ${p.term_number}: no connected Google account to send from`); continue; }

        const totalTerms = termCount(facilityTerms(f));
        const mail = reminderEmail(stage, p, totalTerms, name, today);
        const sent = await sendAsUser(senderId, { to, ...mail });
        if (!sent.ok) { result.errors.push(`${name} term ${p.term_number}: ${sent.error}`); continue; }

        const stamp = new Date().toISOString();
        const column = stage === 'overdue' ? 'last_overdue_reminder_at'
            : stage === 'due' ? 'reminder_due_sent_at' : 'reminder_before_sent_at';
        await db.from('debt_payments').update({ [column]: stamp }).eq('id', p.id);
        await db.from('activity_logs').insert({
            company_id: f.company_id,
            user_id: senderId,
            action: 'email_sent',
            details: `Repayment reminder (${stage}) for term ${p.term_number} sent to ${to}`,
        });
        await db.from('email_logs').insert({
            company_id: f.company_id, sender_id: senderId, recipient_email: to,
            subject: mail.subject, body: mail.text, email_type: 'debt-reminder',
        });
        result.sent++;
    }
    return result;
}
