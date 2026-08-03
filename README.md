# CourseTrack

**Search. Explore. Manage.**

CourseTrack is an internal course-portfolio workspace for finding courses,
tracking review and accreditation risk, planning revisions, and inspecting
read-only LMS data with clear provenance.

This repository contains the Phase 1 application foundation described in
[`docs/architecture.md`](docs/architecture.md).

## What is implemented

- Responsive dashboard with portfolio metrics, health charts, review queues,
  accreditation risk, and retrieval history
- Searchable, sortable course library with filters, cards, pagination, saved
  view presets, and formula-safe CSV export
- Detailed course records with versions, accreditation, topics, notes, flags,
  revamp planning, LMS provenance, and activity tabs
- Accreditation, version, flag, revamp, report, administration, and profile
  workspaces
- Workbook-backed sample portfolio: 1,952 Content Metadata courses reconciled
  with the supplied LMS exports and Topics matrix
- Read-only LMS provider contract with healthy, warning, and outage simulations
- Server-only Supabase/Postgres persistence with deterministic sample fallback
- PostgreSQL migrations, atomic internal edits, audit logging, and row-level
  security
- Real Supabase Auth login with four exclusive roles (`super_admin`, `admin`,
  `accreditation`, `content`) and admin-only user management — see
  [`docs/auth-setup.md`](docs/auth-setup.md)

## Stack

- React 19, TypeScript, Next-compatible routes via vinext
- Tailwind CSS 4 plus project-native component styles
- TanStack Table, Recharts, Lucide icons, Zod
- Official Supabase JavaScript client with PostgreSQL
- Vercel-compatible native Next.js build alongside the Sites vinext build

The same Supabase adapter runs behind server routes on Vercel and OpenAI Sites.
When credentials are absent, the app remains available in a clearly labeled
sample fallback mode.

## Quick start

Prerequisites:

- Node.js 22.13 or newer
- npm

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`.

Useful commands:

```powershell
npm run build
npm test
npm run lint
npm run typecheck
npm run build:vercel
```

## Configuration

Copy `.env.example` to `.env.local` and add the server-only Supabase project URL
and secret. No credentials are required for sample fallback evaluation. Apply
the migrations and hosting variables by following
[`docs/supabase-setup.md`](docs/supabase-setup.md).

Never commit LMS or Supabase service credentials. Live LMS endpoints are not
invented in this repository; the adapter stays in a visible `not-configured`
state until documented provider details are supplied.

Live, read-only Wrike course-version linking (a permanent-token connection,
an approved-folder task sync, and per-version link/verify/unlink) is
configured separately — see [`docs/wrike-setup.md`](docs/wrike-setup.md).

Real login (Supabase Auth) and the four-role user-management system need
their own environment variables, Supabase Dashboard configuration, and a
one-time super_admin bootstrap step — see
[`docs/auth-setup.md`](docs/auth-setup.md).

## Data and provenance

Every LMS-derived record carries source, retrieval status, and retrieval time.
CourseTrack never exposes LMS mutation methods. Internal-only fields—owners,
notes, flags, review dates, and revamp proposals—are written only to the
CourseTrack data store.

The source workbook under `Files/` was inspected read-only to inform the import
mapping. It is not modified by the application. See
[`docs/import-mapping.md`](docs/import-mapping.md).

## Project map

- `app/` — pages and API routes
- `components/` — application shell and workspaces
- `providers/lms/` — read-only LMS contract and providers
- `lib/imported-sample-data.ts` — generated sample portfolio and source reconciliation
- `lib/generated/mock-source-data.json` — deployment-safe data extracted from the supplied workbooks
- `lib/permissions.ts` — centralized roles and permissions
- `db/` — server-only Supabase/Postgres runtime adapter
- `supabase/migrations/` — PostgreSQL schema and runtime migrations
- `docs/` — architecture, permissions, provider, and import decisions
- `tests/` — rendered output and contract checks

## Current boundaries

- Sample mode is the default; a live LMS still requires confirmed API
  documentation and server-side credentials.
- Supabase credentials and migrations must be configured separately in each
  host before persistent writes are enabled.
- Authentication uses trusted OpenAI Sites identity headers when deployed and a
  clearly labeled demo administrator locally.
- Full browser end-to-end and accessibility automation are planned for the next
  hardening phase.

## Deployment

The repository supports both OpenAI Sites and Vercel. Sites uses `npm run build`;
Vercel uses the checked-in `vercel.json` override and `npm run build:vercel`.
Production credentials belong in each host's protected environment settings.
