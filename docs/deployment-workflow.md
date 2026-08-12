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
Use two rulesets, both bypassable only by the repository admin role:

- `main`: pull request with conversation resolution, required status checks
  (`Validate application`, `Vercel`) with branches required to be current;
  block force pushes and deletion.
- `staging`: force pushes and deletion blocked. **No pull-request rule and no
  required status checks** — see below.

### Why `staging` carries neither a pull-request rule nor status checks

The production release ends by fast-forwarding `staging` to the released `main`
commit, so the two branches do not drift. A pull-request rule on `staging`
blocks that automated update: the job runs as `github-actions[bot]`, which is
not the admin role and therefore not a bypass actor, so the ref update is
refused no matter what token permissions the job holds.

The original design solved this with a dedicated GitHub App
(`COURSETRACK_PROMOTION_APP_ID` / `COURSETRACK_PROMOTION_APP_PRIVATE_KEY`) added
as a ruleset bypass actor. Neither the App nor the bypass entry was ever
created, so the step failed on every release with `appId option is required` —
and because that job belongs to the release workflow, **every production
release reported failure even when the deployment was verified and healthy**,
which trains readers to ignore a red release.

Removing the pull-request rule alone was not sufficient. With it gone the ref
update was still refused:

```
Repository rule violations found
Required status check "Validate application" is in progress.  (HTTP 422)
```

Required status checks are evaluated on direct ref updates, not only on pull
request merges. Merging to `main` starts a fresh `Validate application` run for
that commit, and the release's sync job reaches the ref update while it is still
in flight.

That particular failure was solvable by waiting: the check belongs to the
commit, and the sync's own push starts no new one (see below), so polling the
in-flight run to completion would have satisfied the rule.

The rule was removed for a broader reason. A commit pushed directly to `staging`
has no completed checks *at the moment of the push*, so the rule refuses every
ordinary direct push from anyone without the admin bypass — recreating exactly
the friction this change set out to remove. Timing out the release job was the
symptom; blocking routine work was the cost. Re-verifying on `staging` is also
redundant: the fast-forward target is the exact commit that already passed
`Validate application` and `Vercel` as part of the `main` pull request minutes
earlier.

`main` — the branch that actually reaches production — keeps every protection:
pull request, conversation resolution, required status checks, branch currency,
and force-push and deletion blocks. `staging` still cannot be force-pushed or
deleted.

### What the fast-forward does and does not run

A **human** push to `staging` runs the full staging release: CI, migrations,
contract verification and smoke tests.

The release's fast-forward does **not**. GitHub suppresses workflow runs for
pushes authored by `secrets.GITHUB_TOKEN`, so that ref update starts neither
`ci.yml` nor `staging-release.yml`. Confirmed in practice: after `staging` was
fast-forwarded to `d9623b5`, no push-triggered run exists for that commit on
`staging`.

This is correct rather than a gap. The fast-forward target has already been
through the entire pipeline as part of the release — staging release, production
preparation, production deployment and smoke tests — so re-running staging
verification against it would test the same commit a second time. It also means
the sync cannot start a check that would block its own ref update.

If a future change makes the fast-forward target something *other* than an
already-released commit, that reasoning no longer holds and the sync should
dispatch `staging-release.yml` explicitly.

To restore the stricter arrangement later: create the App, install it on
CourseTrack with contents read/write, set the two values on the Production
environment, add the App as a bypass actor on the `staging` ruleset, re-add the
pull-request rule, and point the sync job's `GH_TOKEN` at an
`actions/create-github-app-token` step.

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
