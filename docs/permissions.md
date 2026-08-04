# Permissions

Each active profile has exactly one role. Authentication is performed before lookup so unauthorized callers cannot enumerate records.

| Capability | Roles |
|---|---|
| Courses, versions, taxonomy, relationships, Revamp details | `super_admin`, `admin`, `content` |
| Move Revamp work into Approved | `super_admin`, `admin` |
| Accreditation | `super_admin`, `admin`, `accreditation` |
| Flags | all four roles |
| Create notes | all four roles |
| Edit/archive notes | note author, `admin`, `super_admin` |
| Favorites | each user manages only their own |
| LMS refresh | `super_admin`, `admin`, `content` after connector configuration |

API checks are paired with database functions, policies, constraints, actor attribution, and audit insertion. Connected via LMS API records are rejected by write functions even when a caller otherwise has the role. Concurrency mismatches return HTTP 409.
