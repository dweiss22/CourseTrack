# CourseTrack Product Requirements Document

**Version:** 1.0  
**Last Updated:** 2026-09-14  
**Owner:** Lexipol LLC  
**Status:** Active Development

---

## Executive Summary

CourseTrack is a course management and accreditation tracking platform built on Next.js and Supabase/PostgreSQL. It serves as the single source of truth for managing compliance training courses, versions, and accreditation requirements across multiple jurisdictions and regulatory standards. The platform enables authorized teams to maintain course libraries, track accreditation status, manage workflow states, and generate compliance reports while preserving complete audit trails and source data immutability.

---

## Product Overview

### Purpose

CourseTrack maintains an immutable record of course source data (uploads and LMS snapshots) while providing an editable application projection for course operations. This "immutable source, editable projection" architecture ensures regulatory compliance, audit trails, and data integrity for mission-critical training operations.

### Core Value Propositions

1. **Data Provenance & Audit Trail** — Every value in the system maintains origin history, current status, and edit tracking for regulatory compliance
2. **Multi-source Integration** — Consolidates course data from workbook uploads, Learning Management Systems (LMS), and internal course management while tracking the source of each piece of data
3. **Accreditation Management** — Centralized tracking of course accreditation status across multiple jurisdictions and regulatory bodies
4. **Workflow Automation** — Structured course lifecycle management through the "Revamp" workflow system for organizing course development and review work
5. **Team Collaboration** — Role-based access control enabling content teams, accreditation specialists, and administrators to work within their domains

### Target Users

- **Super Admins**: System-level administration, user management, full data access
- **Admins**: Content management, workflow approvals, accreditation decisions, user management
- **Content Teams**: Course creation and editing, course library management
- **Accreditation Specialists**: Accreditation status tracking and risk assessment
- **Training Coordinators**: View-only access to course status and compliance metrics

---

## Detailed Feature Set

### 1. Course Management

#### 1.1 Course Library
- **Purpose**: Central repository of all courses with searchable, filterable views
- **Key Capabilities**:
  - Browse all courses with metadata (title, code, duration, status)
  - Search by title, course code, or other course attributes
  - Sort by various criteria (title, code, health status, duration)
  - Track course health scores and accreditation status
  - Filter by status, accreditation requirements, or custom tags
  - View course-to-topic and course-to-tag relationships
  - Mark courses as favorites for quick access

#### 1.2 Course Details & Editing
- **Purpose**: Manage individual course information with field-level provenance tracking
- **Key Capabilities**:
  - View complete course metadata and history
  - Edit coursetrack-owned course fields (title, description, duration, etc.)
  - View read-only LMS API fields with visual indicators
  - Track which course fields originated from uploads vs. LMS vs. CourseTrack
  - Concurrency control with optimistic locking (updated_at tokens)
  - Audit trail of all course changes (who, when, what)
  - Course archival with soft-delete and restoration capability
  - Add and manage course favorites

#### 1.3 Version Management
- **Purpose**: Track course versions and content evolution
- **Key Capabilities**:
  - Create and manage multiple versions per course
  - Mark one version as "current" — enforced by database constraint (one active per course)
  - Track version history with creation/update timestamps
  - Associate Wrike task links with versions (when configured)
  - Version lifecycle: draft → current → archived
  - Atomic version-current transitions via database functions

#### 1.4 Course Topics & Tags
- **Purpose**: Organize courses through taxonomy
- **Key Capabilities**:
  - Maintain course-to-topic relationships
  - Maintain course-to-tag relationships
  - Create and manage topic hierarchies
  - Support multiple tags per course
  - Leverage for filtering and organization in course library
  - Ensure referential integrity through database constraints

### 2. Accreditation Management

#### 2.1 Accreditation Tracking
- **Purpose**: Centralize tracking of course accreditation status across jurisdictions and regulatory bodies
- **Key Capabilities**:
  - Track multiple accreditations per course (organization + jurisdiction combinations)
  - Normalize organization and jurisdiction names (handle whitespace/case variations)
  - Record accreditation details: standard, certifying body, effective dates
  - Identify duplicate accreditation rows for deduplication
  - Mark canonical accreditation records
  - Support bulk imports of accreditation data from workbooks
  - Generate accreditation audit trail with LMS snapshot tracking

#### 2.2 Accreditation Risk Assessment
- **Purpose**: Identify and flag courses at risk of losing accreditations
- **Key Capabilities**:
  - Calculate accreditation health scores for courses
  - Identify at-risk courses (those with missing or incomplete accreditations)
  - Provide risk stratification and prioritization
  - Support accreditation-focused reporting and dashboards
  - Enable filtering by accreditation risk level

#### 2.3 Accreditation Grouping & Organization
- **Purpose**: Aggregate accreditation data for reporting
- **Key Capabilities**:
  - Group courses by organization and jurisdiction
  - Calculate organization-level accreditation coverage
  - Support multi-jurisdiction compliance tracking
  - Enable accreditation reports by organization/jurisdiction

### 3. Workflow Management (Revamp System)

#### 3.1 Workflow States
- **Purpose**: Manage course development and review lifecycle
- **Key Capabilities**:
  - Four active workflow buckets with defined semantics:
    - **Backlog**: Course work not yet started or awaiting initiation
    - **In Progress**: Active development or content review
    - **Approved**: Completed work approved for implementation
    - **Archived**: Completed or cancelled work
  - Integer-based sort order for prioritization within buckets
  - Drag-and-drop movement between buckets (for authorized users)
  - Optimistic concurrency control with rollback on conflicts
  - Workflow audit trail (who moved what when)

#### 3.2 Workflow Tasks
- **Purpose**: Organize course work as actionable items
- **Key Capabilities**:
  - Create, read, update tasks within the workflow
  - Soft-archive tasks for retention and audit trail
  - Atomic task movement via database functions
  - Link tasks to Wrike (when configured) for external tracking
  - Task-to-course relationships for organization

### 4. Data Source Management

#### 4.1 Workbook Import System
- **Purpose**: Ingest course data from Excel workbooks
- **Key Capabilities**:
  - Support bulk course imports from standardized workbooks
  - Immutable storage of raw upload payloads and checksums
  - Validation and error reporting before apply
  - Idempotent apply operations (safe to re-run)
  - Course ID stability across imports
  - Automatic backfill of provenance (uploaded vs. manual)
  - Fingerprinting to prevent duplicate accreditation rows
  - Complete import run history with actor and timestamp
  - Normalization of course data (trim values for comparison)
  - Configurable source manifests and validation rules
  - Support for multiple workbook sources (LMS courses, master list, accreditation data)

#### 4.2 LMS API Connector
- **Purpose**: Optionally sync course data from LMS systems
- **Key Capabilities**:
  - Read-only GET operations (no create/update/delete)
  - Immutable snapshot storage of API responses
  - Fields marked with `lms_api` provenance (read-only in UI)
  - Fallback to last successful snapshot on retrieval failures
  - Immutable retrieval-run history (timestamp, actor, status)
  - 503 lms_not_connected return when not configured
  - Version change tracking remains CourseTrack-owned
  - Clear UI indicators for LMS-connected fields

#### 4.3 Wrike Integration
- **Purpose**: Optionally link CourseTrack versions to Wrike tasks
- **Key Capabilities**:
  - Read-only connector — no task creation/update/delete
  - Cache approved Wrike task fields
  - Add Wrike Task Links to CourseTrack versions
  - Legacy Mock Wrike references soft-unlinked via migrations
  - Cleanup report generation for reference migration
  - Connector unavailable until explicitly configured

### 5. Reporting & Analytics

#### 5.1 Reporting Engine
- **Purpose**: Generate compliance and operational reports
- **Key Capabilities**:
  - Accreditation status reports
  - Course inventory reports
  - Health score dashboards
  - Compliance risk assessments
  - Course library analytics
  - Exportable report formats (CSV, Excel)
  - Scheduled or on-demand report generation

#### 5.2 Dashboard & Metrics
- **Purpose**: Provide real-time visibility into course operations
- **Key Capabilities**:
  - Course health score visualization
  - Accreditation coverage by organization/jurisdiction
  - Workflow status overview
  - At-risk course identification
  - Recent activity tracking
  - Team activity metrics

### 6. Data Integrity & Compliance

#### 6.1 Provenance Tracking
- **Purpose**: Maintain complete lineage of all data
- **Labels**:
  - `uploaded` — Data from workbook imports; immutable source, editable projection
  - `lms_api` — Data from LMS API connector; read-only, cannot be edited
  - `coursetrack` — Data created or edited in CourseTrack; fully editable

#### 6.2 Audit Trail
- **Purpose**: Support regulatory compliance and issue investigation
- **Key Capabilities**:
  - Record all mutations with actor ID, timestamp, and change details
  - Immutable audit logs (append-only)
  - Soft-archive metadata (actor, timestamp) for all records
  - Hard-delete audit for manual taxonomy/relationship assignments only
  - Complete change history queryable and exportable
  - Support for compliance investigations and data recovery

#### 6.3 Concurrency & Consistency
- **Purpose**: Prevent data corruption and conflicting updates
- **Key Capabilities**:
  - Optimistic concurrency control via `updated_at` tokens
  - HTTP 409 Conflict responses on version mismatches
  - Database constraints enforcing business rules
  - RLS policies protecting per-user data (favorites)
  - Atomic transactions for complex operations (version changes, workflow moves)
  - Database functions for transactions that must be indivisible

### 7. User Management & Authentication

#### 7.1 Authentication
- **Purpose**: Secure access to course data
- **Key Capabilities**:
  - Supabase session-based authentication
  - Protected pages redirect unauthorized users to login
  - Explicit error when authentication fails (no synthetic identity)
  - Session persistence across page reloads
  - Password reset and account recovery flows
  - Failed-closed behavior (auth missing = error, not fallback)

#### 7.2 User Profiles & Roles
- **Purpose**: Define user capabilities and access levels
- **Key Capabilities**:
  - User profile management (name, email, preferences)
  - Role assignment (super_admin, admin, content, accreditation)
  - One active role per profile
  - Super admin transfer workflow
  - Audit trail of role changes
  - User listing and management for admins

#### 7.3 Access Control
- **Purpose**: Enforce role-based permissions
- **Key Capabilities**:
  - `super_admin` — Full system access; user management; role assignment
  - `admin` — Content editing; workflow approvals; accreditation decisions; user viewing
  - `content` — Course and version management; content editing
  - `accreditation` — Accreditation viewing and assessment (no editing)
  - All roles can flag content and create notes
  - Per-user RLS for favorites (users see only their own)
  - Note author, admin, super_admin can edit/archive notes
  - LMS refresh restricted to super_admin, admin, content after connector configuration

### 8. Deployment & Operations

#### 8.1 Multi-Environment Support
- **Purpose**: Support development, staging, and production deployments
- **Environments**:
  - `main` — Production application
  - `staging` — Persistent staging environment
  - `change/<description>` — Temporary feature branches (CI only, no database)

#### 8.2 Database Migrations
- **Purpose**: Version and track schema changes
- **Key Capabilities**:
  - Checked-in migrations applied to dev databases only
  - Staging/Production migrations applied via protected release workflows
  - Planning and preflight check scripts
  - Smoke tests and health checks post-deployment
  - Automatic backup before production deployment
  - Backup verification and restore capability

#### 8.3 Data Verification & Audit
- **Purpose**: Ensure data integrity and catch issues early
- **Key Capabilities**:
  - Deployment readiness checks
  - Course data audits (vs. source systems)
  - Smoke test suite for health checks
  - Production backup verification
  - Data rollout preflight checks
  - Course data comparison reports

---

## User Journeys

### Journey 1: Course Content Manager Updating Course Information

1. Log in to CourseTrack
2. Navigate to Course Library
3. Search or browse to find course of interest
4. Open course detail view
5. Review course metadata and provenance labels
6. Edit CourseTrack-owned fields (title, description, duration)
7. Save changes (with optimistic concurrency check)
8. View updated audit trail confirming change
9. Navigate to related topics/tags if needed
10. Add/remove topic or tag associations
11. Save course as favorite for quick access

### Journey 2: Accreditation Specialist Assessing Risk

1. Log in to CourseTrack (accreditation role)
2. Navigate to Accreditation view
3. View courses grouped by organization/jurisdiction
4. Identify at-risk courses (missing or incomplete accreditations)
5. Review accreditation details for specific courses
6. Compare against known standards
7. Generate accreditation risk report
8. Export report for stakeholder review
9. Flag specific courses needing attention
10. Create note documenting risk assessment

### Journey 3: Workflow Manager Moving Course to Approved

1. Log in to CourseTrack (admin role)
2. Navigate to Revamp workflow view
3. Review tasks in "In Progress" bucket
4. Drag task to "Approved" bucket
5. System performs optimistic concurrency check
6. Task moves atomically; audit trail updated
7. Wrike link (if configured) noted for external tracking
8. Navigate to course detail to verify changes
9. Generate report showing approved courses

### Journey 4: Administrator Importing Course Data

1. Receive Excel workbook with course data
2. Run `npm run import:course-workbooks` for dry-run validation
3. Verify counts match expected acceptance criteria
4. Address any validation errors if detected
5. Run `npm run import:course-workbooks:apply` to import
6. Verify course IDs remain stable
7. Confirm coursetrack overrides were respected
8. Check audit trail for import run
9. Review immutable raw metadata and LMS snapshot history

### Journey 5: Super Admin Managing Users

1. Log in to CourseTrack (super_admin role)
2. Navigate to Admin → Users
3. View list of active users and their roles
4. Select user to review role and activity
5. Update user role if needed
6. Perform super admin transfer if necessary
7. Review audit trail of role changes
8. Verify new role is applied to protected resources

---

## Technical Requirements

### Technology Stack

- **Frontend Framework**: Next.js 16.2.6 with React 19.2.6
- **Backend**: Node.js 22.13+
- **Database**: PostgreSQL via Supabase
- **ORM/Query**: pg (native PostgreSQL), Supabase SDK
- **UI Components**: React components with Tailwind CSS 4.2.1
- **Tables**: @tanstack/react-table 8.21.3
- **Charts**: Recharts 3.10.1
- **Date Handling**: date-fns 4.4.0
- **Icons**: lucide-react 1.28.0
- **Validation**: Zod 4.4.3
- **Styling**: Tailwind CSS 4.2.1

### Development Tools

- **Build**: Vite 8.0.13 with Vinext adapter
- **Testing**: Vitest (unit), Testing Library (component), Vitest-axe (a11y)
- **Type Checking**: TypeScript 5.9.3
- **Linting**: ESLint 9.39.4
- **Database Management**: Supabase CLI
- **CDN/Edge**: Cloudflare Workers (Wrangler 4.92.0)

### Database Requirements

- **Immutable Tables**: Append-only storage for raw uploads, LMS snapshots, import runs, audit logs
- **Projection Tables**: Application-owned tables with soft-archive capability
- **Constraints**:
  - One active current version per course (partial unique index)
  - Per-user RLS for favorites
  - Referential integrity for relationships
- **Functions**: Atomic operations for favorites, version changes, workflow moves, archive operations
- **Policies**: RLS policies protecting per-user and sensitive data

### API Requirements

#### Authentication & Authorization
- Supabase session validation before all protected endpoints
- Role-based authorization checks
- Explicit error responses (no synthetic identities)
- 401/403/404/409/422/500-class error handling

#### Request/Response Contracts
- Strict Zod schema validation for all mutations
- Shared schema definitions across frontend and API
- Typed error responses with actionable details
- Concurrency control via ETags or version fields
- Pagination support for large result sets

#### Data Endpoints
- `/api/courses` — List/search/filter courses
- `/api/courses/[id]` — Get/update course details
- `/api/courses/[id]/versions` — Manage course versions
- `/api/accreditation` — Get accreditation status
- `/api/revamp` — Get/move workflow tasks
- `/api/lms/retrieve` — Trigger LMS refresh (when configured)
- `/api/reports/[id]` — Generate reports
- `/api/favorites` — Manage user favorites

### Security & Compliance

- **Authentication**: Supabase session-based with failed-closed behavior
- **Authorization**: Role-based access control enforced at API and database layers
- **Data Immutability**: Append-only audit logs; soft-delete for reversibility
- **Audit Trail**: Complete record of who made what changes when
- **Compliance**: Support for regulatory investigations; data export capabilities
- **Encryption**: Supabase-managed encryption at rest
- **Network**: HTTPS-only; CORS properly configured

### Performance Requirements

- **Course Library**: Search and sort 18,000+ courses efficiently
- **Database**: Support for 7,000+ accreditation groupings
- **Reporting**: Generate reports on-demand within 10 seconds
- **API Latency**: < 500ms p95 for read operations; < 1s p95 for writes
- **Pagination**: Support large result sets with cursor-based pagination
- **Search Indexes**: Optimized indexes on course title, code, health status, duration

### Scalability

- **Concurrent Users**: Support 100+ concurrent active users
- **Data Growth**: Scale to 50,000+ courses and 100,000+ accreditation records
- **Audit Trail**: Append-only audit logs supporting unlimited growth
- **Import Operations**: Bulk import of 18,000+ courses in < 5 minutes

---

## Success Metrics

### Business Metrics
- **Course Coverage**: 100% of required courses maintain accreditation status
- **Compliance Risk**: 95%+ of at-risk courses identified and flagged within 24 hours
- **Audit Ready**: 100% of data changes auditable and exportable for compliance
- **User Adoption**: 80%+ of authorized teams actively using platform within Q1

### Operational Metrics
- **Data Integrity**: Zero data corruption incidents; 100% audit trail accuracy
- **System Availability**: 99.5% uptime for production environment
- **Import Success Rate**: 100% successful imports with zero data loss
- **Deployment Frequency**: Staging deployments multiple times weekly; production as-needed

### User Experience Metrics
- **Performance**: 95%+ of pages load in < 2 seconds
- **Error Rate**: < 0.1% of API calls result in 5xx errors
- **User Satisfaction**: > 4.0/5.0 net satisfaction score from surveys
- **Feature Completeness**: All documented features working as specified

---

## Success Criteria for Launch

### Functional Completeness
- [ ] All core features (course management, accreditation, workflow) fully functional
- [ ] All CRUD operations (create, read, update, delete/archive) working with proper constraints
- [ ] Role-based access control enforced correctly for all roles
- [ ] Audit trail captures all changes with proper actor/timestamp attribution

### Data Integrity
- [ ] Immutable source data (uploads, LMS snapshots) preserved correctly
- [ ] Provenance labels accurate for all data sources
- [ ] Optimistic concurrency control prevents conflicts
- [ ] Database constraints enforced for all business rules
- [ ] RLS policies protecting sensitive data

### Testing
- [ ] Unit tests > 80% code coverage
- [ ] Contract tests validating API schemas
- [ ] Component tests for UI interactions
- [ ] Accessibility tests (vitest-axe) passing
- [ ] Integration tests validating end-to-end workflows
- [ ] Manual smoke tests passing on staging

### Documentation
- [ ] API documentation complete with examples
- [ ] Database schema documented with relationships
- [ ] User guides for each role
- [ ] Deployment procedures documented
- [ ] Runbooks for common operations

### Deployment Readiness
- [ ] Staging environment mirrors production setup
- [ ] All migrations tested on dev and staging
- [ ] Backup and restore procedures tested
- [ ] Rollback procedures documented
- [ ] Performance benchmarks met
- [ ] Security review completed

---

## Known Constraints & Decisions

### Immutability
- **Decision**: Raw uploads and LMS snapshots are append-only; never modified or deleted
- **Rationale**: Regulatory compliance, audit trail integrity, data recovery capability
- **Impact**: Corrections require new entries, not in-place updates

### LMS API Read-Only
- **Decision**: LMS connector only retrieves data; no push or update capability
- **Rationale**: LMS is system of record for LMS data; CourseTrack manages course metadata locally
- **Impact**: Course changes in LMS don't automatically sync; manual refresh required

### Version Enforcement
- **Decision**: One active current version per course, enforced by database constraint
- **Rationale**: Clear canonical version; prevents ambiguity
- **Impact**: Must archive previous version before marking new one as current

### Soft-Delete Architecture
- **Decision**: Most records soft-deleted (archived) rather than hard-deleted
- **Rationale**: Preserves audit trail and enables recovery
- **Impact**: Queries must filter archived records; storage grows over time

### Roles Are Exclusive
- **Decision**: Each user has exactly one active role; no role combinations
- **Rationale**: Simpler permissions model; clearer accountability
- **Impact**: Users need multiple logins or role switches for multi-role workflows

---

## Future Roadmap (Out of Scope)

The following features are identified for future consideration but are not in the current scope:

1. **Course Publishing**: Automated publishing to LMS or other systems
2. **Learner Enrollment**: Integration with learner enrollment workflows
3. **Completion Tracking**: Student completion reporting and progress tracking
4. **Assessment Integration**: Linking assessments to courses
5. **Bulk Export/Import**: Excel export and re-import workflows
6. **Scheduled Reports**: Automated report generation and distribution
7. **Advanced Workflow**: Multi-step approval chains or conditional workflows
8. **Course Templates**: Template-based course creation for faster setup
9. **Localization**: Multi-language support
10. **Mobile App**: Native mobile application for on-the-go access

---

## Acceptance Criteria

### Course Library
- [x] Search returns all matching courses
- [x] Filters work independently and in combination
- [x] Sort orders are deterministic and stable
- [x] Health scores calculate correctly
- [x] Provenance labels display accurately
- [x] Favorites persist across sessions

### Accreditation
- [x] Accreditation groups calculate correctly
- [x] At-risk identification accurate
- [x] Organization/jurisdiction normalization working
- [x] Duplicate detection and deduplication working
- [x] Reports generate and export correctly

### Workflow
- [x] Tasks move between buckets atomically
- [x] Sort order preserved on move
- [x] Concurrent moves don't corrupt state
- [x] Audit trail captures all moves
- [x] Archive/restore working

### Data Sources
- [x] Workbook imports validate correctly
- [x] Dry-run matches acceptance counts exactly
- [x] Apply mode idempotent (safe to re-run)
- [x] Course IDs stable across imports
- [x] Provenance backfilled correctly
- [x] LMS connector reads and caches correctly
- [x] Wrike links created without modifying Wrike

### Authentication & Authorization
- [x] Protected pages reject unauthenticated users
- [x] Roles enforce correct permissions
- [x] Audit trail captures role changes
- [x] User management working for super_admin
- [x] Failed-closed behavior (no synthetic identity)

---

## Appendix: Key Entities

### Core Entities
- **Courses**: Central course record with metadata, provenance, and field-level tracking
- **Course Versions**: Course content versions with current/archived states
- **Accreditations**: Accreditation records grouped by organization and jurisdiction
- **Revamp Tasks**: Workflow tasks for course management organized in buckets
- **User Profiles**: User records with role, authentication, and preferences

### Supporting Entities
- **Topics**: Course categorization taxonomy
- **Tags**: Course labeling for flexible organization
- **Course Favorites**: Per-user bookmarks
- **Notes**: User-created annotations on courses
- **Flags**: Alerts/issues flagged on courses
- **Wrike Links**: External Wrike task references

### Audit/History Entities
- **Import Runs**: Immutable record of workbook imports
- **Retrieval Runs**: Immutable record of LMS API calls
- **Audit Logs**: Immutable record of all mutations
- **Upload History**: Raw workbook payload storage
- **LMS Snapshots**: Immutable LMS API response storage

---

## Related Documentation

- `docs/architecture.md` — System architecture and design patterns
- `docs/database-schema.md` — Complete schema with tables and relationships
- `docs/permissions.md` — Detailed role-based access control matrix
- `docs/import-mapping.md` — Workbook import mapping and normalization
- `docs/lms-provider.md` — LMS connector configuration and behavior
- `docs/wrike-provider.md` — Wrike integration details
- `docs/deployment-workflow.md` — Release and deployment procedures

---

**End of PRD**
