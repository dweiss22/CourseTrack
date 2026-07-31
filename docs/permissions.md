# Roles and permissions

Permissions are centralized in `lib/permissions.ts`, enforced in server routes,
and represented in the Supabase RLS migration.

| Permission | Admin | Course Manager | Instructional Designer | Accreditation Reviewer | Reporting | Read-only |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| View courses | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Edit internal course metadata | ✓ | ✓ | ✓ |  |  |  |
| Archive courses | ✓ | ✓ |  |  |  |  |
| Manage versions | ✓ | ✓ | ✓ |  |  |  |
| Manage accreditation | ✓ | ✓ |  | ✓ |  |  |
| Manage flags | ✓ | ✓ | ✓ | ✓ |  |  |
| Create notes | ✓ | ✓ | ✓ | ✓ |  |  |
| Propose revamps | ✓ | ✓ | ✓ |  |  |  |
| Approve revamps | ✓ | ✓ |  |  |  |  |
| Export reports | ✓ | ✓ |  | ✓ | ✓ |  |
| Retrieve LMS data | ✓ | ✓ | ✓ |  |  |  |
| Manage administration | ✓ |  |  |  |  |  |
| View audit history | ✓ | ✓ |  |  |  |  |

## Enforcement rules

1. No user receives access merely because a control is visible.
2. Server routes resolve identity and re-check the required capability.
3. Supabase RLS denies access when no matching role/permission exists.
4. Service-role ingestion is server-only and never exposed to browser code.
5. LMS data cannot be mutated through any CourseTrack role.
6. Course deletion is omitted; authorized users soft-archive instead.

Local development uses a clearly labeled demo Administrator. Hosted requests use
trusted identity headers and should be paired with a configured CourseTrack role
before production use.
