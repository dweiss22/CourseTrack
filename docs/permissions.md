# Roles and permissions

CourseTrack has exactly four exclusive roles — a user has one, never more
than one, and roles are never composed or additive. See
[`docs/auth-setup.md`](auth-setup.md) for the full authentication and
user-management setup.

| Area | super_admin | admin | accreditation | content |
| --- | :---: | :---: | :---: | :---: |
| Shared pages (dashboard, course library, flags, reports, profile) | ✓ | ✓ | ✓ | ✓ |
| Accreditation area | ✓ | ✓ | ✓ | ✗ |
| Content area (versions, revamp planning, topics & tags) | ✓ | ✓ | ✗ | ✓ |
| User management, system settings | ✓ | ✓ | ✗ | ✗ |
| Manage another `admin` or `super_admin` | ✓ (not self) | ✗ | ✗ | ✗ |

## Enforcement rules

1. No user receives access merely because a control is visible in the UI —
   the interface hides actions a role can't perform, but the server is
   always authoritative (`lib/auth.ts`'s `require*` guards).
2. `middleware.ts`/`proxy.ts` only handles the broad "is there a session"
   redirect; every server component, API route, and database policy
   independently re-checks the caller's real role.
3. The `profiles.role` column (backed by Supabase Auth's `auth.users`) is
   the single source of truth. Nothing derives a role from browser input,
   query parameters, local storage, or Supabase Auth metadata.
4. Row Level Security enforces the same rules at the database boundary —
   `has_permission()`/`has_permission_for_email()` key off `profiles.role`,
   and a trigger independently blocks self-role-changes and removing the
   last active `super_admin`, regardless of caller.
5. Service-role ingestion (Wrike sync, LMS retrieval) is server-only and
   never exposed to browser code.
6. LMS data cannot be mutated through any CourseTrack role.
7. Course deletion is omitted; authorized users soft-archive instead. User
   accounts follow the same pattern — disable/reactivate, never delete.

Historical note: an earlier, dormant 6-role/13-permission additive scaffold
existed in this schema but was never connected to a real login. It has been
fully replaced by the model above (migration
`202608040002_role_based_auth.sql`).
