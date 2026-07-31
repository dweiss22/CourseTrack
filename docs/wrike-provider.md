# Read-only Wrike provider

`ReadOnlyWrikeProvider` is the future integration boundary for discovering work
that can be referenced by a CourseTrack version. It exposes only:

- `searchTasks`
- `getTaskById`
- `healthCheck`

There are deliberately no task creation, editing, assignment, completion, or
deletion methods. Linking a task is an internal CourseTrack operation and never
writes to Wrike.

## Current sample mode

`MockWrikeProvider` returns deterministic, clearly labeled sample projects and
tasks with pagination and search. Sample task references demonstrate the
version workflow without claiming a live connection or inventing undocumented
Wrike API behavior.

## Live-provider assumptions still required

`LiveWrikeProvider` remains unconfigured until the production data link supplies
documented endpoint paths, authentication, accessible task and project fields,
pagination, rate limits, permissions, and stable task URLs. CourseTrack will
store the external task ID, the retrieved display snapshot, link audit fields,
and its own internal version relationship.
