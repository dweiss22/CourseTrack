# Deployment workflow

CourseTrack has exactly two long-lived branches: `staging` and `main`. Changes
move through `change/* -> staging -> main`; no release branch is created.

| Environment | Git branch | Vercel environment | Supabase project | Purpose |
| --- | --- | --- | --- | --- |
| Staging | `staging` | Preview, overridden for `staging` | staging | Integrated release candidate |
| Production | `main` | Production | production | Live application |
| Temporary change | `change/*` | Git build ignored | none | Pull-request validation only |

## Ordered release path

1. `Validate application` runs lint, typecheck, contracts/components, the
   workbook fixture contract, and a code-only build. The staging release polls
   this exact-SHA check run directly, avoiding stale parent workflow state.
2. The secret-free, trusted `CourseTrack migration plan` workflow runs
   protected base-branch code. Candidate SQL and
   `supabase/migrations/manifest.json` are read only as inert data. Existing
   entries must remain byte-identical; new versions must be appended in order
   with reviewed SHA-256 values. Target database state is checked later by the
   protected staging release or Production preparation workflow.
3. After a successful push validation on `staging`, `CourseTrack staging
   release` applies pending migrations with Supabase CLI `2.110.0`, verifies the
   deployment contract, runs the safe data audit, resolves Vercel's successful
   Git deployment for the exact SHA, and smokes the unique and stable URLs.
4. A `staging -> main` PR runs Production migration planning and `CourseTrack
   production preparation`. The latter verifies the exact staging release and
   a recent Supabase backup, applies pending Production migrations, and runs
   data/contract acceptance before reporting `Production release readiness`.
5. The main merge must be a merge commit whose tree exactly matches the tested
   staging tree. `CourseTrack production release` stages a domainless Vercel
   Production deployment, smokes it, promotes it, and smokes the stable domain.
6. After Production smoke succeeds, the promotion App updates `staging` to the
   released main merge commit using a non-force, fast-forward-only ref update.

The staging Preview environment leaves `COURSETRACK_CONTROLLED_RELEASES` unset,
so Vercel's Git integration owns the staging build and deployment. The staging
release fails closed unless the Vercel deployment belongs to the exact staging
SHA and both deployment health checks pass. Setting
`COURSETRACK_CONTROLLED_RELEASES=true` would make the Git-triggered build exit
through `scripts/vercel-ignore-build.mjs` and is incompatible with this staging
release path. Keep Git connected and do not create a deploy hook or custom
Vercel staging environment.

## GitHub configuration checklist

Repository variables:

- `AUTO_PROMOTE_STAGING_TO_MAIN=false`
- `AUTO_PROMOTE_EXPIRES_AT=<ISO timestamp no more than 30 days ahead>`

Both the `staging` and `Production` environments:

- existing target-specific Supabase URL/key, schema-check URL, project refs,
  smoke URL, and Vercel bypass values

Staging only:

- secret `COURSETRACK_MIGRATION_DATABASE_URL` (preferred) or the existing
  target-local `STAGING_DATABASE_URL` bootstrap credential

Production only:

- secret `VERCEL_TOKEN`
- variables `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, and `VERCEL_TEAM_SLUG`
- secret `SUPABASE_ACCESS_TOKEN`, scoped to the Production project, for backup
  verification and the Supabase CLI's short-lived linked migration login
- secret `COURSETRACK_PROMOTION_APP_PRIVATE_KEY`
- variable `COURSETRACK_PROMOTION_APP_ID`

The GitHub App is installed only on CourseTrack. Grant repository contents
read/write, pull requests read/write, and Actions/checks/deployments read. It
does not bypass `main`; its only ruleset bypass is the post-release,
fast-forward-only update of `staging`.

Use two rulesets:

- `staging`: pull request, `Validate application`, `Staging migration plan`,
  conversation resolution; block force pushes and deletion.
- `main`: pull request, `Validate application`, `Production migration plan`,
  `Staging release verified`, `Production release readiness`, conversation
  resolution; block force pushes and deletion.

Require branches to be current. Use merge commits for `staging -> main` because
the production workflow verifies the merge's second-parent tree. Temporary
change PRs may be squashed into staging.

## Temporary automatic promotion

`CourseTrack temporary staging promotion` is inert until
`AUTO_PROMOTE_STAGING_TO_MAIN=true`. For automatic runs, the expiry must be a
valid future timestamp no more than 30 days away. The workflow reuses one open
`staging -> main` PR, waits for protected checks, verifies the head SHA both
before preparation and immediately before merge, and merges with the GitHub App
so the normal `main` push workflow runs. Manual dispatch remains the recovery
fallback.

At expiration, set promotion to false and remove the automatic trigger,
variables, App credential, and staging bypass. Retain the manual migration and
controlled-release workflows.

## Emergency rollback

1. Set `AUTO_PROMOTE_STAGING_TO_MAIN=false`.
2. Set Vercel `COURSETRACK_CONTROLLED_RELEASES=false` in Production and the
   staging Preview override to restore ordinary Git builds.
3. Revoke the App key or remove its staging bypass.
4. Promote the prior Vercel deployment, or revert application code through a
   PR. Applied migrations are additive and remain in place.
5. Restore Production only from its verified Production backup if the workbook
   import must be reversed. Never restore Production from staging.
