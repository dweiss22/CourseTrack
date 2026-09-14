# CourseTrack Superblocks Migration Guide

**Version:** 1.0  
**Last Updated:** 2026-09-14  
**Purpose:** Technical blueprint for rebuilding CourseTrack in Superblocks  
**Status:** Planning Phase

---

## Executive Summary

This document outlines the technical strategy for rebuilding CourseTrack from a custom Next.js/Supabase application to a Superblocks-based internal tool. The migration preserves all current functionality while leveraging Superblocks' low-code platform for faster feature development and reduced maintenance overhead.

**Key Benefits:**
- Faster UI development with visual builder
- Reduced custom code and infrastructure management
- Built-in authentication and access control
- Lower DevOps overhead
- Easier for non-technical team members to maintain
- Faster iteration cycles

**Key Considerations:**
- Database must remain Supabase/PostgreSQL
- All existing audit trail and immutability patterns must be preserved
- Custom business logic may require JavaScript components
- Performance optimization needed for large result sets
- Cost implications of Superblocks licensing

---

## Platform Overview: Superblocks vs. Current Setup

### Current Architecture (Next.js/Supabase)
```
Frontend: React 19 + Next.js 16 (Custom Components)
  ↓
API Layer: Next.js API Routes + Zod Validation
  ↓
Database: PostgreSQL via Supabase
  ↓
External APIs: LMS, Wrike (Custom Integration Code)
```

### Proposed Architecture (Superblocks)
```
UI Layer: Superblocks Visual Builder + React Components
  ↓
Query Layer: Superblocks SQL Editor + JavaScript Transformers
  ↓
Database: PostgreSQL via Supabase (Same)
  ↓
External APIs: Superblocks REST Connectors
  ↓
Backend Logic: Superblocks Server-side JavaScript
```

### Migration Scope

| Component | Current | Superblocks | Effort |
|---|---|---|---|
| Course Library UI | React Components | Superblocks Builder | Medium |
| Course Editor | Form Components | Form Builder | Medium |
| Accreditation Views | Custom Dashboards | Table Builder + Charts | Medium |
| Revamp Workflow | Drag-drop React | Kanban Component | Low |
| Reports | Custom Components | Report Builder | Medium |
| Audit Trails | API + Database | Read-only Queries | Low |
| Authentication | Supabase Sessions | Superblocks SSO | Medium |
| Data Validation | Zod + API | Superblocks Validation | Low |
| LMS Integration | Custom API Client | REST Connector | Low |
| Wrike Integration | Custom Code | REST Connector | Low |

---

## Data Architecture & Connections

### Primary Data Source: Supabase PostgreSQL

#### Connection Configuration
```
Type: PostgreSQL
Host: [supabase-project].supabase.co
Port: 5432
Database: postgres
Username: postgres (service role)
Password: [service role key]
SSL: Required
```

#### Connection Strategy
- **Service Role Connection**: Server-side queries with full permissions
  - Used for all administrative queries
  - Enforces Superblocks auth before execution
  - Cannot be bypassed by client-side manipulation
  
- **Anon Role Connection**: Client-side queries with RLS
  - Limited to publicly exposed operations
  - Relies on PostgreSQL Row-Level Security
  - Not recommended for CourseTrack (sensitive data)

**Recommendation**: Use Service Role connection with explicit role-based filtering in Superblocks, combined with Superblocks' built-in access control.

#### Query Performance Considerations
- **Pagination**: Critical for 18,000+ course queries
  - Use cursor-based pagination (KEYSET pagination)
  - Implement LIMIT + OFFSET for UI with caching
  - Cache frequently accessed results (favorites, home page)

- **Indexing Requirements**:
  - Course title, course_code, health_status (sort performance)
  - Created_at, updated_at (audit queries)
  - provenance (filter operations)
  - course_id + user_id (favorites, per-user RLS)

- **Query Optimization**:
  - Use materialized views for complex accreditation aggregations
  - Pre-calculate health scores on update (not on read)
  - Batch import operations in stored procedures
  - Connection pooling at Supabase level

### Secondary Data Sources

#### LMS API Connector
```
Type: REST API
Base URL: [customer-lms-endpoint]
Authentication: Bearer Token or OAuth2
Headers: Custom headers per LMS vendor
Rate Limiting: Handle 429 responses with backoff
Timeout: 30 seconds per request
```

**Superblocks Configuration**:
- Create REST resource named `lms_api`
- Store API key in Superblocks secrets manager
- Use Superblocks scheduled tasks for periodic sync
- Implement error handling and retry logic

**Data Handling**:
- Immutable storage of raw API responses in `lms_snapshots` table
- Trigger Supabase function `sync_lms_data()` on successful response
- Never update existing LMS data; append new snapshots only
- Maintain `retrieval_runs` audit table with timestamp/actor

#### Wrike Integration
```
Type: REST API
Base URL: https://www.wrike.com/api/v4/
Authentication: Bearer Token (OAuth2 preferred)
Rate Limiting: Respect Wrike's rate limits (500 requests/min)
Timeout: 30 seconds
Scope: Read-only (tasks, custom fields)
```

**Superblocks Configuration**:
- Create REST resource named `wrike_api`
- Store OAuth token in secrets with refresh capability
- Implement token refresh logic (refresh before expiry)
- Cache Wrike custom field definitions (rarely changes)

**Data Handling**:
- Read-only connector; never write to Wrike
- Cache task fields on demand
- Store Wrike links in CourseTrack only
- Maintain linkage in `course_version_wrike_links` table

---

## Feature-by-Feature Implementation

### 1. Course Library (Search & Browse)

#### Current Implementation
- Next.js page with React components
- Server-side filtering and sorting
- Tanstack React Table for large datasets
- Full-text search on course title/code

#### Superblocks Implementation

**UI Components**:
- Table component with 18,000+ row support
- Search input with debouncing
- Filter dropdowns (status, accreditation risk, topics)
- Sort controls (title, code, health, duration)
- Favorites toggle button

**Query Structure**:
```sql
-- Main query with pagination and filtering
SELECT 
  c.id,
  c.title,
  c.course_code,
  c.description,
  c.duration_minutes,
  c.health_score,
  c.status,
  c.provenance,
  cv.id as current_version_id,
  COUNT(ca.id) as accreditation_count,
  COALESCE(cf.user_id IS NOT NULL, false) as is_favorited
FROM courses c
LEFT JOIN course_versions cv ON c.id = cv.course_id AND cv.archived_at IS NULL
LEFT JOIN course_accreditations ca ON c.id = ca.course_id AND ca.archived_at IS NULL
LEFT JOIN course_favorites cf ON c.id = cf.course_id AND cf.user_id = {{currentUser.id}}
WHERE (c.title ILIKE {{searchInput.value}} OR c.course_code ILIKE {{searchInput.value}})
  AND c.archived_at IS NULL
  AND ({{statusFilter.value}} IS NULL OR c.status = {{statusFilter.value}})
ORDER BY {{sortOrder.value}}
LIMIT {{pageSize.value}} OFFSET {{pageOffset.value}};
```

**Transformer Logic**:
```javascript
// Superblocks transformer to calculate derived fields
return data.map(course => ({
  ...course,
  riskLevel: course.accreditation_count === 0 ? 'high' : 'low',
  isEditable: course.provenance !== 'lms_api',
  provenanceLabel: {
    'uploaded': 'Uploaded',
    'lms_api': 'Connected via LMS API',
    'coursetrack': 'CourseTrack'
  }[course.provenance]
}));
```

**Performance**: 
- Implement cursor-based pagination to handle 18,000+ courses
- Cache search results for 5 minutes
- Use database indexes on title, code, status

**Favorites Management**:
- Toggle button triggers Supabase function `toggle_course_favorite()`
- Instant UI update with optimistic rendering
- RLS prevents viewing other users' favorites

---

### 2. Course Editor (Detail & Editing)

#### Current Implementation
- React form with controlled inputs
- Field-level change tracking
- Optimistic concurrency control with `updated_at`
- Inline validation with Zod schemas

#### Superblocks Implementation

**UI Components**:
- Form component with validation
- Read-only display for `lms_api` provenance fields
- Provenance label display
- Change history timeline
- Audit trail expandable section

**Query Structure**:
```sql
-- Get course detail with all relationships
SELECT 
  c.*,
  cv.id as current_version_id,
  cv.version_number,
  cv.title as version_title,
  json_agg(json_build_object('topic_id', ct.topic_id, 'topic_name', t.name)) as topics,
  json_agg(json_build_object('tag_id', ctag.tag_id, 'tag_name', tg.name)) as tags
FROM courses c
LEFT JOIN course_versions cv ON c.id = cv.course_id AND cv.archived_at IS NULL
LEFT JOIN course_topics ct ON c.id = ct.course_id AND ct.archived_at IS NULL
LEFT JOIN topics t ON ct.topic_id = t.id
LEFT JOIN course_tags ctag ON c.id = ctag.course_id AND ctag.archived_at IS NULL
LEFT JOIN tags tg ON ctag.tag_id = tg.id
WHERE c.id = {{courseId.value}}
GROUP BY c.id, cv.id, cv.version_number, cv.title;
```

**Edit Mutation**:
```sql
-- Superblocks update query with concurrency check
UPDATE courses
SET 
  title = {{courseForm.data.title}},
  description = {{courseForm.data.description}},
  duration_minutes = {{courseForm.data.duration}},
  provenance = 'coursetrack', -- Mark as edited in CourseTrack
  updated_by = {{currentUser.id}},
  updated_at = now()
WHERE id = {{courseId.value}}
  AND updated_at = {{originalCourse.updated_at}} -- Optimistic lock
RETURNING *;
```

**Error Handling**:
```javascript
// Transformer to detect concurrency conflicts
if (response.status === 409 || response.rowCount === 0) {
  showError('Course was modified by another user. Please refresh and try again.');
  refreshCourseData(); // Re-fetch latest version
  return;
}
```

**Validation Rules**:
- Title: Required, max 500 chars
- Duration: Positive number, < 10000 minutes
- Description: Optional, max 5000 chars
- Provenance display: Read-only, informational only

**Audit Logging**:
- Before/after JSON stored in audit table
- Automatic via trigger on UPDATE
- Accessible via read-only audit query

---

### 3. Accreditation Management

#### Current Implementation
- Custom accreditation grouping logic in TypeScript
- Risk assessment calculations
- Multi-jurisdiction reporting

#### Superblocks Implementation

**Risk Assessment Query**:
```sql
-- Identify at-risk courses (missing required accreditations)
SELECT 
  c.id,
  c.title,
  c.course_code,
  COUNT(DISTINCT ca.id) as accreditation_count,
  CASE 
    WHEN COUNT(DISTINCT ca.id) = 0 THEN 'high'
    WHEN COUNT(DISTINCT ca.id) < 3 THEN 'medium'
    ELSE 'low'
  END as risk_level,
  MAX(ca.created_at) as last_accreditation_date
FROM courses c
LEFT JOIN course_accreditations ca ON c.id = ca.course_id 
  AND ca.archived_at IS NULL
WHERE c.archived_at IS NULL
GROUP BY c.id, c.title, c.course_code
HAVING COUNT(DISTINCT ca.id) < 3; -- Configurable threshold
```

**Accreditation Grouping Query**:
```sql
-- Group by organization and jurisdiction
SELECT 
  TRIM(UPPER(ca.organization)) as org,
  TRIM(UPPER(ca.jurisdiction)) as jurisdiction,
  COUNT(DISTINCT c.id) as course_count,
  COUNT(DISTINCT CASE WHEN c.health_score >= 80 THEN c.id END) as healthy_count,
  ROUND(100.0 * COUNT(DISTINCT CASE WHEN c.health_score >= 80 THEN c.id END) / 
    COUNT(DISTINCT c.id), 1) as compliance_percentage
FROM course_accreditations ca
JOIN courses c ON ca.course_id = c.id
WHERE ca.archived_at IS NULL
  AND c.archived_at IS NULL
GROUP BY TRIM(UPPER(ca.organization)), TRIM(UPPER(ca.jurisdiction))
ORDER BY compliance_percentage ASC;
```

**UI Components**:
- Data table showing at-risk courses
- Accreditation heatmap by org/jurisdiction
- Status badges (Compliant, At-Risk, Critical)
- Export to CSV button

**Access Control**:
- `accreditation` role: View-only
- `admin`, `super_admin`: Full edit access
- Use Superblocks row-level access to enforce

---

### 4. Revamp Workflow System

#### Current Implementation
- React drag-drop with @dnd-kit
- Four buckets: Backlog, In Progress, Approved, Archived
- Optimistic concurrency with rollback
- Database atomic transactions

#### Superblocks Implementation

**UI Components**:
- Superblocks Kanban component (if available) OR
- Custom Kanban built with HTML/CSS (if needed)
- Drag-drop between buckets (Backlog → In Progress → Approved → Archived)
- Task cards with course details

**Query Structure**:
```sql
-- Get workflow tasks grouped by bucket
SELECT 
  rt.id,
  rt.course_id,
  c.title as course_title,
  c.course_code,
  rt.bucket_key,
  rt.sort_order,
  rt.created_by,
  rt.updated_at,
  rt.archived_at
FROM revamp_tasks rt
JOIN courses c ON rt.course_id = c.id
WHERE rt.archived_at IS NULL
ORDER BY rt.bucket_key, rt.sort_order;
```

**Move Mutation** (via Supabase function for atomicity):
```sql
-- Call Supabase function to move task with concurrency check
SELECT move_revamp_task(
  {{taskId.value}},
  {{newBucket.value}},
  {{newSortOrder.value}},
  {{currentUser.id}},
  {{lastUpdatedAt.value}} -- concurrency token
);
```

**Error Handling**:
```javascript
// Handle concurrent move conflicts
if (response.error?.message?.includes('concurrent')) {
  showError('Task was moved by another user. Refreshing...');
  refreshWorkflow();
  return;
}
```

**Bucket Definitions**:
```json
{
  "buckets": [
    {"key": "backlog", "label": "Backlog", "order": 1},
    {"key": "in_progress", "label": "In Progress", "order": 2},
    {"key": "approved", "label": "Approved", "order": 3},
    {"key": "archived", "label": "Archived", "order": 4}
  ]
}
```

---

### 5. Reporting & Analytics

#### Current Implementation
- Custom React components with Recharts
- Real-time dashboard data
- Exportable reports (CSV, Excel)

#### Superblocks Implementation

**Report Types**:
1. **Accreditation Status Report**
   - Courses by org/jurisdiction
   - Compliance percentages
   - At-risk course list
   - Export: CSV, PDF

2. **Health Score Dashboard**
   - Overall health distribution
   - Trending over time
   - By topic/category
   - Charts: Bar, Pie, Line

3. **Workflow Status Report**
   - Tasks by bucket
   - Completion trends
   - Bottleneck analysis

**Superblocks Components**:
- Table component for detailed reports
- Chart components (bar, pie, line charts)
- Export button (CSV, PDF)
- Date range filters
- Scheduling for automated report generation

**Query Example** (Health Score Distribution):
```sql
SELECT 
  CASE 
    WHEN c.health_score >= 90 THEN 'Excellent'
    WHEN c.health_score >= 75 THEN 'Good'
    WHEN c.health_score >= 50 THEN 'Fair'
    ELSE 'Poor'
  END as health_category,
  COUNT(*) as course_count,
  ROUND(100.0 * COUNT(*) / (SELECT COUNT(*) FROM courses WHERE archived_at IS NULL), 1) as percentage
FROM courses c
WHERE c.archived_at IS NULL
GROUP BY health_category
ORDER BY c.health_score DESC;
```

---

### 6. Authentication & Authorization

#### Current Implementation
- Supabase session-based auth
- Role-based access control (RBAC)
- Database RLS policies
- Failed-closed (no synthetic identity)

#### Superblocks Implementation

**Authentication Setup**:
1. **Supabase Auth Integration**:
   - Connect Superblocks to Supabase via OAuth
   - Superblocks can use Supabase tokens directly
   - Session-based token management

2. **Alternative: Superblocks Built-in Auth**:
   - Use Superblocks' native SSO support
   - Query Supabase to fetch user role
   - Cache role for session duration

**Role-Based Access Control**:
```javascript
// Superblocks permission middleware
const userRole = await db.query(`
  SELECT role FROM user_profiles 
  WHERE id = {{currentUser.id}}
`);

// Control button/page visibility
const canEditCourse = ['admin', 'super_admin', 'content'].includes(userRole);
const canApproveWorkflow = ['admin', 'super_admin'].includes(userRole);
const canViewAccreditation = ['admin', 'super_admin', 'accreditation'].includes(userRole);
```

**Access Control Matrix**:
| Feature | super_admin | admin | content | accreditation |
|---------|---|---|---|---|
| View Courses | ✓ | ✓ | ✓ | ✓ |
| Edit Courses | ✓ | ✓ | ✓ | ✗ |
| Approve Workflow | ✓ | ✓ | ✗ | ✗ |
| View Accreditation | ✓ | ✓ | ✓ | ✓ |
| Edit Accreditation | ✓ | ✓ | ✗ | ✗ |
| Manage Users | ✓ | ✗ | ✗ | ✗ |
| View Audit Log | ✓ | ✓ | ✗ | ✗ |

**Failed-Closed Behavior**:
```javascript
// Always require valid auth; no fallback
if (!currentUser || !currentUser.id) {
  window.location.href = '/login';
  return;
}

const userRole = await fetchUserRole(currentUser.id);
if (!userRole) {
  showError('Access denied: No active profile');
  return;
}
```

---

### 7. Data Imports & Exports

#### Current Implementation
- Node.js scripts for workbook import
- Database functions for atomicity
- Audit trail recording

#### Superblocks Implementation

**Workbook Import Process**:
1. **File Upload**: Use Superblocks file upload component
2. **Validation**: JavaScript transformer validates format
3. **Dry-Run**: Show validation results before applying
4. **Apply**: Call Supabase function `import_course_workbooks()`
5. **Results**: Display summary with counts and errors

**Query/Script for Dry-Run**:
```javascript
// Superblocks script to validate workbook
const workbook = await parseExcel(uploadedFile);
const courses = workbook.sheets['All Courses'];

// Validate against expected counts
const validation = {
  totalCourses: courses.length,
  expectedCount: 18406,
  errors: [],
  warnings: []
};

if (validation.totalCourses !== validation.expectedCount) {
  validation.errors.push(
    `Course count mismatch: got ${validation.totalCourses}, expected ${validation.expectedCount}`
  );
}

return validation;
```

**Apply Import** (via database function):
```sql
-- Call Supabase function from Superblocks
SELECT import_course_workbooks(
  {{workbookData}}, 
  {{currentUser.id}},
  true -- apply mode
);
```

**Export Functionality**:
```javascript
// Export courses to CSV
const exportData = await db.query(`
  SELECT 
    id, title, course_code, description, 
    duration_minutes, status, health_score, provenance
  FROM courses
  WHERE archived_at IS NULL
`);

return downloadAsCSV(exportData, 'courses.csv');
```

---

## Data Connections & Integration Points

### 1. Supabase PostgreSQL (Primary)

**Connection Details**:
- Type: PostgreSQL Direct
- Pooling: Use Supabase built-in connection pooling
- SSL: Required
- Credentials: Store in Superblocks secrets
- Max connections: 20 (adjust based on user load)

**Query Categories**:
- **Read-heavy**: Course library, reports, audit logs
- **Write**: Course editing, workflow moves, imports
- **Transactions**: Multi-step operations via functions
- **Real-time** (Optional): Supabase Realtime subscriptions for live updates

**Optimization Strategy**:
- Pre-calculate aggregate metrics (health scores, accreditation counts)
- Implement query result caching (Redis or Superblocks cache)
- Use materialized views for complex groupings
- Index frequently filtered/sorted columns

### 2. LMS API (REST)

**Connection Type**: REST API

**Base Configuration**:
```
Resource Name: lms_api
Base URL: {{secrets.LMS_BASE_URL}}
Auth Type: Bearer Token
Token: {{secrets.LMS_API_KEY}}
Headers: {
  "Content-Type": "application/json",
  "Accept": "application/json"
}
```

**Endpoints**:
- `GET /courses` — Retrieve course list
- `GET /courses/{id}` — Get course details
- `GET /courses/{id}/versions` — Retrieve versions

**Error Handling**:
- 503 Unavailable → Show "LMS not connected" message
- 429 Rate Limited → Implement exponential backoff
- Timeout → Fall back to cached snapshot
- 401 Unauthorized → Show configuration error

**Data Flow**:
```
LMS API → Superblocks REST Call → Store raw response in lms_snapshots
         → Normalize and merge into course projection
         → Update provenance labels
```

### 3. Wrike API (REST)

**Connection Type**: REST API with OAuth2

**Base Configuration**:
```
Resource Name: wrike_api
Base URL: https://www.wrike.com/api/v4/
Auth Type: OAuth2 Bearer Token
Client ID: {{secrets.WRIKE_CLIENT_ID}}
Client Secret: {{secrets.WRIKE_CLIENT_SECRET}}
Scopes: tasks:read, tasks:read:metadata
```

**Endpoints**:
- `GET /tasks` — Search tasks
- `GET /tasks/{id}` — Get task details
- `GET /customfields` — Cache custom fields

**Rate Limiting**:
- Wrike limit: 500 requests/minute
- Implement token bucket in Superblocks
- Batch operations where possible
- Cache responses aggressively

**Read-Only Enforcement**:
```javascript
// Prevent any write operations to Wrike
const wrikeRequest = {
  method: 'GET', // Always GET, never POST/PUT/DELETE
  url: 'https://www.wrike.com/api/v4/tasks',
  headers: { 'Authorization': `Bearer ${wrikeToken}` }
};
```

---

## Security Considerations

### 1. Authentication & Secrets

**Secrets Management**:
- Store API keys in Superblocks secrets manager
- Never expose secrets in client-side code
- Rotate API keys quarterly
- Audit key usage

**Environment Variables**:
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=***
LMS_API_KEY=***
LMS_BASE_URL=https://lms.customer.com/api
WRIKE_CLIENT_ID=***
WRIKE_CLIENT_SECRET=***
```

### 2. Authorization & Access Control

**Row-Level Security (RLS)**:
- Maintain RLS policies in Supabase
- Use Superblocks auth to verify role before queries
- Query only data the user should access
- Never bypass RLS with service role queries from client

**Service Role Usage**:
- Server-side only (Superblocks backend queries)
- Enforce role checking before execution
- Log all service role queries
- Limit to specific functions/procedures

### 3. Data Protection

**Audit Logging**:
- All mutations logged with actor/timestamp
- Immutable audit table
- Queryable via read-only view
- Exported for compliance

**Encryption**:
- TLS 1.3 for all connections
- Supabase-managed encryption at rest
- Secrets encrypted in Superblocks
- No sensitive data in logs

**Data Validation**:
- Input validation in Superblocks (client-side)
- SQL injection prevention (parameterized queries only)
- Type checking (Superblocks validators)
- Business logic validation in database (constraints)

---

## Performance & Scalability

### 1. Database Performance

**Current Metrics**:
- 18,000+ courses
- 50,000+ accreditation records
- 100+ concurrent users
- < 2 second page load target

**Optimization Techniques**:

| Technique | Implementation | Expected Impact |
|---|---|---|
| Pagination | Cursor-based, LIMIT 50 | Reduce query time 90% |
| Indexing | B-tree on frequently filtered columns | 10x query speedup |
| Caching | 5-minute cache on search results | Reduce DB load 50% |
| Materialized Views | Pre-calculate groupings | Instant report generation |
| Query Batching | Combine multiple queries | Reduce round-trips 70% |
| Connection Pooling | Supabase PgBouncer | Handle 100+ concurrent users |

**Indexes to Create**:
```sql
-- Course library search/sort
CREATE INDEX idx_courses_title ON courses(title);
CREATE INDEX idx_courses_code ON courses(course_code);
CREATE INDEX idx_courses_status ON courses(status);
CREATE INDEX idx_courses_health ON courses(health_score DESC);

-- Workflow
CREATE INDEX idx_revamp_tasks_bucket ON revamp_tasks(bucket_key, sort_order);

-- Accreditation
CREATE INDEX idx_accreditations_org_juris ON course_accreditations(organization, jurisdiction);

-- Favorites
CREATE INDEX idx_favorites_user ON course_favorites(user_id);

-- Audit queries
CREATE INDEX idx_courses_updated_at ON courses(updated_at DESC);
```

### 2. Superblocks Optimization

**Query Optimization**:
- Cache frequent queries (5-15 minute TTL)
- Use materialized views for complex aggregations
- Lazy-load tables below the fold
- Implement virtual scrolling for large tables

**Component Optimization**:
- Pagination instead of loading all rows
- Debounce search input (300ms)
- Batch form updates
- Lazy-load images and assets

**Network Optimization**:
- Compress responses (gzip)
- CDN caching for static assets
- Minimize JSON payloads
- Use query parameters over request body

### 3. Resource Allocation

| Resource | Recommended | Justification |
|---|---|---|
| Superblocks Org Plan | Business tier | Advanced features, SSO, multiple apps |
| Supabase Database | 2+ CPU, 8GB RAM | 18,000+ courses, real-time subscriptions |
| Connection Pool | 20 connections | 100 concurrent users × margin |
| Cache Layer | Redis (optional) | Query result caching; session store |
| Monitoring | DataDog/New Relic | Performance tracking, error monitoring |

---

## Migration Strategy

### Phase 1: Foundation (Week 1-2)

**Deliverables**:
- Set up Superblocks organization and project
- Configure Supabase PostgreSQL connection
- Create connection to LMS API (REST)
- Create connection to Wrike API (REST)
- Set up authentication (Supabase or SSO)
- Create basic page structure

**Tasks**:
- [ ] Superblocks workspace setup
- [ ] Database connection tested and validated
- [ ] API connections configured with secrets
- [ ] Authentication flow working
- [ ] Basic navigation structure in place

### Phase 2: Core Features (Week 3-6)

**Deliverables**:
- Course Library (search, filter, sort, pagination)
- Course Editor (view, edit, audit trail)
- Course Versions management
- Topics & Tags management
- Favorites functionality

**Tasks**:
- [ ] Course library table built and styled
- [ ] Search/filter/sort functionality working
- [ ] Course editor form built with validation
- [ ] Concurrency control implemented
- [ ] Audit trail display working
- [ ] Favorites toggle functional

### Phase 3: Accreditation (Week 7-8)

**Deliverables**:
- Accreditation tracking interface
- Risk assessment dashboard
- Org/Jurisdiction grouping display
- Accreditation reports

**Tasks**:
- [ ] Accreditation queries optimized
- [ ] Risk assessment calculation working
- [ ] Dashboard visualization built
- [ ] Reports exportable to CSV/PDF

### Phase 4: Workflow & Admin (Week 9-10)

**Deliverables**:
- Revamp workflow (Kanban board)
- User management interface
- Admin tools and settings
- Data import/export tools

**Tasks**:
- [ ] Kanban component implemented
- [ ] Drag-drop between buckets working
- [ ] User management CRUD done
- [ ] Import wizard built
- [ ] Export functionality working

### Phase 5: Integration & Testing (Week 11-12)

**Deliverables**:
- LMS sync scheduler
- Wrike integration
- Full test coverage
- Documentation and training

**Tasks**:
- [ ] LMS refresh trigger tested
- [ ] Wrike links working
- [ ] All features tested
- [ ] Performance optimized
- [ ] User documentation complete
- [ ] Team training complete

### Phase 6: Cutover (Week 13-14)

**Deliverables**:
- Production deployment
- Data migration validation
- Rollback procedures tested
- Go-live support

**Tasks**:
- [ ] Staging deployment complete
- [ ] UAT testing passed
- [ ] Production deployment
- [ ] Monitor for errors
- [ ] Old system decommissioned

---

## Data Migration Plan

### Step 1: Validate Data Consistency (Week 1)
- Audit all data in current system
- Verify audit trails complete
- Check for data integrity issues
- Document any anomalies

### Step 2: Test Migration Logic (Week 2-3)
- Run migration scripts on dev database
- Validate data counts and checksums
- Verify provenance labels correct
- Test audit trail migration

### Step 3: Staging Migration (Week 4)
- Backup production database
- Run migration on staging copy
- Validate data in Superblocks staging app
- Run smoke tests

### Step 4: Rollout Plan (Week 5)
- Backup production database (immutable copy)
- Schedule maintenance window
- Run migration scripts
- Validate data in production
- Run smoke tests
- Enable Superblocks for beta users

### Step 5: Production Cutover (Week 6)
- Announce cutover to all users
- Redirect to new Superblocks app
- Monitor for issues
- Keep old system read-only for 30 days
- Archive old system

---

## Risk Assessment & Mitigation

### Risks

| Risk | Impact | Probability | Mitigation |
|---|---|---|---|
| Performance degradation | High | Medium | Implement caching, query optimization, load testing |
| Data migration errors | High | Low | Extensive testing, validation checks, rollback plan |
| LMS/Wrike API changes | Medium | Low | Monitor API changelog, version pinning, wrapper layer |
| User adoption issues | Medium | Medium | Training, documentation, phased rollout, support |
| Superblocks limitations | Medium | Low | Prototype complex features early, custom JS components |
| Security gaps | High | Low | Security audit, pen testing, compliance review |
| Cost overruns | Medium | Medium | Define clear scope, monitor usage, performance tuning |

### Mitigation Strategies

1. **Performance**: Load test with 100+ concurrent users; cache frequently accessed queries
2. **Data**: Three-tier validation (Superblocks, database constraints, manual audit); rollback plan
3. **API**: Version pinning; monitor vendor changelogs; wrapper abstractions
4. **Adoption**: Weekly training; help desk support; phased rollout by department
5. **Limitations**: Prototype early; use custom components where needed; avoid hard blocks
6. **Security**: Security audit before production; pen testing; compliance validation
7. **Cost**: Use free tier for development; monitor Superblocks usage; optimize queries

---

## Rollback & Contingency Plan

### Rollback Procedure

If critical issues emerge:

1. **Immediate** (< 5 min):
   - Redirect users back to Next.js app
   - Notify support team
   - Disable Superblocks app deployment

2. **Short-term** (< 30 min):
   - Identify root cause
   - Document issue
   - Assess impact scope

3. **Resolution** (varies):
   - Fix issue in development
   - Test on staging
   - Deploy fix or rebuild

4. **Post-incident**:
   - Root cause analysis
   - Implement preventative measures
   - Update runbooks

### Keep-Alive Plan

- Maintain Next.js app read-only for 30 days post-cutover
- Document all procedures for running old system
- Schedule decommissioning after 60 days
- Archive code and database backups

---

## Recommended Superblocks Architecture

### App Structure
```
CourseTrack (Superblocks App)
├── Authentication Pages
│   ├── Login
│   └── Password Recovery
├── Main Navigation
├── Dashboard
│   ├── Course Library
│   ├── Accreditation Dashboard
│   └── Workflow Status
├── Pages
│   ├── Courses
│   │   ├── Course Library
│   │   ├── Course Detail
│   │   ├── Course Editor
│   │   └── Versions
│   ├── Accreditation
│   │   ├── Accreditation Board
│   │   ├── Risk Assessment
│   │   └── Reports
│   ├── Workflow
│   │   └── Revamp Kanban
│   ├── Admin
│   │   ├── User Management
│   │   ├── Settings
│   │   ├── Import/Export
│   │   └── Audit Logs
│   └── Reports
│       ├── Accreditation Report
│       ├── Health Report
│       └── Compliance Report
└── Data Connections
    ├── supabase_postgres
    ├── lms_api
    └── wrike_api
```

### Resource Configuration
```
Queries (150+):
├── Courses (40)
│   ├── listCourses
│   ├── getCourseDetail
│   ├── searchCourses
│   ├── updateCourse
│   └── ...
├── Accreditations (30)
├── Workflow (25)
├── Reports (20)
├── Users (15)
└── Audit (20)

JavaScript Transformers (30+):
├── courseDataTransformers
├── accreditationCalculators
├── workflowHandlers
├── validationRules
└── ...

Components (50+):
├── Header/Navigation
├── CourseTable
├── CourseForm
├── AccreditationDashboard
├── KanbanBoard
├── ReportBuilder
└── ...

Workflows/Automations (10+):
├── lmsRefreshScheduler
├── wrikeSync
├── importWorkflow
├── reportGeneration
└── ...
```

---

## Cost Analysis

### Superblocks Licensing

| Plan | Monthly | Users | Good For |
|---|---|---|---|
| Starter | $299 | 2 | Single developer |
| Team | $999 | 10 | Small team |
| Business | $2,999 | Unlimited | Enterprise |
| Enterprise | Custom | Unlimited | Dedicated support |

**Recommendation for CourseTrack**: Business plan (~$2,999/mo) for unlimited users and SSO

### Supporting Infrastructure

| Component | Cost | Purpose |
|---|---|---|
| Supabase Pro | ~$25/mo | Database, auth (included with Superblocks) |
| Redis Cache (optional) | $20-100/mo | Query caching |
| Monitoring (DataDog) | $50-200/mo | Performance tracking |
| CDN (Cloudflare) | $20-100/mo | Static asset delivery |
| **Total Monthly** | **~$3,100-3,400** | Full production deployment |

**ROI**: Reduced development costs (~$150k/year in engineer time) vs. custom Next.js maintenance

---

## Post-Launch Considerations

### Monitoring & Observability

1. **Superblocks Monitoring**:
   - Query performance tracking
   - Error rates and logs
   - User adoption metrics
   - App health dashboard

2. **Database Monitoring**:
   - Query performance (pg_stat_statements)
   - Connection pool utilization
   - Disk space usage
   - Replication lag

3. **Integration Monitoring**:
   - LMS API response times
   - Wrike API rate limit usage
   - Sync job success rates
   - Error rates by endpoint

### Maintenance & Updates

1. **Superblocks Updates**:
   - Monitor release notes monthly
   - Test updates on staging first
   - Document breaking changes
   - Plan quarterly major upgrades

2. **Database Maintenance**:
   - Monthly VACUUM and ANALYZE
   - Index fragmentation review
   - Backup verification
   - Capacity planning

3. **API Management**:
   - Monitor LMS/Wrike API changes
   - Version pinning and deprecation tracking
   - Rate limit optimization
   - Authentication refresh procedures

---

## Success Criteria

✓ All features from Next.js version working in Superblocks  
✓ Performance: < 2 second page load time (95th percentile)  
✓ Reliability: 99.5% uptime during production operation  
✓ User Adoption: 80% of team active in first month  
✓ Data Integrity: 100% accurate migration, zero data loss  
✓ Cost: Operating costs < $4,000/month  
✓ Support: No critical production incidents in first 90 days  
✓ Compliance: Audit trail maintained, regulatory requirements met  

---

## Appendix: Query Templates

### Template 1: Search with Filtering
```sql
SELECT c.*, cv.id as version_id
FROM courses c
LEFT JOIN course_versions cv ON c.id = cv.course_id AND cv.archived_at IS NULL
WHERE c.archived_at IS NULL
  AND (c.title ILIKE {{searchQuery}} OR c.course_code ILIKE {{searchQuery}})
  AND ({{statusFilter}} IS NULL OR c.status = {{statusFilter}})
  AND ({{topicFilter}} IS NULL OR c.id IN (
    SELECT course_id FROM course_topics WHERE topic_id = {{topicFilter}}
  ))
ORDER BY {{sortBy}} {{sortOrder}}
LIMIT {{pageSize}} OFFSET {{pageOffset}};
```

### Template 2: Audit Trail
```sql
SELECT 
  al.id,
  al.event_type,
  al.actor_id,
  up.email as actor_email,
  al.before_data,
  al.after_data,
  al.created_at
FROM audit_logs al
LEFT JOIN user_profiles up ON al.actor_id = up.id
WHERE al.table_name = 'courses'
  AND al.record_id = {{courseId}}
ORDER BY al.created_at DESC;
```

### Template 3: Concurrent Update with Lock
```sql
UPDATE courses
SET field1 = {{newValue1}},
    updated_by = {{userId}},
    updated_at = now()
WHERE id = {{id}}
  AND updated_at = {{expectedVersion}}
RETURNING *;
```

---

## Glossary

- **Provenance**: Origin of data (uploaded, lms_api, coursetrack)
- **Revamp**: Workflow system for course management
- **RLS**: Row-Level Security policies in PostgreSQL
- **Soft-Delete**: Marking record as archived instead of deletion
- **Optimistic Concurrency**: Using version tokens to detect conflicts
- **Materialized View**: Pre-calculated query result stored in database
- **LMS**: Learning Management System (external)
- **KEYSET Pagination**: Cursor-based pagination using column values

---

**End of Document**
