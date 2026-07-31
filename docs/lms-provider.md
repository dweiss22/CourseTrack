# Read-only LMS provider

`ReadOnlyLmsProvider` is the integration boundary. It exposes only:

- `getCourses`
- `getCourseById`
- `getCourseAccreditations`
- `getCourseStatistics`
- `getCourseCategories`
- `healthCheck`

There are deliberately no mutation, assignment, publication, or deletion
methods.

## Version boundary

The LMS has an internal versioning mechanism, but it is not communicated to
CourseTrack. The provider contract therefore exposes no version endpoint and
CourseTrack does not infer version changes from LMS timestamps, titles, or
payload differences. `course_versions` is an app-owned ledger maintained only
inside CourseTrack.

## Retrieval lifecycle

1. Create a retrieval run with an explicit actor and correlation identifier.
2. Call the configured provider from the server.
3. Normalize external values into provider-neutral objects.
4. Record mapping warnings without silently dropping the record.
5. Persist an immutable snapshot and payload hash.
6. Promote the snapshot only after a successful retrieval.
7. On failure, close the run as failed and keep the previous snapshot current.

## Provider implementations

- `MockLmsProvider` supplies deterministic healthy, warning, and outage modes.
- `LiveLmsProvider` is intentionally configuration-only. Its routes, auth flow,
  field map, rate limits, and pagination will be implemented only from confirmed
  provider documentation.

## Security

- Credentials remain in server-side environment variables.
- Tokens and raw secrets are never logged or returned to the client.
- The browser calls only same-origin CourseTrack APIs.
- Token acquisition may require a provider-defined POST, but business-data
  operations remain read-only.
