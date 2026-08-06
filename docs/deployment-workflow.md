# Deployment workflow

CourseTrack uses two long-lived branches and Vercel environments:

| Git branch | Vercel environment | Purpose |
| --- | --- | --- |
| `main` | Production | The live application |
| `staging` | Preview | Integrated release candidate for final validation |
| `feature/*` | Preview | Isolated work and pull-request review |

Vercel should keep `main` as the project's Production Branch. Every other
branch receives a Preview deployment automatically. Assign a staging domain to
the `staging` Preview branch in Vercel so the team's staging URL always follows
the latest successful deployment from that branch.

## Environment configuration

Configure Vercel variables by environment rather than copying production
values indiscriminately:

- **Production** variables are used only by `main`.
- **Preview** variables are used by `staging` and feature-branch deployments.
- Use a separate Supabase project for Preview. This prevents staging tests,
  user administration, Wrike links, and synchronization runs from changing
  production records.
- Refresh the stable staging project with the sanitized weekly snapshot
  described in [`staging-data-refresh.md`](staging-data-refresh.md). Never point
  a Preview deployment at the production Supabase project.
- Apply the same migrations to both Supabase projects.
- Generate a distinct `TOKEN_ENCRYPTION_KEY` for each environment. Keep each
  key stable after a Wrike connection is saved in that environment.
- `WRIKE_PERMANENT_TOKEN` may use the same read-only Wrike credential in both
  environments when appropriate, but it must remain a protected server-only
  variable.
- Set branch-specific `COURSETRACK_ENVIRONMENT=staging` for `staging` and
  `COURSETRACK_ENVIRONMENT=preview` for feature deployments. The app uses this
  value for its persistent non-production banner and browser-title prefix.
- Configure the deployment-readiness and smoke variables exactly as described
  in [`deployment-readiness.md`](deployment-readiness.md). Vercel must retain
  `npm run build:vercel` as its build command; `npm run build:code` is only the
  secret-free source-validation build.

## Normal change workflow

1. Update local `staging` from GitHub.
2. Create `feature/<short-description>` from `staging`.
3. Make and test the change, then push the feature branch.
4. Open a pull request from the feature branch into `staging`.
5. Review the Vercel Preview and wait for CourseTrack CI and Vercel checks.
6. Before publishing staging, apply its migrations, run import acceptance, and
   pass the protected staging deployment contract in the order documented in
   [`deployment-readiness.md`](deployment-readiness.md).
7. Merge the pull request into `staging` and validate the stable staging URL
   with the health and authenticated-route smoke checks.
8. When staging is approved for release, open a pull request from `staging`
   into `main`.
9. Back up production, apply the approved production migrations, run
   acceptance and the production contract, then merge the release pull
   request. Vercel deploys `main` only after the contract is current.
10. Merge the updated `main` back into `staging` so GitHub's release merge
   commit is present in both long-lived branches.

Do not continue adding unrelated work to a feature branch after its pull
request is merged. Start the next change from the latest `staging` instead.

## Production hotfix

For an urgent production fix, create a short-lived branch from `main`, open a
pull request directly into `main`, and validate its Vercel Preview. After the
fix reaches Production, merge `main` back into `staging` immediately.

## Recommended GitHub rules

Create branch rulesets for both long-lived branches:

- `main`: require a pull request, CourseTrack CI, and the Vercel deployment
  check; block force pushes and deletion.
- `staging`: require a pull request and CourseTrack CI; block force pushes and
  deletion.
- Allow repository administrators to bypass only for recovery, not as the
  normal release process.

Use merge commits for the `staging` to `main` release pull request, then perform
the documented merge-back. Feature pull requests may use squash merge to keep
their history compact.
