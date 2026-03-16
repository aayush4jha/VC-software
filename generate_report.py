#!/usr/bin/env python3
"""Generate the Dholakia Ventures Technical Audit Report as a .docx file."""

from docx import Document
from docx.shared import Inches, Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
import datetime

doc = Document()

# ── Page setup ──
for section in doc.sections:
    section.top_margin = Cm(2)
    section.bottom_margin = Cm(2)
    section.left_margin = Cm(2.5)
    section.right_margin = Cm(2.5)

# ── Styles ──
style = doc.styles['Normal']
font = style.font
font.name = 'Calibri'
font.size = Pt(10.5)
font.color.rgb = RGBColor(0x33, 0x33, 0x33)
style.paragraph_format.space_after = Pt(4)
style.paragraph_format.line_spacing = 1.15

for level in range(1, 4):
    h = doc.styles[f'Heading {level}']
    h.font.name = 'Calibri'
    h.font.color.rgb = RGBColor(0x1a, 0x1a, 0x2e)
    if level == 1:
        h.font.size = Pt(20)
        h.paragraph_format.space_before = Pt(24)
        h.paragraph_format.space_after = Pt(8)
    elif level == 2:
        h.font.size = Pt(15)
        h.paragraph_format.space_before = Pt(18)
        h.paragraph_format.space_after = Pt(6)
    else:
        h.font.size = Pt(12)
        h.paragraph_format.space_before = Pt(12)
        h.paragraph_format.space_after = Pt(4)


def add_table(headers, rows, col_widths=None):
    """Add a formatted table to the document."""
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = 'Table Grid'
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    # Header row
    for i, h in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.text = h
        for p in cell.paragraphs:
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            for run in p.runs:
                run.bold = True
                run.font.size = Pt(9.5)
                run.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
        # Dark header bg
        shading = cell._element.get_or_add_tcPr()
        bg = shading.makeelement(qn('w:shd'), {
            qn('w:val'): 'clear',
            qn('w:color'): 'auto',
            qn('w:fill'): '1a1a2e'
        })
        shading.append(bg)
    # Data rows
    for r_idx, row in enumerate(rows):
        for c_idx, val in enumerate(row):
            cell = table.rows[r_idx + 1].cells[c_idx]
            cell.text = str(val)
            for p in cell.paragraphs:
                for run in p.runs:
                    run.font.size = Pt(9)
            # Alternate row shading
            if r_idx % 2 == 1:
                shading = cell._element.get_or_add_tcPr()
                bg = shading.makeelement(qn('w:shd'), {
                    qn('w:val'): 'clear',
                    qn('w:color'): 'auto',
                    qn('w:fill'): 'f0f0f5'
                })
                shading.append(bg)
    if col_widths:
        for i, w in enumerate(col_widths):
            for row in table.rows:
                row.cells[i].width = Inches(w)
    doc.add_paragraph('')
    return table


def bold_para(text):
    p = doc.add_paragraph()
    run = p.add_run(text)
    run.bold = True
    run.font.size = Pt(10.5)
    return p


def bullet(text, level=0):
    p = doc.add_paragraph(text, style='List Bullet')
    p.paragraph_format.left_indent = Cm(1.2 + level * 0.8)
    return p


# ═══════════════════════════════════════════════════════
# COVER PAGE
# ═══════════════════════════════════════════════════════

for _ in range(6):
    doc.add_paragraph('')

title = doc.add_paragraph()
title.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = title.add_run('Dholakia Ventures')
run.font.size = Pt(32)
run.bold = True
run.font.color.rgb = RGBColor(0x1a, 0x1a, 0x2e)

subtitle = doc.add_paragraph()
subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = subtitle.add_run('Deal Flow Management Platform')
run.font.size = Pt(18)
run.font.color.rgb = RGBColor(0x63, 0x66, 0xf1)

doc.add_paragraph('')

line = doc.add_paragraph()
line.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = line.add_run('─' * 40)
run.font.color.rgb = RGBColor(0xCC, 0xCC, 0xCC)

doc.add_paragraph('')

report_title = doc.add_paragraph()
report_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = report_title.add_run('Complete Technical Audit Report')
run.font.size = Pt(22)
run.bold = True
run.font.color.rgb = RGBColor(0x1a, 0x1a, 0x2e)

doc.add_paragraph('')

meta_items = [
    f'Date: {datetime.date.today().strftime("%B %d, %Y")}',
    'Codebase Version: 02ff72a (master)',
    'Auditor: Senior Software Architect / Code Auditor',
    'Classification: Internal — Engineering Team',
]
for item in meta_items:
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run(item)
    run.font.size = Pt(11)
    run.font.color.rgb = RGBColor(0x66, 0x66, 0x66)

doc.add_page_break()

# ═══════════════════════════════════════════════════════
# TABLE OF CONTENTS
# ═══════════════════════════════════════════════════════

doc.add_heading('Table of Contents', level=1)

toc_items = [
    '1. Project Overview',
    '2. System Architecture',
    '    2.1 Frontend Architecture',
    '    2.2 Authentication Flow',
    '    2.3 Data Flow',
    '    2.4 Database Schema',
    '3. Implemented Features — Detailed Analysis',
    '    3.1 Authentication & User Management',
    '    3.2 Deal Flow Pipeline (Kanban + Table)',
    '    3.3 Company Detail Panel',
    '    3.4 Rejection Flow',
    '    3.5 Google Workspace Integration',
    '    3.6 AI-Powered Analysis (Gemini)',
    '    3.7 Dashboard',
    '    3.8 Notifications',
    '    3.9 Portfolio Page',
    '    3.10 Contacts Page',
    '    3.11 Admin Page',
    '    3.12 Settings Page',
    '    3.13 Emails Page',
    '    3.14 AI Features Page',
    '4. Code Quality Analysis',
    '5. Consolidated Bug & Risk Report',
    '6. Missing / Incomplete Features',
    '7. Recommendations for Improvement',
]
for item in toc_items:
    p = doc.add_paragraph(item)
    p.paragraph_format.space_after = Pt(2)
    for run in p.runs:
        run.font.size = Pt(10.5)

doc.add_page_break()

# ═══════════════════════════════════════════════════════
# 1. PROJECT OVERVIEW
# ═══════════════════════════════════════════════════════

doc.add_heading('1. Project Overview', level=1)

doc.add_paragraph(
    'Dholakia Ventures Deal Flow Management is a pre-investment assessment pipeline management '
    'platform for the Dholakia Ventures fund. The system tracks startups from initial thesis '
    'check through due diligence, with integrated AI analysis, Gmail/Calendar integrations, '
    'and multi-user collaboration.'
)

bold_para('Technology Stack')
add_table(
    ['Layer', 'Technology'],
    [
        ['Framework', 'Next.js 16.1.6 (App Router)'],
        ['Language', 'TypeScript 5 (strict mode)'],
        ['Frontend', 'React 19.2.3, Lucide Icons, @hello-pangea/dnd'],
        ['Auth', 'Supabase Auth (Google OAuth)'],
        ['Database', 'Supabase (PostgreSQL) with Row Level Security'],
        ['AI', 'Google Gemini 2.0 Flash API'],
        ['Email', 'Gmail API (OAuth2) + Nodemailer (SMTP for invites)'],
        ['Calendar', 'Google Calendar API (OAuth2)'],
        ['State', 'React Context (single global provider)'],
        ['Styling', 'Custom CSS (globals.css) — no CSS framework'],
    ],
    col_widths=[1.5, 4.5]
)

bold_para('Key Metrics')
add_table(
    ['Metric', 'Value'],
    [
        ['Total Source Files', '53 (.ts, .tsx, .sql, .css)'],
        ['API Routes', '15'],
        ['React Components', '12'],
        ['Database Tables', '15'],
        ['Lines of Code (context.tsx)', '1,137'],
        ['Lines of Code (CompanyDetail.tsx)', '~1,400'],
        ['Test Files', '0'],
    ],
    col_widths=[2.5, 3.5]
)

bold_para('Architecture Pattern')
doc.add_paragraph(
    'Single-tenant monolith. All data is scoped to one hardcoded organization UUID '
    '(00000000-0000-0000-0000-000000000001). The frontend is a client-rendered SPA wrapped '
    'in the Next.js App Router. All database mutations go through a service-role proxy API '
    '(/api/db) that bypasses Row Level Security.'
)

doc.add_page_break()

# ═══════════════════════════════════════════════════════
# 2. SYSTEM ARCHITECTURE
# ═══════════════════════════════════════════════════════

doc.add_heading('2. System Architecture', level=1)

# 2.1
doc.add_heading('2.1 Frontend Architecture', level=2)

doc.add_paragraph('The project follows the Next.js App Router convention with the following structure:')

structure_items = [
    'src/app/ — Next.js App Router pages (10 routes) + API routes (15 endpoints)',
    'src/components/ — Reusable UI components organized by domain (company, dashboard, integrations, layout, notifications, pipeline)',
    'src/lib/ — Core libraries: context.tsx (global state), google.ts (OAuth), supabase/ (client configs), useGoogleAuth.ts (hook), mock-data.ts',
    'src/types/ — TypeScript interfaces (database.ts — 232 lines)',
    'supabase/ — SQL migration files (schema.sql, seed.sql, email-ingestion.sql, fix-rls-recursion.sql)',
]
for item in structure_items:
    bullet(item)

# 2.2
doc.add_heading('2.2 Authentication Flow', level=2)

auth_steps = [
    'User navigates to /login and clicks "Sign in with Google".',
    'Supabase auth redirects to Google OAuth consent screen.',
    'Google redirects back to /auth/callback with authorization code.',
    'Callback route exchanges code for session via supabase.auth.exchangeCodeForSession().',
    'Service client looks up profile by UID (then email fallback for UUID mismatches).',
    'If no profile exists and no invite role parameter and user is not super admin → rejected.',
    'If profile exists → name/avatar updated. If new user with invite → profile created.',
    'User redirected to / (home page).',
    'On every page load, context.tsx fetches profile via /api/me and populates user state.',
    'onAuthStateChange listener handles real-time sign-in/sign-out events.',
]
for i, step in enumerate(auth_steps, 1):
    bullet(f'{i}. {step}')

bold_para('Key Authentication Details:')
auth_details = [
    'Super admin email (aayush4jha@gmail.com) is hardcoded in 3 files and always gets admin role.',
    'Google OAuth tokens (for Gmail/Calendar) are stored in separate HTTP-only cookies.',
    'JWT is parsed locally via parseJwt() (base64url decode) — no signature verification in API routes.',
    'Admin/Settings route protection is enforced server-side via Next.js middleware.',
]
for detail in auth_details:
    bullet(detail)

# 2.3
doc.add_heading('2.3 Data Flow', level=2)

doc.add_paragraph(
    'The application follows a client-heavy data architecture:'
)

flow_steps = [
    'Browser (React Context) sends fetch("/api/data") with Bearer token on page load to get all org data.',
    'All mutations go through fetch("/api/db") — a generic CRUD proxy that uses the Supabase service role key (bypasses RLS).',
    'API routes create a Supabase service client with the service role key and execute queries directly.',
    'Responses are mapped from snake_case DB columns to camelCase TypeScript interfaces.',
    'Local React state is updated via setCompanies/setNotifications/etc. after each mutation.',
    'Supabase Realtime subscriptions on companies, notifications, and pipeline_stages provide live updates.',
]
for step in flow_steps:
    bullet(step)

# 2.4
doc.add_heading('2.4 Database Schema', level=2)

doc.add_paragraph('15 tables are defined across the SQL migration files:')

add_table(
    ['Table', 'Purpose', 'RLS'],
    [
        ['organizations', 'Tenant container', 'Yes'],
        ['profiles', 'User accounts (linked to auth.users)', 'Yes'],
        ['pipeline_stages', 'Configurable Kanban columns', 'Yes'],
        ['industries', 'Industry taxonomy', 'Yes'],
        ['deal_source_names', 'Referral source names', 'Yes'],
        ['rejection_reason_categories', 'Rejection taxonomy (parent)', 'Yes'],
        ['rejection_sub_reasons', 'Rejection taxonomy (child)', 'Yes'],
        ['companies', 'Core entity — startup deals (with AI fields)', 'Yes'],
        ['rejection_records', 'Rejection audit trail', 'Yes'],
        ['comments', 'Per-company discussion threads', 'Yes'],
        ['activity_logs', 'Audit trail for all actions', 'Yes'],
        ['notifications', 'User-targeted notifications', 'Yes'],
        ['saved_views', 'Persisted filter configurations', 'Yes'],
        ['email_logs', 'Outbound email records', 'Yes'],
        ['ingested_emails', 'Inbound email dedup + audit', 'Yes'],
    ],
    col_widths=[1.8, 3.2, 0.6]
)

bold_para('RLS Helper Functions (SECURITY DEFINER):')
bullet('get_my_role() — returns current user\'s role from profiles table')
bullet('is_admin() — checks if current user has admin role')
bullet('get_my_org_id() — returns current user\'s organization_id')

doc.add_page_break()

# ═══════════════════════════════════════════════════════
# 3. IMPLEMENTED FEATURES
# ═══════════════════════════════════════════════════════

doc.add_heading('3. Implemented Features — Detailed Analysis', level=1)

# ─── 3.1 AUTH ───
doc.add_heading('3.1 Authentication & User Management', level=2)

bold_para('Purpose')
doc.add_paragraph('Controls access to the platform. Only invited users or the super-admin can log in.')

bold_para('Sub-features Implemented')
auth_features = [
    'Google OAuth login via Supabase Auth',
    'Invite-based access control (uninvited users rejected at /auth/callback)',
    'Role-based access: analyst, partner, admin',
    'Super-admin bypass (hardcoded email always gets admin role)',
    'Profile auto-creation on first login (with invite link role)',
    'Profile UUID mismatch fallback (lookup by email if UID doesn\'t match)',
    'Auto-redirect: unauthenticated → /login, authenticated on /login → /',
    'Admin/Settings route protection via middleware (server-side)',
    'Session refresh via Supabase middleware on every request',
]
for f in auth_features:
    bullet(f)

bold_para('Files Involved')
add_table(
    ['File', 'Role'],
    [
        ['src/app/login/page.tsx', 'Login UI with Google OAuth button'],
        ['src/app/auth/callback/route.ts', 'OAuth callback — session exchange + profile upsert'],
        ['src/app/api/me/route.ts', 'Profile fetch + org/admin enforcement'],
        ['src/lib/supabase/middleware.ts', 'Session refresh + route protection'],
        ['src/middleware.ts', 'Next.js middleware entry point'],
        ['src/lib/supabase/client.ts', 'Browser Supabase client'],
        ['src/lib/supabase/server.ts', 'Server Supabase client'],
        ['src/app/api/invite-user/route.ts', 'Sends invite email via Gmail SMTP'],
    ],
    col_widths=[2.8, 3.2]
)

bold_para('Bugs & Issues')
add_table(
    ['Bug', 'File', 'Severity'],
    [
        ['JWT parsed without signature verification — parseJwt() only decodes payload, never verifies signature. A crafted JWT could bypass auth.', 'api/db, api/data, api/me, api/gmail/ingest', 'Critical'],
        ['Super-admin email hardcoded in 3 separate files. Must update all 3 to change.', 'middleware.ts, callback, me/route.ts', 'Medium'],
        ['Debug console.log and commented-out code left in inviteUser function.', 'context.tsx:1013-1014', 'Low'],
        ['Invite email sender name is "VC-SAAS" instead of "Dholakia Ventures".', 'api/invite-user/route.ts:48', 'Low'],
    ],
    col_widths=[3.2, 1.8, 0.8]
)

# ─── 3.2 PIPELINE ───
doc.add_heading('3.2 Deal Flow Pipeline (Kanban + Table)', level=2)

bold_para('Purpose')
doc.add_paragraph(
    'The core feature. Visualizes startup deals across configurable pipeline stages. '
    'Supports drag-and-drop stage progression, multi-filter search, sorting, saved views, and CSV export.'
)

bold_para('Sub-features Implemented')
pipeline_features = [
    'Kanban Board: Drag-and-drop cards between columns using @hello-pangea/dnd. Cards show company name, founder, industry, round, priority dot, analyst avatar, days in pipeline, fund raise. Visual indicators for high-priority, overdue, and needs-review.',
    'Table View: Sortable table with 12 columns. Inline action buttons for email and calendar.',
    'View Toggle: Switch between Kanban and Table views via toolbar.',
    'Filter Bar: 8 multi-select dropdown filters (Priority, Industry, Analyst, Round, Stage, Deal Source Type, Deal Source Name, Status). Active filter count badges.',
    'Saved Views: Save/load/delete filter configurations. Persisted to localStorage.',
    'CSV Export: Exports filtered companies to .csv with 13 columns.',
    'Search: Global search across company name, founder, email, industry, sub-industry, tags.',
    'Company Creation: Modal form with 16 fields including searchable "Link to Previous Entry" dropdown.',
    'Company Editing: Same modal pre-populated with existing data.',
    'Stage Move (Drag): Updates DB, logs activity, notifies assigned analyst.',
    'Analyst Assignment: Dropdown in dashboard/detail panel with activity log + notification.',
    'Needs Review Badge: Purple badge on cards/rows for email-ingested companies.',
]
for f in pipeline_features:
    bullet(f)

bold_para('Files Involved')
add_table(
    ['File', 'Role'],
    [
        ['src/app/dealflow/page.tsx', 'Page layout — toolbar, view switch, modal overlays'],
        ['src/components/pipeline/KanbanBoard.tsx', 'Kanban columns + draggable cards'],
        ['src/components/pipeline/TableView.tsx', 'Sortable table with filtering'],
        ['src/components/pipeline/FilterBar.tsx', 'Filter dropdowns, saved views, CSV export'],
        ['src/components/company/CompanyForm.tsx', 'Create/edit company modal'],
        ['src/lib/context.tsx', 'All mutations: create, update, delete, move'],
        ['src/app/api/db/route.ts', 'Generic CRUD proxy (service role)'],
        ['src/app/api/data/route.ts', 'Bulk data fetch (9 parallel queries)'],
    ],
    col_widths=[2.8, 3.2]
)

bold_para('Data Flow (Stage Move)')
move_steps = [
    'User drags card from Column A to Column B.',
    'handleDragEnd fires → calls moveCompanyStage(companyId, newStageId).',
    'Context sends POST /api/db with update operation.',
    'Service role client updates row directly (bypasses RLS).',
    'Local state updated via setCompanies(prev => prev.map(...)).',
    'Activity log inserted → notification sent to assigned analyst.',
    'Supabase Realtime subscription also fires (double update — harmless but redundant).',
]
for i, step in enumerate(move_steps, 1):
    bullet(f'{i}. {step}')

bold_para('Bugs & Issues')
add_table(
    ['Bug', 'File', 'Severity'],
    [
        ['Priority sort is alphabetical ("High"<"Low"<"Medium") instead of logical.', 'TableView.tsx', 'Medium'],
        ['Round sort is alphabetical instead of sequential.', 'TableView.tsx', 'Medium'],
        ['SLA status uses hardcoded 20/25 day thresholds instead of sla_deadline field.', 'TableView.tsx, Dashboard', 'Medium'],
        ['Two saved views systems: localStorage in FilterBar vs DB-backed in context.tsx.', 'FilterBar.tsx vs context.tsx', 'Medium'],
        ['KanbanBoard only applies 4 of 8 filter types (missing stage, source, status).', 'KanbanBoard.tsx:121-148', 'Medium'],
        ['Admin delete has no confirmation dialog.', 'admin/page.tsx', 'High'],
        ['"force-dynamic" export on client components has no effect.', 'All page.tsx files', 'Low'],
    ],
    col_widths=[3.5, 1.5, 0.8]
)

# ─── 3.3 COMPANY DETAIL ───
doc.add_heading('3.3 Company Detail Panel', level=2)

bold_para('Purpose')
doc.add_paragraph(
    'Side panel providing full company information, inline editing, AI analysis tabs, '
    'comments, activity timeline, email logs, and terminal status management.'
)

bold_para('Sub-features Implemented')
detail_features = [
    'Overview Tab: All company metadata in two-column grid. Inline editing for every field (click pencil → edit → save). Links for founder email and Google Drive.',
    'AI Tab: Six AI sections — Quick Summary, Deck Analysis (structured JSON), KPI Benchmarking, Call Analysis, Filter Brief, IC Memo. Each has a "Generate" button with loading state.',
    'Comments Tab: Threaded comments with author avatars, timestamps, and compose form.',
    'Activity Tab: Chronological activity log (stage changes, assignments, creation, rejection).',
    'Emails Tab: Sent email logs for the company.',
    'Quick Actions: Buttons for Email, Schedule Call, Edit, Reject. Stage move dropdown. Analyst assignment.',
    'Terminal Status Management: Set status (Portfolio, Rejected, Awaiting Response, Blocker, Next Round Analysis). Reminder date prompt for Awaiting/Blocker. Resolve to return to pipeline.',
    'Email Ingestion Review: Banner for needsReview companies with "Approve" button.',
]
for f in detail_features:
    bullet(f)

bold_para('Bugs & Issues')
add_table(
    ['Bug', 'File', 'Severity'],
    [
        ['AI generation updates DB but not local state — must close/reopen panel to see results.', 'context.tsx:787-866', 'Medium'],
        ['Inline edit saves may have delay before reflected (waits for Realtime).', 'CompanyDetail.tsx', 'Low'],
        ['Email logs tab fetches on every tab switch (no caching).', 'CompanyDetail.tsx', 'Low'],
    ],
    col_widths=[3.5, 1.5, 0.8]
)

# ─── 3.4 REJECTION ───
doc.add_heading('3.4 Rejection Flow', level=2)

bold_para('Purpose')
doc.add_paragraph(
    'Multi-step wizard for rejecting companies with categorized reasons, communication '
    'method selection, and AI-generated rejection email drafts.'
)

bold_para('Sub-features Implemented')
rejection_features = [
    'Step 1 — Reason Selection: Multi-select across 4 categories (Founders, Industry, Execution, Product/Business Model) with 16 sub-reasons.',
    'Step 2 — Communication Method: Email, Verbal, WhatsApp, Call, Not Yet Communicated. If Email → proceeds to Step 3.',
    'Step 3 — Email Draft: AI-generated via Gemini API. Editable textarea. Recipient pre-filled. Send via Gmail API. Status indicators. Fallback template if AI fails.',
    'Recording: Rejection record saved to DB. Terminal status set to "Rejected". Activity log created.',
]
for f in rejection_features:
    bullet(f)

bold_para('Bugs & Issues')
add_table(
    ['Bug', 'File', 'Severity'],
    [
        ['On email send failure, company is still rejected (rejectCompany called in both success and catch).', 'RejectionFlow.tsx:110-127', 'Medium'],
        ['Modal state not reset when reopened (only on close).', 'RejectionFlow.tsx:132-141', 'Low'],
    ],
    col_widths=[3.5, 1.5, 0.8]
)

# ─── 3.5 GOOGLE INTEGRATION ───
doc.add_heading('3.5 Google Workspace Integration (Gmail + Calendar)', level=2)

bold_para('Purpose')
doc.add_paragraph(
    'Direct email sending and Google Calendar event creation with Meet links, plus inbound '
    'email ingestion for auto-creating pipeline companies.'
)

bold_para('Sub-features Implemented')
google_features = [
    'Google OAuth Connection: Separate from Supabase auth. Tokens in HTTP-only cookies. Status check endpoint. Connect/Disconnect UI.',
    'Email Compose: Modal with From/To/Subject/Body. Auto-template from company card. Send via Gmail API. Status feedback.',
    'Calendar Event Creation: Date/time/duration picker. Auto-creates Google Meet link. Sends invite emails. Displays Meet link with copy button.',
    'Email Ingestion (Inbound): Pulls emails to pipeline@dholakiaventures.com. Auto-creates draft companies. Dedup via ingested_emails table. Pitch deck detection (PDF/PPTX). Team notifications.',
]
for f in google_features:
    bullet(f)

bold_para('Google OAuth Scopes')
doc.add_paragraph('gmail.send, gmail.readonly, calendar, calendar.events')

bold_para('Files Involved')
add_table(
    ['File', 'Role'],
    [
        ['src/lib/google.ts', 'OAuth2 client factory, scopes, auth URL'],
        ['src/lib/useGoogleAuth.ts', 'Client hook: isConnected, connect, disconnect'],
        ['src/app/api/auth/google/route.ts', 'Returns OAuth URL'],
        ['src/app/api/auth/google/callback/route.ts', 'Exchanges code for tokens, sets cookies'],
        ['src/app/api/auth/google/status/route.ts', 'GET: check connection, DELETE: disconnect'],
        ['src/app/api/gmail/send/route.ts', 'Gmail API send (RFC 2822 encoding)'],
        ['src/app/api/gmail/ingest/route.ts', 'Gmail inbox poll + company auto-creation'],
        ['src/app/api/calendar/create/route.ts', 'Google Calendar event + Meet link'],
        ['src/components/integrations/EmailCompose.tsx', 'Email compose modal'],
        ['src/components/integrations/CalendarInvite.tsx', 'Calendar event modal'],
        ['src/app/emails/page.tsx', 'Email hub page with sync UI'],
    ],
    col_widths=[2.8, 3.2]
)

bold_para('Bugs & Issues')
add_table(
    ['Bug', 'File', 'Severity'],
    [
        ['Google OAuth redirect_uri_mismatch blocks entire integration.', 'Google Cloud Console config', 'Critical'],
        ['Access tokens expire (~1hr) with no automatic refresh persistence.', 'google.ts:27-34', 'High'],
        ['Calendar timezone uses server locale, not user timezone.', 'api/calendar/create:43', 'Medium'],
        ['email_logs table never written to after send.', 'api/gmail/send/route.ts', 'Medium'],
        ['CalendarInvite has hardcoded default date (2026-02-20).', 'CalendarInvite.tsx:14', 'Low'],
        ['EmailCompose useEffect missing dependency (user).', 'EmailCompose.tsx:32', 'Low'],
    ],
    col_widths=[3.2, 1.8, 0.8]
)

# ─── 3.6 AI ───
doc.add_heading('3.6 AI-Powered Analysis (Gemini Integration)', level=2)

bold_para('Purpose')
doc.add_paragraph(
    'Six AI analysis tools that progressively build a complete investment analysis at '
    'each pipeline stage, powered by Google Gemini 2.0 Flash.'
)

bold_para('AI Features')
add_table(
    ['Feature', 'Stage', 'Output Type', 'Endpoint'],
    [
        ['Quick Summary', 'Thesis Check', '2-3 line text', '/api/ai/quick-summary'],
        ['Deck Analysis', 'Initial Screening', 'Structured JSON (10 fields)', '/api/ai/deck-analysis'],
        ['KPI Extraction', 'Initial Screening', 'Business model + KPI table', '/api/ai/kpi-extraction'],
        ['Call Analysis', 'Intro Call', 'Key points, actions, concerns', '/api/ai/call-analysis'],
        ['Filter Brief', 'Filter Discussion', 'Plain text document', '/api/ai/filter-brief'],
        ['IC Memo', 'Filter IC', 'Full markdown memo', '/api/ai/ic-memo'],
        ['Rejection Email', 'Any (rejection)', 'Personalized email draft', '/api/ai/rejection-email'],
    ],
    col_widths=[1.3, 1.3, 1.8, 1.8]
)

bold_para('Technical Implementation')
ai_impl = [
    'All routes use the same pattern: validate GEMINI_API_KEY → build prompt → POST to Gemini → parse response → return.',
    'JSON outputs (deck-analysis, kpi, call) strip markdown code blocks and parse with fallback.',
    'Text outputs (summary, brief, memo, email) return raw text.',
    'Temperature ranges from 0.2 (KPI) to 0.5 (rejection email). Token limits: 200-4000.',
    'Generation triggered from CompanyDetail panel (AI tab) or RejectionFlow.',
]
for item in ai_impl:
    bullet(item)

bold_para('Bugs & Issues')
add_table(
    ['Bug', 'File', 'Severity'],
    [
        ['All 7 AI routes have ZERO authentication. Any request can invoke them.', 'All /api/ai/* routes', 'Critical'],
        ['Prompt injection: user-supplied fields interpolated directly into prompts.', 'All /api/ai/* routes', 'Critical'],
        ['No rate limiting — AI calls incur Gemini API costs.', 'All /api/ai/* routes', 'High'],
        ['GEMINI_URL constructed at module load; undefined if env var not set at startup.', 'All /api/ai/* routes', 'Medium'],
        ['request.json() not wrapped in try/catch (malformed bodies throw).', 'All /api/ai/* routes', 'Medium'],
        ['call-analysis generates fabricated data when no call notes provided.', 'api/ai/call-analysis', 'Medium'],
        ['AI generation updates DB but not local React state.', 'context.tsx:787-866', 'Medium'],
    ],
    col_widths=[3.2, 1.8, 0.8]
)

# ─── 3.7 DASHBOARD ───
doc.add_heading('3.7 Dashboard', level=2)

bold_para('Purpose')
doc.add_paragraph('Home page providing an at-a-glance overview of pipeline health, assignments, and AI insights.')

bold_para('Sub-features Implemented')
dash_features = [
    'Stat Cards: Active Pipeline (with 30-day change %), My Companies, Unassigned, At Risk/Overdue, Needs Review.',
    'Intro Call Companies: Companies assigned to current user in stages 2-4.',
    'Pipeline Distribution: Bar chart showing company count per stage with proportional fill bars.',
    'New Assignments: Table of companies assigned to current user in last 7 days.',
    'Overdue Items: Companies >25 days in pipeline. Analysts see own; partners/admins see all.',
    'Unassigned Queue: Partners/admins get inline analyst assignment dropdowns.',
    'Recent AI Insights: Up to 3 companies with quickSummary content.',
]
for f in dash_features:
    bullet(f)

bold_para('Bugs & Issues')
add_table(
    ['Bug', 'File', 'Severity'],
    [
        ['Overdue threshold hardcoded to 25 days, ignoring sla_deadline field.', 'DashboardPage.tsx:83', 'Medium'],
        ['Intro Call section uses positional stage detection instead of name matching.', 'DashboardPage.tsx:45-54', 'Medium'],
        ['Date objects for time comparisons recreated every render (not memoized).', 'DashboardPage.tsx:34-36', 'Low'],
    ],
    col_widths=[3.2, 1.8, 0.8]
)

# ─── 3.8 NOTIFICATIONS ───
doc.add_heading('3.8 Notifications', level=2)

bold_para('Purpose')
doc.add_paragraph('Real-time notification system for pipeline events.')

bold_para('Sub-features Implemented')
notif_features = [
    'Notification Types: assignment, overdue, stage_change, new_company, comment.',
    'Bell Icon Badge: Unread count in TopHeader.',
    'Notification Panel: Dropdown with icon-coded items, relative timestamps (date-fns), "Mark all read".',
    'Real-time: Supabase Realtime subscription on notifications table.',
    'Generation Points: company creation, stage move, analyst assignment, email ingestion, portfolio status.',
]
for f in notif_features:
    bullet(f)

bold_para('Bugs & Issues')
add_table(
    ['Bug', 'File', 'Severity'],
    [
        ['markNotificationsRead sends N individual HTTP requests instead of batching.', 'context.tsx:709-718', 'Medium'],
        ['Clicking a notification does not navigate to the referenced company.', 'NotificationPanel.tsx', 'Low'],
        ['No pagination — shows all notifications up to 50 fetch limit.', 'api/data/route.ts:54', 'Low'],
    ],
    col_widths=[3.5, 1.5, 0.8]
)

# ─── 3.9-3.14 REMAINING PAGES ───
doc.add_heading('3.9 Portfolio Page', level=2)
doc.add_paragraph('Displays companies with "Portfolio" terminal status in a searchable table. Shows company name, founder, industry, round, valuation, and days in pipeline. Click to open CompanyDetail.')
bold_para('Issues')
bullet('Uses global searchQuery — searching here affects dealflow page. Should use local state. (Medium)')
bullet('Renders RejectionFlow and CompanyForm modals unnecessarily. (Low)')

doc.add_heading('3.10 Contacts Page', level=2)
doc.add_paragraph('Founder directory deduplicating contacts across all companies. Searchable by name, email, company, industry. Action buttons for Email and Schedule Meet with relative date display.')
bold_para('Issues')
bullet('When a founder has multiple companies, only one reference is kept — actions target that one. (Medium)')

doc.add_heading('3.11 Admin Page', level=2)
doc.add_paragraph('Admin-only dashboard with four tabs: Overview (stats, distribution, team), All Companies (table with delete), Team (user cards with assignments), Configuration (read-only display).')
bold_para('Issues')
bullet('No delete confirmation dialog — one click permanently deletes. (High)')
bullet('Client-side role check only. (Medium)')
bullet('Configuration tab duplicates Settings page read-only. (Low)')

doc.add_heading('3.12 Settings Page', level=2)
doc.add_paragraph('Full CRUD for Pipeline Stages, Industries, Rejection Categories/Sub-Reasons, Deal Sources, and Team Management (invite users by email with role selection).')
bold_para('Issues')
bullet('"Drag to reorder" for stages shown in UI but NOT implemented. (Medium)')
bullet('No error feedback for any CRUD operation. (Medium)')
bullet('Stage deletion can orphan companies with invalid pipeline_stage_id. (High)')
bullet('Client-side redirect for non-admins causes flash of content. (Low)')

doc.add_heading('3.13 Emails Page', level=2)
doc.add_paragraph('Email hub with Google connection status card, compose action, inbound email sync ("Sync Now" button with result summary), email features info cards, and an email history placeholder.')
bold_para('Issues')
bullet('Email History section always shows empty state — email_logs table is never written to. (Medium)')

doc.add_heading('3.14 AI Features Page', level=2)
doc.add_paragraph('Static informational page showcasing 6 AI tools with icons, descriptions, and pipeline stage tags. No interactive functionality.')
bold_para('Issues')
bullet('Cards have cursor:pointer but no click handler — users expect interactivity. (Low)')

doc.add_page_break()

# ═══════════════════════════════════════════════════════
# 4. CODE QUALITY
# ═══════════════════════════════════════════════════════

doc.add_heading('4. Code Quality Analysis', level=1)

add_table(
    ['Aspect', 'Assessment', 'Details'],
    [
        ['Structure', 'Good', 'Clean separation: pages, components, lib, types, API routes. Consistent naming.'],
        ['Reusability', 'Mixed', 'apiDb() helper centralizes DB ops. But parseJwt() duplicated 4x, ORGANIZATION_ID hardcoded 5x.'],
        ['Modularity', 'Needs Work', 'context.tsx is 1,137-line god-object. Should be split into domain contexts.'],
        ['Scalability', 'Concern', '/api/data loads ALL companies on every page load. No pagination. All data in client memory.'],
        ['Type Safety', 'Good', 'Strict TS enabled. Comprehensive interfaces. Minor eslint-disable for mapper functions.'],
        ['Styling', 'Functional', 'Single globals.css. Heavy use of inline styles. No CSS modules or framework.'],
        ['Testing', 'None', 'Zero test files in the entire codebase.'],
        ['Error Handling', 'Inconsistent', 'console.error in mutations but no user-facing error feedback in Settings/Admin.'],
        ['Security', 'Critical Gaps', 'AI routes unauthenticated. JWT unverified. Prompt injection possible.'],
        ['Maintainability', 'Medium', 'Good file structure but monolithic context and duplicated utilities.'],
    ],
    col_widths=[1.2, 1.0, 4.0]
)

doc.add_page_break()

# ═══════════════════════════════════════════════════════
# 5. BUG REPORT
# ═══════════════════════════════════════════════════════

doc.add_heading('5. Consolidated Bug & Risk Report', level=1)

doc.add_heading('Critical Severity', level=2)
add_table(
    ['#', 'Bug', 'Location', 'Fix'],
    [
        ['1', 'JWT not verified — only decoded', '/api/db, /api/data, /api/me, /api/gmail/ingest', 'Use supabase.auth.getUser() server-side'],
        ['2', 'All 7 AI routes unauthenticated', 'All /api/ai/* routes', 'Add Bearer token validation'],
        ['3', 'Prompt injection in all AI routes', 'All /api/ai/* routes', 'Sanitize inputs, use structured prompts'],
        ['4', 'Google OAuth redirect_uri_mismatch', 'Google Cloud Console', 'Register URI in authorized redirect URIs'],
    ],
    col_widths=[0.3, 2.0, 2.0, 2.0]
)

doc.add_heading('High Severity', level=2)
add_table(
    ['#', 'Bug', 'Location', 'Fix'],
    [
        ['5', 'No rate limiting on AI endpoints', 'All /api/ai/* routes', 'Add per-user rate limiter'],
        ['6', 'Google tokens not auto-refreshed', 'google.ts / Google API routes', 'Persist refresh response to cookies'],
        ['7', 'Delete company — no confirmation', 'admin/page.tsx', 'Add confirmation dialog'],
        ['8', 'Stage deletion orphans companies', 'context.tsx deletePipelineStage', 'Check for existing companies first'],
    ],
    col_widths=[0.3, 2.0, 2.0, 2.0]
)

doc.add_heading('Medium Severity', level=2)
add_table(
    ['#', 'Bug', 'Location', 'Fix'],
    [
        ['9', 'Priority sort alphabetical', 'TableView.tsx', 'Custom comparator: High=3, Medium=2, Low=1'],
        ['10', 'Round sort alphabetical', 'TableView.tsx', 'Custom comparator with round order array'],
        ['11', 'SLA ignores sla_deadline', 'TableView, Dashboard', 'Use sla_deadline from company data'],
        ['12', 'Duplicate saved views systems', 'FilterBar vs context.tsx', 'Use DB-backed version only'],
        ['13', 'AI gen doesn\'t update local state', 'context.tsx:787-866', 'Call setCompanies after DB update'],
        ['14', 'N requests for mark-read', 'context.tsx:709-718', 'Batch into single API call'],
        ['15', 'Server timezone for calendar', 'api/calendar/create:43', 'Accept timezone from client'],
        ['16', 'email_logs never written', 'api/gmail/send', 'Insert after successful send'],
        ['17', 'Global search query shared', 'context.tsx', 'Use local state per page'],
        ['18', 'Kanban filters incomplete', 'KanbanBoard.tsx:121-148', 'Add missing 4 filter types'],
        ['19', 'Intro Call positional detection', 'DashboardPage.tsx:45-54', 'Match by stage name'],
        ['20', 'Contacts drops multi-company', 'contacts/page.tsx', 'Show company picker'],
        ['21', 'Drag-to-reorder not functional', 'settings/page.tsx', 'Implement or remove UI hint'],
        ['22', 'No CRUD error feedback', 'settings/page.tsx', 'Add toast notifications'],
        ['23', 'ingested_emails RLS inconsistent', 'email-ingestion.sql', 'Use get_my_org_id() helper'],
    ],
    col_widths=[0.3, 2.0, 2.0, 2.0]
)

doc.add_page_break()

# ═══════════════════════════════════════════════════════
# 6. MISSING FEATURES
# ═══════════════════════════════════════════════════════

doc.add_heading('6. Missing / Incomplete Features', level=1)

add_table(
    ['Feature', 'Status', 'Evidence'],
    [
        ['Email History display', 'Placeholder only', 'emails/page.tsx shows "No Emails Sent Yet" always'],
        ['Pipeline stage reordering', 'UI hint, no function', 'GripVertical icons with no drag handlers'],
        ['email_logs write-through', 'Table exists, no writes', 'api/gmail/send never inserts to email_logs'],
        ['is_overdue auto-calculation', 'Field exists, no trigger', 'is_overdue boolean never auto-set'],
        ['Pitch deck file download', 'Detected, not stored', 'Only filenames recorded, no Supabase Storage'],
        ['Multi-tenant support', 'Schema supports, app hardcodes', 'ORGANIZATION_ID in 5 files'],
        ['Seed script idempotency', 'Fails on re-run', 'No ON CONFLICT clauses'],
        ['AI page interactivity', 'Cards styled clickable', 'cursor:pointer with no handler'],
        ['DB-backed saved views', 'Full CRUD in context', 'UI uses localStorage instead'],
        ['Automated tests', 'None', 'Zero test files'],
    ],
    col_widths=[1.8, 1.2, 3.2]
)

doc.add_page_break()

# ═══════════════════════════════════════════════════════
# 7. RECOMMENDATIONS
# ═══════════════════════════════════════════════════════

doc.add_heading('7. Recommendations for Improvement', level=1)

doc.add_heading('Immediate — Security (Fix Before Production)', level=2)
immediate = [
    'Verify JWT signatures in all API routes using supabase.auth.getUser() server-side.',
    'Add authentication to all 7 AI API routes.',
    'Sanitize AI prompt inputs to prevent prompt injection.',
    'Add rate limiting to AI endpoints.',
    'Fix Google OAuth redirect URI in Google Cloud Console.',
    'Add delete confirmation dialogs everywhere.',
]
for i, item in enumerate(immediate, 1):
    bullet(f'{i}. {item}')

doc.add_heading('Short-term — Reliability', level=2)
shortterm = [
    'Implement token refresh persistence for Google OAuth.',
    'Fix sorting comparators (priority, round) in TableView.',
    'Use sla_deadline for SLA status instead of hardcoded thresholds.',
    'Update local state after AI generation.',
    'Batch notification mark-as-read into a single request.',
    'Write to email_logs after successful email sends.',
    'Add error feedback (toasts) for all Settings CRUD operations.',
    'Add company-exists check before pipeline stage deletion.',
]
for i, item in enumerate(shortterm, 7):
    bullet(f'{i}. {item}')

doc.add_heading('Medium-term — Architecture', level=2)
medterm = [
    'Split context.tsx (1,137 lines) into domain-specific contexts.',
    'Add pagination to /api/data and implement virtual scrolling.',
    'Deduplicate parseJwt(), ORGANIZATION_ID, SUPER_ADMIN_EMAIL into shared modules.',
    'Remove export const dynamic = "force-dynamic" from all client components.',
    'Implement DB-backed saved views in the UI (remove localStorage version).',
    'Add pipeline stage drag-to-reorder or remove the UI hint.',
]
for i, item in enumerate(medterm, 15):
    bullet(f'{i}. {item}')

doc.add_heading('Long-term — Scalability', level=2)
longterm = [
    'Implement server-side filtering/pagination instead of loading all companies client-side.',
    'Move from single React Context to split contexts or Zustand.',
    'Add automated tests (unit + integration).',
    'Make the app truly multi-tenant (remove hardcoded org UUID).',
    'Add cron job or database trigger for is_overdue calculation.',
    'Implement pitch deck file storage via Supabase Storage.',
]
for i, item in enumerate(longterm, 21):
    bullet(f'{i}. {item}')

# ── Footer ──
doc.add_paragraph('')
doc.add_paragraph('')
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = p.add_run('— End of Report —')
run.font.size = Pt(11)
run.font.color.rgb = RGBColor(0x99, 0x99, 0x99)
run.italic = True

# ── Save ──
output_path = '/Users/aayushjha/Desktop/Dholakia/Dholakia_Ventures_Technical_Audit_Report.docx'
doc.save(output_path)
print(f'Report saved to: {output_path}')
