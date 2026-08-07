# Deployment workflow

CourseTrack uses two long-lived branches. Every other branch is temporary and
is deleted after its pull request is merged or closed.

| Application environment | Git branch | Vercel label | Supabase branch | Purpose |
| --- | --- | --- | --- | --- |
| Production | `main` | Production | `main` | Live application |
| Staging | `staging` | Preview | `staging` | Integrated release candidate and final validation |
| Temporary change | `change/<description>` | Preview (canceled before build) | None | CI and pull-request review only |

`Preview` is Vercel's built-in label for every non-production deployment; it
is not a separate CourseTrack environment or a copy of Production. CourseTrack
uses that Vercel category only for the long-lived `staging` branch. The
`ignoreCommand` in `vercel.json` cancels deployments for temporary branches.
The stable staging URL always follows the latest successful `staging`
deployment.

Use `change/<plain-English-description>` for all temporary work. For example,
an update to GitHub Actions should use `change/update-github-actions`.

Do not create a Vercel custom environment named `staging`. Supabase Branching
syncs preview-branch credentials into Vercel's built-in Preview environment;
moving the branch into a custom environment bypasses those credentials and can
make the branch inherit production integration values. Use Preview variables
that are explicitly overridden for Git branch `staging` instead.

## Environment configuration

Configure Vercel variables by environment rather than copying production
values indiscriminately:

- **Production** variables are used only by `main`.
- Branch-specific **Preview** variables are used only by `staging`.
- Supabase project `CourseTrack` uses an isolated persistent `staging` branch.
  Its API credentials and database are distinct from the production `main`
  branch. This prevents staging tests, user administration, Wrike links, and
  synchronization runs from changing production records.
- Refresh the persistent staging branch with the sanitized weekly snapshot
  described in [`staging-data-refresh.md`](staging-data-refresh.md). Never point
  the `staging` deployment at the production Supabase branch.
- Apply the same migrations to both Supabase branches.
- Generate a distinct `TOKEN_ENCRYPTION_KEY` for each environment. Keep each
  key stable after a Wrike connection is saved in that environment.
- `WRIKE_PERMANENT_TOKEN` may use the same read-only Wrike credential in both
  environments when appropriate, but it must remain a protected server-only
  variable.
- Set branch-specific `COURSETRACK_ENVIRONMENT=staging` for `staging`. The app
  uses this value for its persistent non-production banner and browser-title
  prefix. Temporary branches do not receive application environment variables
  because they are not deployed.
- Configure the deployment-readiness and smoke variables exactly as described
  in [`deployment-readiness.md`](deployment-readiness.md). Vercel must retain
  `npm run build:vercel` as its build command; `npm run build:code` is only the
  secret-free source-validation build.

## Normal change workflow

1. Update local `staging` from GitHub.
2. Create `change/<short-description>` from `staging`.
3. Make and test the change, then push the temporary branch.
4. Open a pull request from the temporary branch into `staging`.
5. Wait for CourseTrack CI. Vercel intentionally cancels the temporary-branch
   deployment because temporary branches have no application database.
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

Do not continue adding unrelated work to a temporary branch after its pull
request is merged. Start the next change from the latest `staging` instead.

## Production hotfix

For an urgent production fix, create `change/<short-description>` from `main`,
open a pull request directly into `main`, and rely on CourseTrack CI before
merging. Validate Production immediately after publication, then merge `main`
back into `staging`.

## Recommended GitHub rules

Create clearly named branch rulesets for both long-lived branches:

- `CourseTrack - Production (main)`: require a pull request, CourseTrack CI,
  and the Vercel deployment check; block force pushes and deletion.
- `CourseTrack - Staging (staging)`: require a pull request and CourseTrack
  CI; block force pushes and deletion.
- Allow repository administrators to bypass only for recovery, not as the
  normal release process.

Use merge commits for the `staging` to `main` release pull request, then perform
the documented merge-back. Temporary-change pull requests may use squash merge
to keep their history compact. GitHub environment access must also be limited
so only `main` can use Production values and only `staging` can use staging
values.
