# Read-only LMS provider

`ReadOnlyLmsProvider` is the integration boundary. It exposes only:

- `getCourses`
- `getCourseById`
- `getCourseVersions`
- `getCourseAccreditations`
- `getCourseStatistics`
- `getCourseCategories`
- `healthCheck`

There are deliberately no mutation, assignment, publication, or deletion
methods.

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
