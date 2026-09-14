# CourseTrack: Full Rebuild vs. Migration Strategy

**Version:** 1.0  
**Last Updated:** 2026-09-14  
**Purpose:** Evaluate and recommend approach for moving CourseTrack to Superblocks with internal database  
**Decision Point:** Choose between Full Rebuild or Live Data Migration

---

## Executive Summary

Moving CourseTrack to Superblocks **with an internal database** (instead of Supabase) fundamentally changes the migration approach. This document compares two strategies:

| Aspect | Full Rebuild | Live Migration |
|---|---|---|
| Risk | Medium | High |
| Timeline | 8-10 weeks | 10-14 weeks |
| Complexity | Low | Very High |
| Downtime | 1-2 days | Minimal (gradual) |
| Data Loss Risk | Low (clean slate) | High (transform errors) |
| User Impact | High (training, cutover) | Medium (gradual transition) |
| Cost | Lower | Higher |
| Testing | Straightforward | Complex schema validation |

**Recommendation**: **Full Rebuild** for most scenarios because:
- Internal database is already new infrastructure
- Clean slate allows schema optimization for Superblocks
- Easier to maintain audit trail integrity
- Simpler to test and validate
- Better long-term maintainability

However, if **live production data must be preserved and migrated**, Live Migration is necessary despite higher complexity.

---

## Strategy 1: Full Rebuild (Recommended)

### Overview

Start fresh in the new internal database. Migrate only historical/immutable data (uploads, audit logs) as reference. All current operational data re-initialized.

### Approach Flowchart

```
Phase 1: Design                 Phase 2: Build              Phase 3: Validate
Internal DB Schema              Superblocks App            & Cutover
    ↓                                ↓                          ↓
- Map CourseTrack tables        - Build Superblocks UI     - UAT testing
- Optimize for Superblocks      - Implement features       - Data comparison
- Plan data population          - Configure connections    - Performance tune
                                - Set up auth              - Cutover plan
                                                           - Go-live support
```

### Phase 1: Internal Database Design (Weeks 1-2)

#### Step 1.1: Schema Design

**Key Differences from Supabase**:
- No built-in RLS (implement in Superblocks or app layer)
- No native audit triggers (manually implement via stored procedures)
- Connection pooling may differ
- Full control over optimization

**Proposed Internal DB Schema**:

```sql
-- Core Course Management
CREATE TABLE courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(500) NOT NULL,
  course_code VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  duration_minutes INTEGER,
  status VARCHAR(50) DEFAULT 'draft',
  health_score NUMERIC(3,1) DEFAULT 0,
  provenance VARCHAR(50) NOT NULL DEFAULT 'coursetrack', -- uploaded, lms_api, coursetrack
  origin_provenance VARCHAR(50), -- original source
  field_provenance JSONB, -- per-field tracking: {title: 'coursetrack', duration: 'uploaded'}
  
  -- Metadata for audit/concurrency
  created_by UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  archived_by UUID,
  archived_at TIMESTAMP,
  
  -- Linking to legacy/history
  legacy_id VARCHAR(100), -- ref to old system ID for data verification
  legacy_import_checksum VARCHAR(64), -- for duplicate detection on re-import
  
  CONSTRAINT valid_provenance CHECK (provenance IN ('uploaded', 'lms_api', 'coursetrack')),
  CONSTRAINT valid_status CHECK (status IN ('draft', 'active', 'archived', 'deprecated'))
);

-- Course Versions (one active per course)
CREATE TABLE course_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id),
  version_number INTEGER NOT NULL,
  title VARCHAR(500),
  content TEXT,
  current BOOLEAN DEFAULT FALSE, -- only one per course
  status VARCHAR(50) DEFAULT 'draft',
  
  created_by UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  archived_by UUID,
  archived_at TIMESTAMP,
  
  UNIQUE (course_id, current) WHERE current = TRUE,
  CONSTRAINT valid_status CHECK (status IN ('draft', 'active', 'archived'))
);

-- Accreditations
CREATE TABLE course_accreditations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id),
  organization VARCHAR(255) NOT NULL,
  jurisdiction VARCHAR(255) NOT NULL,
  standard VARCHAR(255) NOT NULL,
  certification_body VARCHAR(255),
  effective_date DATE,
  expiration_date DATE,
  
  created_by UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID,
  updated_at TIMESTAMP DEFAULT NOW(),
  archived_by UUID,
  archived_at TIMESTAMP,
  
  -- Deduplication
  fingerprint VARCHAR(255), -- SHA256(org + juris + standard)
  is_canonical BOOLEAN DEFAULT FALSE,
  
  INDEX idx_course_accreds (course_id),
  INDEX idx_org_juris (organization, jurisdiction),
  INDEX idx_fingerprint (fingerprint)
);

-- Workflow/Revamp Tasks
CREATE TABLE revamp_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id),
  bucket_key VARCHAR(50) NOT NULL, -- backlog, in_progress, approved, archived
  sort_order INTEGER NOT NULL,
  
  created_by UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW(),
  archived_by UUID,
  archived_at TIMESTAMP,
  
  CONSTRAINT valid_bucket CHECK (bucket_key IN ('backlog', 'in_progress', 'approved', 'archived')),
  UNIQUE (course_id, bucket_key) -- one task per course per bucket
);

-- User Profiles & Roles
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  full_name VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'content', -- super_admin, admin, content, accreditation
  is_active BOOLEAN DEFAULT TRUE,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_role CHECK (role IN ('super_admin', 'admin', 'content', 'accreditation'))
);

-- Audit Log (Immutable)
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL, -- INSERT, UPDATE, DELETE, ARCHIVE
  table_name VARCHAR(100) NOT NULL,
  record_id UUID NOT NULL,
  actor_id UUID NOT NULL REFERENCES user_profiles(id),
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_record (table_name, record_id),
  INDEX idx_actor (actor_id),
  INDEX idx_created (created_at DESC)
);

-- Immutable History Tables (from imports/syncs)
CREATE TABLE raw_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_checksum VARCHAR(64) NOT NULL UNIQUE,
  filename VARCHAR(255),
  source_type VARCHAR(50), -- 'workbook', 'csv', etc.
  raw_payload BYTEA NOT NULL, -- raw Excel/CSV bytes
  uploaded_by UUID NOT NULL,
  uploaded_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_checksum (upload_checksum),
  INDEX idx_uploaded_at (uploaded_at DESC)
);

CREATE TABLE import_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  upload_id UUID NOT NULL REFERENCES raw_uploads(id),
  import_type VARCHAR(50), -- 'course_workbook', 'accreditation', etc.
  actor_id UUID NOT NULL REFERENCES user_profiles(id),
  status VARCHAR(50), -- 'pending', 'completed', 'failed'
  error_message TEXT,
  courses_imported INTEGER,
  validation_results JSONB,
  
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  
  INDEX idx_status (status),
  INDEX idx_created (created_at DESC)
);

-- LMS Snapshots (Immutable)
CREATE TABLE lms_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id),
  raw_response JSONB NOT NULL, -- full LMS API response
  normalized_data JSONB, -- extracted fields
  
  retrieved_at TIMESTAMP NOT NULL,
  retrieved_by UUID NOT NULL,
  
  INDEX idx_course (course_id),
  INDEX idx_retrieved (retrieved_at DESC)
);

-- User Favorites
CREATE TABLE course_favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id),
  user_id UUID NOT NULL REFERENCES user_profiles(id),
  created_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE (course_id, user_id)
);

-- Topics & Tags
CREATE TABLE topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE course_topics (
  course_id UUID NOT NULL REFERENCES courses(id),
  topic_id UUID NOT NULL REFERENCES topics(id),
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (course_id, topic_id)
);

CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  color VARCHAR(7),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE course_tags (
  course_id UUID NOT NULL REFERENCES courses(id),
  tag_id UUID NOT NULL REFERENCES tags(id),
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (course_id, tag_id)
);

-- Flags & Notes
CREATE TABLE course_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id),
  flag_type VARCHAR(50), -- 'accreditation_risk', 'missing_content', etc.
  description TEXT,
  severity VARCHAR(50), -- 'low', 'medium', 'high'
  
  created_by UUID NOT NULL REFERENCES user_profiles(id),
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_by UUID,
  resolved_at TIMESTAMP,
  
  INDEX idx_course (course_id),
  INDEX idx_unresolved (resolved_at) WHERE resolved_at IS NULL
);

CREATE TABLE course_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES courses(id),
  content TEXT NOT NULL,
  
  created_by UUID NOT NULL REFERENCES user_profiles(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID,
  updated_at TIMESTAMP DEFAULT NOW(),
  archived_by UUID,
  archived_at TIMESTAMP,
  
  INDEX idx_course (course_id),
  INDEX idx_created (created_at DESC)
);

-- Wrike Links (Reference only)
CREATE TABLE course_version_wrike_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES course_versions(id),
  wrike_task_id VARCHAR(100) NOT NULL,
  wrike_task_name TEXT,
  wrike_task_url TEXT,
  
  created_by UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_version (version_id),
  INDEX idx_wrike_task (wrike_task_id)
);
```

#### Step 1.2: Schema Optimization for Superblocks

- **Indexes**: Create all critical indexes upfront
- **Materialized Views**: Pre-calculate expensive aggregations
  ```sql
  CREATE MATERIALIZED VIEW accreditation_summary AS
  SELECT 
    TRIM(UPPER(organization)) as org,
    TRIM(UPPER(jurisdiction)) as jurisdiction,
    COUNT(DISTINCT course_id) as course_count,
    COUNT(DISTINCT CASE WHEN health_score >= 80 THEN course_id END) as healthy_count
  FROM course_accreditations ca
  JOIN courses c ON ca.course_id = c.id
  WHERE ca.archived_at IS NULL AND c.archived_at IS NULL
  GROUP BY org, jurisdiction;
  ```
- **Computed Columns**: Add calculated fields at schema level if supported
- **Connection Pooling**: Configure appropriate pool size (20-50 connections)

#### Step 1.3: Data Population Strategy

**Option A: Minimal Migration** (Recommended for Full Rebuild)
- Don't migrate operational data from Supabase
- Start with empty course library
- Import historical data only for audit/compliance (raw uploads, audit logs)
- Users manually recreate courses or import via workbook

**Option B: Reference Data Only**
- Migrate user profiles (roles, permissions)
- Migrate audit logs (for compliance)
- Archive old course data separately (read-only)
- Start with clean course catalog

**Recommendation**: Option A is cleanest for full rebuild

---

### Phase 2: Superblocks App Development (Weeks 3-6)

Same as previous migration guide, but optimized for new schema:

#### Development Tasks
- [ ] Connect internal database to Superblocks
- [ ] Test connection pooling and performance
- [ ] Build authentication with internal user_profiles table
- [ ] Implement role-based access control
- [ ] Build course library with search/filter/sort
- [ ] Build course editor with optimistic concurrency
- [ ] Implement audit logging via database triggers
- [ ] Build accreditation dashboard
- [ ] Build Revamp workflow (Kanban)
- [ ] Build reporting and exports
- [ ] Implement LMS connector
- [ ] Implement Wrike connector
- [ ] Build admin/user management
- [ ] Build import/export tools

#### Schema Integration Points

**Superblocks Query Configuration**:
```javascript
// Connection to internal database
const internalDBConnection = {
  type: 'PostgreSQL',
  host: 'internal-db.company.local',
  port: 5432,
  database: 'coursetrack_prod',
  username: 'app_user',
  password: '***', // stored in Superblocks secrets
  ssl: true,
  maxConnections: 30
};

// Query: List courses with audit info
SELECT c.*, 
  u.full_name as updated_by_name,
  (SELECT COUNT(*) FROM audit_logs WHERE record_id = c.id) as change_count
FROM courses c
LEFT JOIN user_profiles u ON c.updated_by = u.id
WHERE c.archived_at IS NULL
ORDER BY c.updated_at DESC
LIMIT {{pageSize}} OFFSET {{pageOffset}};

// Mutation: Update course with automatic audit
BEGIN;
  UPDATE courses 
  SET title = {{newTitle}}, updated_by = {{userId}}, updated_at = NOW()
  WHERE id = {{courseId}} AND updated_at = {{expectedVersion}};
  
  INSERT INTO audit_logs (event_type, table_name, record_id, actor_id, after_data)
  VALUES ('UPDATE', 'courses', {{courseId}}, {{userId}}, row_to_json(NEW));
COMMIT;
```

---

### Phase 3: Data Validation & Cutover (Weeks 7-8)

#### Validation Checklist
- [ ] All Superblocks queries return correct data
- [ ] Create/update/delete operations work
- [ ] Optimistic concurrency control working
- [ ] Audit logs capturing all changes
- [ ] Authentication and role-based access working
- [ ] LMS connector functional
- [ ] Wrike connector functional
- [ ] Performance acceptable (< 2s page load)
- [ ] Export/import tools working
- [ ] Reports generating correctly

#### UAT & Training
- [ ] User acceptance testing on staging
- [ ] Team training on new UI
- [ ] Documentation complete
- [ ] Runbooks prepared

#### Cutover Plan
1. **Day 1 (Morning)**: Deploy Superblocks app to production
2. **Day 1 (Afternoon)**: Direct 10% of users to Superblocks for testing
3. **Day 2**: Expand to 50% if no critical issues
4. **Day 3-5**: Full rollout to all users
5. **Week 2**: Monitor and support
6. **Week 3+**: Keep old system read-only for reference (30 days)

#### Rollback Plan
- Keep old Supabase/Next.js system running read-only
- Redirect users back if critical issues discovered
- Old system accessible for 30 days for comparison

---

### Pros of Full Rebuild

✅ **Clean slate**: No schema debt or legacy data quirks  
✅ **Optimized**: Schema designed specifically for Superblocks  
✅ **Low risk**: No data transformation errors  
✅ **Fast testing**: Straightforward UAT process  
✅ **Simpler code**: No legacy workarounds needed  
✅ **Better performance**: Optimal indexes and materialized views  
✅ **Easier maintenance**: Clear, simple data flow  
✅ **Compliance ready**: Audit trail built from ground up  

### Cons of Full Rebuild

❌ **Data loss**: Existing courses/data not in new system  
❌ **User impact**: High training and behavior change  
❌ **Re-entry work**: Users re-enter courses and configurations  
❌ **Downtime**: Requires cutover window  
❌ **Historical gaps**: Missing 6+ months of course history  

---

## Strategy 2: Live Data Migration

### Overview

Migrate all data from Supabase to internal database while keeping CourseTrack running. Users gradually transition to Superblocks app while old system remains operational.

### Approach Flowchart

```
Phase 1: Prep              Phase 2: Sync            Phase 3: Validate       Phase 4: Cutover
Schema Design              Live Data               & Compare               Go-Live
    ↓                          ↓                        ↓                       ↓
- Map tables               - Extract from          - Row counts            - Final sync
- Transform logic          Supabase              - Field verification     - Redirect users
- Plan sync               - Load to internal    - Audit trail check     - Monitor closely
- Dry-run scripts         - Real-time sync      - Performance test      - Support period
                          - Conflict resolution - Reconciliation
```

### Phase 1: Schema Mapping & Transformation (Weeks 1-2)

#### Step 1.1: Table Mapping

Create transformation mapping from Supabase schema to internal schema:

```sql
-- Mapping Document: What transforms to what

Supabase                          → Internal DB              Transformation Rules
────────────────────────────────────────────────────────────────────────────
courses                           → courses                  Direct copy + add field_provenance
course_versions                   → course_versions          Direct copy
course_accreditations             → course_accreditations    Add fingerprint, canonical detection
revamp_tasks                      → revamp_tasks             Direct copy
user_profiles                     → user_profiles            Direct copy (hash passwords)
audit_logs                        → audit_logs               Direct copy (immutable)
raw_uploads (in LMS snapshots)   → raw_uploads              Extract + store
import_runs                       → import_runs             Direct copy
lms_snapshots                     → lms_snapshots           Direct copy (immutable)
course_favorites                  → course_favorites        Direct copy (per-user RLS)
topics, course_topics            → topics, course_topics   Direct copy
tags, course_tags                → tags, course_tags       Direct copy
course_flags                      → course_flags            Direct copy
course_notes                      → course_notes            Direct copy
course_version_wrike_links        → course_version_wrike_links Direct copy
```

#### Step 1.2: Data Transformation Scripts

```javascript
// Transform function for courses
function transformCourse(supabaseCourse) {
  return {
    id: supabaseCourse.id,
    title: supabaseCourse.title,
    course_code: supabaseCourse.course_code,
    // ... other fields
    provenance: supabaseCourse.provenance, // uploaded, lms_api, coursetrack
    origin_provenance: supabaseCourse.origin_provenance || supabaseCourse.provenance,
    
    // Field-level provenance tracking
    field_provenance: {
      title: supabaseCourse.provenance,
      course_code: supabaseCourse.provenance,
      description: supabaseCourse.provenance,
      // ... etc
    },
    
    // Audit metadata
    created_by: supabaseCourse.created_by,
    created_at: supabaseCourse.created_at,
    updated_by: supabaseCourse.updated_by,
    updated_at: supabaseCourse.updated_at,
    archived_by: supabaseCourse.archived_by,
    archived_at: supabaseCourse.archived_at,
    
    // Reference for verification
    legacy_id: `supabase-${supabaseCourse.id}`,
    legacy_import_checksum: md5(JSON.stringify(supabaseCourse))
  };
}

// Transform function for accreditations with deduplication
function transformAccreditation(subpabaseAccred) {
  const fingerprint = sha256(
    `${subpabaseAccred.organization.toUpperCase().trim()}|${subpabaseAccred.jurisdiction.toUpperCase().trim()}|${subpabaseAccred.standard}`
  );
  
  return {
    id: subpabaseAccred.id,
    course_id: subpabaseAccred.course_id,
    organization: subpabaseAccred.organization,
    jurisdiction: subpabaseAccred.jurisdiction,
    standard: subpabaseAccred.standard,
    certification_body: subpabaseAccred.certification_body,
    effective_date: subpabaseAccred.effective_date,
    expiration_date: subpabaseAccred.expiration_date,
    
    created_by: subpabaseAccred.created_by,
    created_at: subpabaseAccred.created_at,
    updated_by: subpabaseAccred.updated_by,
    updated_at: subpabaseAccred.updated_at,
    archived_by: subpabaseAccred.archived_by,
    archived_at: subpabaseAccred.archived_at,
    
    fingerprint: fingerprint,
    is_canonical: subpabaseAccred.is_canonical || true // default to canonical if not marked
  };
}
```

#### Step 1.3: Dry-Run on Test Database

```bash
# Step 1: Export all data from Supabase
npm run export:from-supabase

# Step 2: Transform data
node scripts/transform-data.mjs

# Step 3: Load to test internal database
npm run load:to-internal-db --target=test

# Step 4: Validate
npm run validate:migration --target=test
  - Check row counts match
  - Verify foreign key relationships
  - Check all dates/timestamps valid
  - Verify audit trail integrity
  - Check for orphaned records

# Step 5: Performance test
npm run perf-test:internal-db --target=test
  - Query performance benchmarks
  - Index effectiveness
  - Connection pool sizing
```

**Expected Output**:
```
Migration Validation Report
════════════════════════════════════════════════════════════
Source (Supabase)          Target (Internal DB)   Status
────────────────────────────────────────────────────────────
Courses:              18406    18406                 ✓ OK
Versions:             22341    22341                 ✓ OK
Accreditations:       19571    19571                 ✓ OK
Audit Logs:          145000   145000                 ✓ OK
Course Favorites:      2430     2430                 ✓ OK
Users:                   45        45                 ✓ OK

Referential Integrity:
  Missing course refs in versions:     0 ✓
  Missing user refs:                   0 ✓
  Orphaned accreditations:             0 ✓

Performance (1000 row queries):
  courses + versions (LEFT JOIN):    245ms ✓
  accreditation grouping:            312ms ✓
  course library search:             187ms ✓

Timestamp Validation:
  Valid created_at dates:      100% ✓
  Valid updated_at dates:      100% ✓
  created < updated:           100% ✓
```

---

### Phase 2: Live Sync Mechanism (Weeks 2-4)

#### Step 2.1: Bidirectional Sync Architecture

```
Supabase (Old System)
    ↓ (reads)
Superblocks App (Hybrid Mode)
    ↓ (writes)
Internal DB (New System)
    ↓ (reads)
    
Background Sync Service:
- Every 5 minutes: Sync changes FROM Supabase → Internal DB
- Every 5 minutes: Sync changes FROM Internal DB → Supabase (optional)
- Conflict resolution: Last-write-wins or manual resolution
```

#### Step 2.2: Change Capture (CDC)

```javascript
// Option 1: Polling-based sync
async function syncFromSupabase() {
  const lastSyncTime = await getLastSyncTimestamp();
  
  // Get changes since last sync
  const changedCourses = await supabase
    .from('courses')
    .select('*')
    .gt('updated_at', lastSyncTime);
  
  // Transform and upsert to internal DB
  for (const course of changedCourses.data) {
    const transformed = transformCourse(course);
    await internalDB.query(
      'INSERT INTO courses (...) VALUES (...) ON CONFLICT (id) DO UPDATE SET ...',
      transformed
    );
  }
  
  // Record sync checkpoint
  await updateLastSyncTimestamp(new Date());
}

// Option 2: Supabase Realtime (if available)
// Subscribe to course changes in real-time
supabase
  .channel('courses')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'courses' }, 
    async (payload) => {
      if (payload.eventType === 'UPDATE') {
        const transformed = transformCourse(payload.new);
        await syncToInternalDB(transformed);
      }
    })
  .subscribe();
```

#### Step 2.3: Conflict Resolution

```javascript
// When same course updated in both systems
async function resolveConflict(supabaseVersion, internalVersion) {
  // Strategy 1: Last-write-wins (simplest)
  if (supabaseVersion.updated_at > internalVersion.updated_at) {
    return supabaseVersion; // Supabase version is newer
  } else {
    return internalVersion; // Internal version is newer
  }
  
  // Strategy 2: Manual resolution (safest)
  // Log conflict for manual review
  await logConflict({
    courseId: supabaseVersion.id,
    supabaseVersion: supabaseVersion,
    internalVersion: internalVersion,
    resolvedAt: null,
    resolvedBy: null
  });
  
  // Alert admin: "Conflict detected in course 123. Manual review needed."
  // Admin chooses which version to keep
}
```

#### Step 2.4: Sync Validation

```sql
-- Daily reconciliation query
SELECT 
  c1.id,
  c1.title as supabase_title,
  c2.title as internal_title,
  c1.updated_at as supabase_updated,
  c2.updated_at as internal_updated,
  CASE 
    WHEN c1.title != c2.title THEN 'MISMATCH'
    WHEN c1.updated_at != c2.updated_at THEN 'TIMESTAMP_MISMATCH'
    ELSE 'OK'
  END as status
FROM supabase_courses c1
LEFT JOIN internal_courses c2 ON c1.id = c2.id
WHERE c1.archived_at IS NULL
ORDER BY status DESC;
```

---

### Phase 3: Hybrid App Development (Weeks 4-6)

#### Configuration: Read/Write Strategy

```javascript
// Superblocks hybrid mode configuration
const DBStrategy = {
  // During migration: Read from both, write to both
  courses: {
    read: { primary: 'internalDB', fallback: 'supabase' },
    write: 'both', // Write to both, sync both
    compareOnRead: true, // Verify both have same data
    conflictResolution: 'lastWriteWins'
  },
  
  // Immutable tables: Read-only from both
  auditLogs: {
    read: { primary: 'internalDB' },
    write: 'none'
  },
  
  // User profiles: Read from internal, fallback to Supabase
  userProfiles: {
    read: { primary: 'internalDB', fallback: 'supabase' },
    write: 'internalDB'
  }
};

// Query example: Course with fallback
async function getCourse(courseId) {
  try {
    // Try internal database first
    const course = await internalDB.query(
      'SELECT * FROM courses WHERE id = $1',
      [courseId]
    );
    
    if (course && course.length > 0) {
      return course[0];
    }
  } catch (err) {
    logger.warn('Internal DB query failed, falling back to Supabase', err);
  }
  
  // Fallback to Supabase
  const course = await supabase
    .from('courses')
    .select('*')
    .eq('id', courseId);
  
  return course.data[0];
}

// Update example: Write to both
async function updateCourse(courseId, updates) {
  const internalResult = await internalDB.query(
    'UPDATE courses SET ... WHERE id = $1',
    [courseId, updates]
  );
  
  const supabaseResult = await supabase
    .from('courses')
    .update(updates)
    .eq('id', courseId);
  
  // Log if mismatch
  if (!internalResult && supabaseResult.data) {
    logger.error('Update succeeded in Supabase but failed in Internal DB');
  }
  
  return internalResult || supabaseResult.data;
}
```

---

### Phase 4: Gradual Cutover (Weeks 6-8)

#### Week 1: Beta Users
- Redirect 10% of users to Superblocks (internal DB)
- Keep 90% on old system (Supabase)
- Monitor errors and performance
- Sync runs every 2 minutes

#### Week 2: Expand
- Redirect 50% of users to Superblocks
- Reduce sync frequency to 5 minutes
- Monitor for conflicts/issues
- Continue supporting old system

#### Week 3: Full Cutover
- Redirect 100% of users to Superblocks
- Keep old system read-only for reference
- Sync runs every 1 hour (verification only)
- Heavy monitoring

#### Week 4: Old System Shutdown
- Keep old system read-only for 30 days
- Archive Supabase database
- Decommission old app

#### Rollback Points
- If critical issues in weeks 1-2: Redirect affected users back to old system
- If widespread issues in week 3: Full rollback (restore from backup)
- After week 4: Old system not available (but backups exist)

---

### Pros of Live Migration

✅ **Data preserved**: All courses and history migrated  
✅ **Low downtime**: Gradual cutover, no big-bang transition  
✅ **User comfort**: Time to learn new system  
✅ **Fallback available**: Old system stays online during transition  
✅ **Validation time**: Can compare results side-by-side  
✅ **Historical data**: Nothing lost  

### Cons of Live Migration

❌ **High complexity**: Bidirectional sync is tricky  
❌ **Conflict resolution**: Manual intervention often needed  
❌ **Dual maintenance**: Supporting two systems simultaneously  
❌ **Longer timeline**: Extra testing and validation phases  
❌ **Higher cost**: Double infrastructure, longer team effort  
❌ **Risk of data corruption**: Transformation errors hard to detect  

---

## Comparison: Full Rebuild vs. Live Migration

| Factor | Full Rebuild | Live Migration |
|---|---|---|
| **Timeline** | 8-10 weeks | 10-14 weeks |
| **Complexity** | Low | Very High |
| **Risk Level** | Medium | High |
| **Data Loss** | Minimal (historical preserved) | None (all migrated) |
| **Downtime** | 1-2 days | Minimal (phased) |
| **Cost** | Lower (~$80-100k) | Higher (~$120-150k) |
| **Testing** | Straightforward | Complex schema validation |
| **Rollback** | Simple (keep old system running) | Complex (dual systems in sync) |
| **User Training** | Significant | Gradual |
| **Validation** | Easy (fresh start) | Hard (compare datasets) |
| **Post-launch Maintenance** | Simple | Moderate (monitor sync) |
| **Time-to-Value** | Slower (startup data) | Faster (data available day 1) |
| **Business Continuity** | Interrupted (cutover day) | Continuous (gradual transition) |

---

## Recommendation Matrix

### Choose **Full Rebuild** if:
- ✅ Starting fresh is acceptable to business
- ✅ Historical data not critical for day 1
- ✅ Want simplest possible path
- ✅ Risk-averse (prefer clean slate)
- ✅ Team capacity is limited
- ✅ Tight timeline (8 weeks)
- ✅ Internal DB architecture is very different from Supabase

### Choose **Live Migration** if:
- ✅ Operational data must be preserved
- ✅ Zero-downtime requirement
- ✅ Users cannot tolerate re-entry of courses
- ✅ Strong compliance requirement for data continuity
- ✅ Historical audit trail critical for business
- ✅ Can extend timeline (12+ weeks)
- ✅ Team experienced with data migrations

---

## Hybrid Approach: Best of Both

**"Phased Rebuild with Historical Migration"**

1. **Phase 1 (Weeks 1-2)**: Rebuild app with new schema
2. **Phase 2 (Weeks 2-3)**: Migrate audit logs and immutable data (one-time)
3. **Phase 3 (Weeks 4-6)**: Build Superblocks app with clean operational data
4. **Phase 4 (Weeks 6-7)**: Import historical courses as read-only reference
5. **Phase 5 (Weeks 8)**: Go-live with new system; old system archived

**Advantages**:
- Clean rebuild (no migration headaches)
- Historical data preserved (audit trail, compliance)
- Moderate timeline (8 weeks)
- Clear cutover (no phased transition complexity)
- Reference data available (users see historical context)

**Best for**: Most scenarios

---

## Implementation Roadmap

### Assumption: Hybrid Approach (Recommended)

**Week 1-2**: Foundation
- [ ] Design internal database schema
- [ ] Set up development environment
- [ ] Begin Superblocks app architecture

**Week 3-6**: Build Superblocks App
- [ ] Course library with search/filter/sort
- [ ] Course editor with concurrency control
- [ ] Accreditation management
- [ ] Revamp workflow
- [ ] Reports and exports
- [ ] Authentication and RBAC
- [ ] LMS and Wrike integrations

**Week 6-7**: Historical Data
- [ ] Migrate audit logs (read-only)
- [ ] Migrate immutable tables (for reference)
- [ ] Make available as searchable archive

**Week 8**: Go-Live
- [ ] UAT and performance testing
- [ ] User training
- [ ] Cutover and support

---

## Decision Framework

**Before choosing, answer these questions**:

1. **How critical is preserving every course from day 1?**
   - Critical → Live Migration
   - Can recreate key ones → Full Rebuild

2. **How risk-tolerant is the business?**
   - Low risk tolerance → Full Rebuild (simpler)
   - High tolerance → Live Migration (comprehensive)

3. **What's the timeline pressure?**
   - 8 weeks → Full Rebuild
   - 12+ weeks → Live Migration

4. **What's the team's migration experience?**
   - Limited → Full Rebuild
   - Experienced → Live Migration

5. **Can users tolerate re-entry of data?**
   - No → Live Migration
   - Yes → Full Rebuild

6. **Is zero-downtime required?**
   - Yes → Live Migration
   - No → Full Rebuild (1-2 day cutover acceptable)

---

## Next Steps

### To Proceed with Full Rebuild:
1. Finalize internal DB schema (Week 1)
2. Approve Superblocks app architecture
3. Begin Phase 2 development (Week 3)

### To Proceed with Live Migration:
1. Create detailed data transformation mapping
2. Build sync mechanism prototype
3. Dry-run migration on test database
4. Approve phased cutover plan

### To Proceed with Hybrid:
1. Design schema with historical data support
2. Plan one-time historical data import
3. Build clean operational schema
4. Schedule historical import week 6-7

---

**Recommendation: Proceed with Hybrid Approach (Rebuild + Historical Archive)**

This balances simplicity, risk, timeline, and business needs.

---

**End of Document**
