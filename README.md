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
- Deterministic sample portfolio: 64 courses across eight public-safety
  verticals
- Read-only LMS provider contract with healthy, warning, and outage simulations
- D1-backed application persistence for the deployable demo
- Canonical PostgreSQL/Supabase migration and row-level security plan for the
  production data model
- Centralized roles and permissions

## Stack

- React 19, TypeScript, Next-compatible routes via vinext
- Tailwind CSS 4 plus project-native component styles
- TanStack Table, Recharts, Lucide icons, Zod
- Drizzle ORM with Cloudflare D1 for the hosted demo
- PostgreSQL/Supabase migration plan for production

The D1 demo adapter lets the app run on OpenAI Sites without weakening the
production schema. The provider and domain boundaries are database-neutral.

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
npm run db:generate
```

## Configuration

Copy `.env.example` to `.env.local` and fill only the services you are ready to
connect. The app defaults to deterministic sample data, so no credentials are
required for local evaluation.

Never commit LMS or Supabase service credentials. Live LMS endpoints are not
invented in this repository; the adapter stays in a visible `not-configured`
state until documented provider details are supplied.

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
- `lib/sample-data.ts` — deterministic 64-course sample portfolio
- `lib/permissions.ts` — centralized roles and permissions
- `db/` — deployable D1 schema and runtime adapter
- `supabase/migrations/` — canonical PostgreSQL production migration
- `docs/` — architecture, permissions, provider, and import decisions
- `tests/` — rendered output and contract checks

## Current boundaries

- Sample mode is the default; a live LMS still requires confirmed API
  documentation and server-side credentials.
- D1 persists the hosted demonstration. Supabase is represented by a production
  migration and RLS policy set but is not connected to the demo runtime yet.
- Authentication uses trusted OpenAI Sites identity headers when deployed and a
  clearly labeled demo administrator locally.
- Full browser end-to-end and accessibility automation are planned for the next
  hardening phase.

## Deployment

The repository is structured for OpenAI Sites. `.openai/hosting.json` declares
the required D1 binding. A production deployment must be created only from a
saved version whose commit SHA matches the pushed source exactly.
