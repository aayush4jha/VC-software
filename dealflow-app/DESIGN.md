# Dealflow Platform — Design & Systems Document

_Last updated: 2026-06-28_

## 1. What the platform is

This is an internal **venture-capital deal-flow & portfolio-management platform** for a fund. It is a single Next.js web application that gives the investment team one place to:

- Track inbound startups through a **deal pipeline** (Kanban + table).
- Manage the **portfolio** of companies the fund has invested in (rounds, ownership, health, KPIs).
- Handle **legal** documents and rights (rights matrix, document manager).
- Track the **fund** itself (capital, bank statements, allocation).
- Run **analytics** on pipeline conversion and fund performance.
- Use **AI** to analyze pitch decks, call recordings, meeting notes, extract KPIs, draft IC memos and rejection emails.
- Send/receive **email**, schedule **calendar** calls, and read company **news**.
- Maintain an **audit trail** and role-based **admin** controls.

It is a multi-user, multi-tenant-aware app (organizations + profiles + role permissions) with a full activity/audit log.

---

## 2. Tech stack at a glance

| Layer | Technology |
|---|---|
| Framework | **Next.js 16** (App Router, React 19, TypeScript) |
| Hosting / runtime | **Vercel** (recommended deploy target; serverless API routes + edge middleware) |
| Database + Auth + Storage | **Supabase** (Postgres, Auth, Row-Level Security) |
| AI / LLM | **Google Gemini** (multimodal, via Generative Language API) |
| Email (transactional/invites) | **Gmail SMTP via Nodemailer**; **Resend** SDK available |
| Email / Calendar / Drive (user data) | **Google Workspace APIs** via `googleapis` + OAuth 2.0 |
| News | **Google News RSS** feeds |
| Charts | **Recharts** |
| Drag & drop | **@hello-pangea/dnd** (pipeline Kanban) |
| Document export | **docx**, **jsPDF**, **xlsx**, **file-saver** |
| Icons | **lucide-react** |
| Dates | **date-fns** |

---

## 3. External applications / services (the "what we depend on" list)

### 3.1 Vercel — hosting & delivery
- Deployment and hosting platform for the Next.js app (built by the Next.js team).
- Runs the App Router pages, **API route handlers** (`src/app/api/**`), and **edge middleware** (`src/middleware.ts`).
- Middleware was recently hardened to **time-box Supabase calls to avoid 504 gateway timeouts** (see commit history) — relevant to Vercel's serverless function limits.

### 3.2 Supabase — database, auth, storage
The backbone of the app.
- **Postgres database** — all application data. Schema lives in [supabase/](supabase/) (`schema.sql`, `portfolio-schema.sql`, plus incremental migration SQL files).
- **Auth** — user sign-in and sessions, wired through `@supabase/ssr` for server-side rendering.
- **Row-Level Security (RLS)** — access policies per row; there's a dedicated `fix-rls-recursion.sql` and a `permissions-redesign.sql`.
- Three client surfaces:
  - [src/lib/supabase/client.ts](src/lib/supabase/client.ts) — browser client.
  - [src/lib/supabase/server.ts](src/lib/supabase/server.ts) — server (route handlers / RSC) client.
  - [src/lib/supabase/middleware.ts](src/lib/supabase/middleware.ts) — session refresh in middleware.
- Uses both the **anon key** (client, RLS-enforced) and the **service-role key** (server, privileged operations like invites/admin).

Key tables (from `schema.sql` + migrations): `profiles`, `organizations`, `pipeline_stages`, `industries`, `deal_source_names`, `rejection_reason_categories` / `rejection_sub_reasons`, `companies`, `rejection_records`, `comments`, `activity_logs`, `notifications`, `saved_views`, `email_logs`, `audit_logs`, `google_tokens`, `ingested_emails`, `portfolio_follow_ons`, plus company scoring/feedback/share-count extensions.

### 3.3 Google Cloud / Google Workspace — OAuth + Gmail + Calendar + Drive
Per-user Google integration via OAuth 2.0 (`googleapis`), configured in [src/lib/google.ts](src/lib/google.ts).
- **Scopes requested:** `gmail.send`, `gmail.readonly`, `calendar`, `calendar.events`, `drive.readonly`.
- **OAuth flow:** consent → callback (`/api/auth/google/callback`) → tokens stored in the `google_tokens` Supabase table ([src/lib/google-tokens.ts](src/lib/google-tokens.ts)).
- **Gmail** — send emails, read inbox, ingest pitch emails, find/attach pitch decks, push emails into the Kanban (`src/app/api/gmail/**`).
- **Google Calendar** — create events, generate booking links, expose available slots, book calls (`src/app/api/calendar/**`).
- **Google Drive** — read-only, used to pull attached documents/decks.

### 3.4 Google Gemini — AI / LLM
Shared multimodal client in [src/lib/gemini.ts](src/lib/gemini.ts) calling the **Generative Language API** (`generativelanguage.googleapis.com`).
- **Model fallback chain:** `gemini-2.5-flash → 2.0-flash → 2.0-flash-lite → 1.5-flash → 1.5-flash-8b`, plus a **backup API key** (`GEMINI_API_KEY_BACKUP`) for quota resilience (2.x and 1.5 families use separate quota pools).
- Powers the AI routes in `src/app/api/ai/**`:
  - `deck-analysis` — analyze pitch decks.
  - `call-analysis` / `fetch-meeting-recording` / `meeting-analysis` — analyze call & meeting recordings/notes.
  - `kpi-extraction` — pull KPIs from documents.
  - `ic-memo` — draft Investment Committee memos.
  - `rejection-email` — draft rejection emails.
  - `quick-summary`, `filter-brief` — summarization / screening.

### 3.5 Email sending — Nodemailer (Gmail SMTP) & Resend
- **Nodemailer** over **Gmail SMTP** (`GMAIL_USER` + `GMAIL_APP_PASSWORD`) sends **user-invite emails** ([src/app/api/invite-user/route.ts](src/app/api/invite-user/route.ts)). This is app-level transactional mail, distinct from the per-user Gmail API integration above.
- **Resend** SDK is installed as a dependency and available as an alternative transactional-email provider.

### 3.6 Google News — RSS news feed
- [src/app/api/news/route.ts](src/app/api/news/route.ts) fetches **Google News RSS**, parses the XML, and auto-categorizes (Funding, Product, Leadership, M&A, Partnership, Awards) and assigns sentiment — surfaced on the **News** page for portfolio/pipeline companies. No paid news API.

### 3.7 Client-side document & visualization libraries
Not external services, but third-party packages worth listing as platform dependencies:
- **Recharts** — analytics charts.
- **@hello-pangea/dnd** — drag-and-drop Kanban pipeline.
- **docx / jsPDF / xlsx / file-saver** — export IC memos, reports, and spreadsheets ([src/lib/report-download.ts](src/lib/report-download.ts)).
- **lucide-react** — icon set. **date-fns** — date handling.

---

## 4. Application architecture

```
Browser (React 19 client components)
        │
        ▼
Next.js App Router (Vercel)
 ├── Pages / RSC          src/app/**/page.tsx
 ├── Edge middleware      src/middleware.ts   ← Supabase session refresh, time-boxed
 └── API route handlers   src/app/api/**/route.ts
        │
        ├── Supabase (Postgres + Auth + RLS)
        ├── Google APIs (Gmail / Calendar / Drive) via OAuth tokens
        ├── Google Gemini (Generative Language API)
        ├── Nodemailer → Gmail SMTP (invites)
        └── Google News RSS
```

- **Pages** live in [src/app/](src/app/) (one folder per feature route).
- **Reusable UI** in [src/components/](src/components/) grouped by domain: `pipeline`, `company`, `legal`, `fund`, `dashboard`, `integrations`, `layout`, `notifications`.
- **Business logic / clients** in [src/lib/](src/lib/) (Supabase clients, Google/Gemini clients, auth helpers, portfolio utils, report export, fund/legal data).
- **Types** in [src/types/database.ts](src/types/database.ts).

### Navigation / feature modules (from the sidebar)
Dashboard · Deal Flow · Portfolio · Legal · Fund · Analytics · Pipeline Analytics · Audit Trail · Contacts · Email Workspace · News — plus **Settings** and **Admin** (role/permissions, user invites).

---

## 5. Authentication & authorization model

1. **App login** — Supabase Auth (`profiles` ↔ `organizations`), sessions kept fresh by middleware.
2. **Role-based permissions** — redesigned permission model (`permissions-redesign.sql`) gating admin features; RLS enforces row access in Postgres.
3. **Google account linking** — separate per-user OAuth 2.0 grant for Gmail/Calendar/Drive; refresh tokens persisted in `google_tokens`.
4. **Invites** — admins invite users (`pending-invites` / `invite-user` route) via Nodemailer email.
5. **Audit trail** — `audit_logs` + `activity_logs` record actions for the Audit Trail page.

---

## 6. Environment configuration

Configured in `.env.local` (and Vercel project env vars):

| Variable | Service | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | Project URL (client + server) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | Public anon key (RLS-enforced) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase | Privileged server key (admin/invites) |
| `GOOGLE_CLIENT_ID` | Google OAuth | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth | OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Google OAuth | OAuth callback URL |
| `GMAIL_USER` | Gmail SMTP | Sender address for invites |
| `GMAIL_APP_PASSWORD` | Gmail SMTP | App password for Nodemailer |
| `GEMINI_API_KEY` | Google Gemini | Primary LLM key |
| `GEMINI_API_KEY_BACKUP` _(optional)_ | Google Gemini | Fallback key for quota |

---

## 7. Third-party service responsibility summary

| Service | Owns | Failure impact |
|---|---|---|
| **Vercel** | Hosting, serverless functions, edge middleware | Whole app down |
| **Supabase** | All data, auth, RLS | App unusable (no data/login) |
| **Google OAuth + Workspace APIs** | Gmail, Calendar, Drive per user | Email/calendar/deck-ingest features fail; core app fine |
| **Google Gemini** | All AI analysis | AI features fail; mitigated by model + key fallback |
| **Gmail SMTP (Nodemailer)** | Invite emails | New users can't be invited |
| **Resend** | (Available) transactional email | N/A unless adopted |
| **Google News RSS** | Company news | News page empty |

---

## 8. Notes & considerations
- **Single external ecosystem risk:** Supabase + Google (OAuth, Gmail, Calendar, Drive, Gemini, News) cover most external dependencies — concentration in Google is high.
- **Quota resilience** is built into Gemini (model chain + backup key) but not into the Google Workspace APIs.
- **Serverless timeouts:** middleware Supabase calls are time-boxed to stay under Vercel's gateway limits — keep new blocking calls in middleware lean.
- **Two email paths** coexist (app-level Nodemailer invites vs. per-user Gmail API) — don't conflate them.
