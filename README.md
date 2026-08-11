# CourseTrack

CourseTrack is a Next.js application backed by Supabase/Postgres. It keeps immutable source history while giving authorized users an editable application projection for course operations.

## Provenance

Every application value uses one of three labels:

- `uploaded` — **Uploaded** workbook data. The raw upload is immutable; editing its projection changes that field's current provenance to CourseTrack.
- `lms_api` — **Connected via LMS API**. These fields are read-only and remain locked.
- `coursetrack` — **CourseTrack** values created or edited in the application.

Raw uploads, LMS snapshots, import/retrieval history, and audit logs are immutable. History-bearing application records are soft-archived. Only audited manual taxonomy and relationship assignments may be hard-deleted.

## Local setup

1. Install Node.js 22.13 or newer and run `npm install`.
2. Copy `.env.example` to `.env.local` and configure Supabase server and browser credentials.
3. Apply checked-in migrations only to an authorized development database. Staging and Production migrations are applied by the protected release workflows.
4. Start with `npm run dev`.

Authentication and persistence fail closed. Without a valid Supabase session the protected pages redirect to sign-in; without database credentials reads and mutations return an explicit unavailable error.

The LMS refresh action remains visible but disabled until the read-only GET connector is configured. Wrike is reference-only and is also unavailable until explicitly configured.

## Environments

- `main` is the live Production application.
- `staging` is the persistent Staging application. Vercel displays it under
  its built-in Preview category.
- `change/<description>` is temporary work. It runs GitHub CI but its Vercel
  build is canceled because temporary branches have no application database.

See `docs/deployment-workflow.md` for the complete naming and release model.

## Verification

```text
npm run lint
npm run typecheck
npm test
npm run build
npm run build:code
```

Targeted data verification is available through
`npm run audit:course-data -- --target=staging|production`. Workbook imports
also require an explicit target and a complete reviewed source manifest.

The operational migration is `supabase/migrations/202608040006_operational_workflows.sql`. It backfills provenance, adds optimistic-concurrency and archive metadata, protects LMS API records, creates favorites and atomic board/version functions, and performs narrowly fingerprinted legacy cleanup.

See `docs/architecture.md`, `docs/database-schema.md`, `docs/permissions.md`, `docs/import-mapping.md`, `docs/lms-provider.md`, and `docs/wrike-provider.md`.
