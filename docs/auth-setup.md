# Authentication and user management

CourseTrack uses **Supabase Auth** for authentication (sessions, passwords,
recovery tokens) and an application-owned `profiles` table as the sole
authority for authorization. Each user has **exactly one** of four roles:

- `super_admin`
- `admin`
- `accreditation`
- `content`

There is no additive/composed permission system — a role either grants
access to an area or it doesn't. This replaces the earlier dormant 6-role
scaffold (`roles`/`permissions`/`user_roles`/`role_permissions`), which was
never wired to a real login.

Public signup is disabled. **A user can only get access after an
administrator or super administrator creates their membership** (see
"Adding a user" below).

## 1. Configure environment variables

```dotenv
NEXT_PUBLIC_SUPABASE_URL=       # same project as SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=  # anon/publishable key -- safe to expose, RLS constrains it
```

These are in addition to the existing server-only `SUPABASE_URL` /
`SUPABASE_SECRET_KEY`. The anon key is browser-safe by design — Row Level
Security, not secrecy, is what limits what it can do.

## 2. Apply the migration

Apply `supabase/migrations/202608040002_role_based_auth.sql` (after the
existing migrations) the same way as every other migration in this repo —
see [`docs/supabase-setup.md`](supabase-setup.md). It:

- adds `role`, `account_status`, `created_by` to `profiles` and drops the
  old `active` column;
- drops the unused `roles`/`permissions`/`user_roles`/`role_permissions`
  tables;
- redefines `has_permission()`/`has_permission_for_email()` (same names, so
  every existing RLS policy elsewhere in the schema keeps working
  unchanged) to key off the new `profiles.role` instead;
- conservatively migrates legacy memberships and explicitly disables the
  CourseTrack import identity; and
- adds a second migration that permits one `super_admin` holder and provides
  an atomic, audited transfer workflow.

## 3. Supabase Dashboard configuration

In your Supabase project's **Authentication** settings:

- **Site URL**: your app's public URL (e.g. `https://coursetrack.example.com`).
- **Redirect URLs**: add `<site-url>/auth/callback` (and
  `http://localhost:3000/auth/callback` for local development).
- **Disable sign-ups**: under Authentication → Providers → Email, turn off
  "Allow new users to sign up." CourseTrack never calls the public sign-up
  endpoint, but disabling it at the Supabase level closes the door
  completely — there is no in-app signup path to disable, by design.

## 4. Bootstrap the first super_admin

There is no automated bootstrap endpoint and no hardcoded email in
application code — role assignment must always be intentional. Pick one:

**Option A — Dashboard-created user + manual SQL** (recommended for a first
deployment):
1. In the Supabase Dashboard, Authentication → Users → **Add user**, create
   the first administrator's account (set a password directly, or send an
   invite).
2. In the SQL Editor, run:
   ```sql
   insert into public.profiles (id, email, display_name, role, account_status)
   values ('<their-auth-user-uuid>', '<their-email>', '<their-name>', 'super_admin', 'active');
   ```
   (Find the UUID on the Authentication → Users page.)

**Option B — checked-in bootstrap utility**: after the migrations are applied,
run the idempotent server-only utility for an existing, confirmed Auth user:

```powershell
node --env-file=.env.local scripts/bootstrap-super-admin.mjs --email person@example.com --display-name "Person Name"
```

The utility refuses to run before the role migration, refuses an unconfirmed
Auth identity, and refuses to replace another superadmin. It never creates an
HTTP endpoint or exposes the secret key.

Once one `super_admin` exists, all further users are created through the
in-app **Add user** workflow (Administration → User Management).

## 5. Signing in, password setup, and recovery

- **`/login`** — email + password.
- **`/recover`** — request a password setup/reset link. Always shows the
  same generic confirmation regardless of whether the email has an
  account.
- **`/auth/callback`** — exchanges the Supabase recovery-link code for a
  session, then redirects to `/update-password`. Used for both first-time
  password setup (after an admin adds a user) and forgotten-password
  recovery — they're the same flow.
- **`/update-password`** — sets the new password; requires an active
  (recovery) session, otherwise redirects to `/recover`.
- **Logout** — the "Sign out" control in the sidebar.

### Adding a user

Administration → User Management → **Add user**: enter email, display
name, and role. The server normalizes the email, checks the acting user may
assign that role, creates (or locates) the Supabase Auth identity via the
service-role client, creates the `profiles` membership, and Supabase sends
a setup email automatically (an invite email for a brand-new identity, a
reset email if the Auth identity already existed).

## 6. The four-role access matrix

| Area | super_admin | admin | accreditation | content |
|---|:---:|:---:|:---:|:---:|
| Shared pages (`/`, `/courses`, `/flags`, `/reports`, `/profile`) | ✓ | ✓ | ✓ | ✓ |
| `/accreditation` | ✓ | ✓ | ✓ | ✗ |
| `/versions`, `/revamp`, `/topics-tags` | ✓ | ✓ | ✗ | ✓ |
| `/admin`, `/admin/users` | ✓ | ✓ | ✗ | ✗ |

Landing page after sign-in: `super_admin`/`admin` → `/`; `accreditation` →
`/accreditation`; `content` → `/versions`.

## 7. Administrator limitations

| Action | super_admin | admin |
|---|:---:|:---:|
| Create/manage `accreditation` or `content` users | ✓ | ✓ |
| Change a user between `accreditation` and `content` | ✓ | ✓ |
| Disable/reactivate `accreditation`/`content` users | ✓ | ✓ |
| Resend setup/reset email | ✓ | ✓ |
| Transfer the single `super_admin` role | ✓ (protected workflow) | ✗ |
| Create or modify an `admin` | ✓ | ✗ |
| Change their own role | ✗ | ✗ |

There is exactly one `super_admin`. Ordinary role/status updates cannot create,
demote, disable, or delete that holder. Transfer requires an active successor
who has confirmed their email and signed in at least once; it atomically
promotes the successor, demotes the former holder to `admin`, and writes an
audit record.

## 8. Troubleshooting

- **"You do not have permission to perform this action" (403)**: the
  signed-in user's role doesn't include that action — see the matrices
  above.
- **Stuck on `/access-denied`**: the account is real but its role doesn't
  cover that page; use the "Go to my dashboard" link.
- **Recovery link says expired/invalid**: Supabase recovery links expire;
  request a new one from `/recover` (or have an admin use "Resend email").
- **Superadmin transfer is unavailable**: the successor must be active, have
  confirmed their email, and have signed in at least once.
- **New user never received an email**: check spam, confirm the Supabase
  project's email provider/templates are configured, and try "Resend
  email" from User Management.
