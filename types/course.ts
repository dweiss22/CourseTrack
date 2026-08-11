export const verticals = [
  "P1A",
  "FR1A",
  "C1A",
  "EMS1",
  "D1A",
  "LGU",
  "Lexipol",
  "Wellness",
  "Unclassified",
] as const;

export type Vertical = (typeof verticals)[number];

export const verticalNames: Record<Vertical, string> = {
  P1A: "Police1 Academy",
  FR1A: "FireRescue1 Academy",
  C1A: "Corrections1 Academy",
  EMS1: "EMS1 Academy",
  D1A: "Dispatch1 Academy",
  LGU: "Local Government University",
  Lexipol: "Internal employee LMS",
  Wellness: "Course content for the Wellness app",
  Unclassified: "No uploaded metadata or CourseTrack vertical assignment",
};

export function getVerticalLabel(vertical: Vertical): string {
  return `${vertical} - ${verticalNames[vertical]}`;
}

export const managementClassifications = [
  "Lexipol managed",
  "Unclassified",
] as const;

export type ManagementClassification =
  (typeof managementClassifications)[number];

export const managementClassificationFilters = [
  "All courses",
  "Lexipol Managed",
  "Unclassified",
] as const;

export type ManagementClassificationFilter =
  (typeof managementClassificationFilters)[number];

export const reconciliationStatuses = [
  "Matched between LMS and Content Metadata",
  "LMS only / missing Content Metadata",
  "Content Metadata only / missing from LMS",
  "Duplicate identifier",
  "Invalid source record",
  "Mapping required",
] as const;

export type ReconciliationStatus =
  (typeof reconciliationStatuses)[number];

export type ComparisonStatus =
  | "Match"
  | "Conflict"
  | "LMS only"
  | "Content Metadata only"
  | "Missing from both"
  | "Invalid"
  | "Unresolved";

export type ResolvedFieldSource = "lms" | "content_metadata" | null;

export type DataAlignmentStatus =
  | "In sync"
  | "Pending LMS update"
  | "Manually confirmed"
  | "Missing metadata"
  | "App only"
  | "Mapping required";

export type ComparisonFieldScope = "shared" | "lms_exclusive" | "metadata_only" | "app_only";
export type SourceTransport = "uploaded" | "lms_api" | "manual";

export interface DataComparison {
  id: string;
  fieldKey: string;
  fieldLabel: string;
  lmsRawValue: unknown;
  lmsNormalizedValue: unknown;
  contentMetadataRawValue: unknown;
  contentMetadataNormalizedValue: unknown;
  courseTrackNormalizedValue: unknown;
  fieldScope: ComparisonFieldScope;
  alignmentStatus: DataAlignmentStatus;
  lmsSourceTimestamp: string | null;
  metadataSourceTimestamp: string | null;
  confirmationActor: string | null;
  confirmationTime: string | null;
  confirmationNote: string | null;
  sourceValueHash: string | null;
  confirmedSourceHash: string | null;
}

export interface FieldComparison extends DataComparison {
  resolvedValue: unknown;
  selectedSource: ResolvedFieldSource;
  comparisonStatus: ComparisonStatus;
  resolutionReason: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  lastComparedAt: string;
  updatedAt: string;
  isComparable: boolean;
}

export interface NormalizedTrainingCredit {
  rawDisplay: string | null;
  amount: number | null;
  unit: string | null;
}

export interface ParsedAuthor {
  raw: string | null;
  displayName: string | null;
  email: string | null;
}

export interface LmsAccreditationSnapshot {
  index: number;
  issuingBody: string | null;
  state: string | null;
  accreditationNumber: string | null;
  topicNumber: string | null;
  startDate: string | null;
  endDate: string | null;
  rawValues: Record<string, unknown>;
  mappingWarnings: string[];
}

export interface NormalizedLmsPayload {
  courseId: string;
  courseType: string | null;
  courseName: string | null;
  durationMinutes: number | null;
  courseDescription: string | null;
  publicTopics: string[];
  privateTopics: string[];
  sites: string[];
  mappedVerticals: Vertical[];
  publishedDate: string | null;
  author: ParsedAuthor;
  owner: string | null;
  visibleInOrganizations: string[];
  hiddenInOrganizations: string[];
  authorStatus: string | null;
  isPublished: boolean | null;
  hasTopics: boolean | null;
  isLexipol: boolean | null;
  generateCertificate: string | null;
  availableInStates: string[];
  hiddenInStates: string[];
  surveys: string[];
  createdDate: string | null;
  lastRevisionDate: string | null;
  courseAccreditationState: string[];
  trainingCredits: NormalizedTrainingCredit;
  accreditations: LmsAccreditationSnapshot[];
}

export interface LmsCourseSnapshot {
  id: string;
  retrievalRunId: string;
  provider: string;
  lmsCourseId: string;
  retrievedAt: string;
  isCurrent: boolean;
  rawPayload: Record<string, unknown>;
  normalized: NormalizedLmsPayload;
  mappingWarnings: string[];
  sourceTransport?: SourceTransport;
}

export interface ContentMetadataRecord {
  id: string;
  importRunId: string;
  importedAt: string;
  rawCourseId: unknown;
  lmsCourseId: string;
  courseName: string | null;
  contentType: string | null;
  durationMinutes: number | null;
  trainingCredits: NormalizedTrainingCredit;
  published: boolean | null;
  authoringTool: string | null;
  description: string | null;
  backendLink: string | null;
  frontendLink: string | null;
  publishedDate: string | null;
  updateType: string | null;
  updatedRawValue: unknown;
  verticals: Vertical[];
  parentCourseIds: string[];
  childCourseIds: string[];
  notes: string | null;
  rawPayload: Record<string, unknown>;
  mappingWarnings: string[];
  validationErrors: string[];
}

export type TopicAssignmentSource =
  | "LMS Public Topic"
  | "LMS Private Topic"
  | "Topics import"
  | "Manual";

export interface CourseTopicAssignment {
  id: string;
  topic: string;
  originalTopicLabel: string;
  source: TopicAssignmentSource;
  importRunId: string | null;
  assignedAt: string;
}

export interface CourseTagAssignment {
  id: string;
  tag: string;
  source: "Manual";
  assignedAt: string;
}

export interface VerticalAssignment {
  vertical: Vertical;
  source: "LMS Site availability" | "Content Metadata" | "CourseTrack";
  kind: "membership" | "availability";
  sourceValue: string;
  isPrimary: boolean;
}

export interface CourseRelationship {
  id: string;
  relationship: "parent" | "child";
  relatedCourseId: string;
  relatedCourseTitle: string | null;
  source: "Content Metadata" | "CourseTrack";
  validationStatus: "Resolved" | "Missing target" | "Self reference" | "Circular";
}

export interface SourceHistoryRecord {
  id: string;
  source: "LMS" | "Content Metadata" | "Topics" | "Monitoring list";
  runId: string;
  status: "Succeeded" | "Succeeded with warnings" | "Failed" | "Preview";
  occurredAt: string;
  summary: string;
}

export interface AuditHistoryRecord {
  id: string;
  action: string;
  actor: string;
  occurredAt: string;
  reason: string | null;
}

export interface CourseSourceTimestamps {
  lmsRetrievedAt: string | null;
  contentMetadataImportedAt: string | null;
  topicsImportedAt: string | null;
  lastComparedAt: string | null;
}

export interface ResolvedCourseFields {
  courseName: string | null;
  durationMinutes: number | null;
  trainingCredits: NormalizedTrainingCredit | null;
  published: boolean | null;
  description: string | null;
  publishedDate: string | null;
}

export const provenanceLabels = {
  uploaded: "Uploaded",
  lms_api: "Connected via LMS API",
  coursetrack: "CourseTrack",
} as const;

export type Provenance = keyof typeof provenanceLabels;

export type ProjectionOrigin =
  | "master_import"
  | "lms_export"
  | "coursetrack_created";

/** @deprecated Use Provenance. Kept as a source-compatible alias for callers. */
export type DataSource = Provenance;

export type LifecycleStatus =
  | "Proposed"
  | "In Development"
  | "Internal Review"
  | "Legal Review"
  | "Published"
  | "Under Maintenance"
  | "Scheduled for Revamp"
  | "Retired"
  | "Archived";

export type PublicationStatus =
  | "Unknown"
  | "Not in LMS"
  | "Draft"
  | "Testing"
  | "Published"
  | "Hidden"
  | "Inactive"
  | "Retired"
  | "Retrieval Error";

export type HealthStatus =
  | "Healthy"
  | "Monitor"
  | "Needs Review"
  | "At Risk"
  | "Critical";

export type RetrievalStatus =
  | "Uploaded"
  | "Retrieved"
  | "Retrieved with Warnings"
  | "Retrieval Failed"
  | "Stale Data"
  | "Mapping Required";

export type VersionType =
  | "Initial Release"
  | "Minor Revision"
  | "Major Revision"
  | "Technical Update"
  | "Accessibility Update"
  | "Legal Update"
  | "Accreditation Update";

export type VersionStatus =
  | "Draft"
  | "In Review"
  | "Scheduled"
  | "Published"
  | "Superseded";

export interface VersionWrikeTaskReference {
  id: string;
  wrikeTaskId: string;
  taskTitle: string;
  projectId: string | null;
  projectTitle: string | null;
  taskStatus: string | null;
  assigneeNames: string[];
  dueDate: string | null;
  permalink: string | null;
  provider: "Live Wrike";
  retrievedAt: string;
  linkedAt: string;
  linkedBy: string;
  linkMethod: "manual_permalink" | "selected_candidate" | null;
  lastVerifiedAt: string | null;
  updatedAt: string;
  wrikePublishedDate: string | null;
}

export interface CourseVersion {
  id: string;
  versionNumber: string;
  versionType: VersionType;
  publicationDate: string;
  isCurrent: boolean;
  versionStatus: VersionStatus;
  managedBy: "CourseTrack";
  createdAt: string;
  createdBy: string;
  releaseNotes: string;
  authoringTool: string;
  packageStandard: string;
  wrikeTaskReferences: VersionWrikeTaskReference[];
  provenance?: Provenance;
  originProvenance?: Provenance;
  updatedAt?: string;
  archivedAt?: string | null;
  sourceTransport?: SourceTransport;
}

export type AccreditationRiskState =
  | "active"
  | "expiring_soon"
  | "renewal_due"
  | "renewal_submitted"
  | "conditional"
  | "expired"
  | "undated"
  | "future"
  | "not_required";

export type AccreditationHistoryRole =
  | "current"
  | "superseded"
  | "future"
  | "duplicate";

export interface AccreditationRecord {
  id: string;
  organization: string;
  jurisdiction: string;
  status:
    | "Approved"
    | "Approved with Conditions"
    | "Renewal Due"
    | "Renewal Submitted"
    | "Expiring Soon"
    | "Expired"
    | "Not Required";
  approvalNumber: string | null;
  topicNumber: string | null;
  creditHours: number;
  effectiveDate: string | null;
  expirationDate: string | null;
  source: DataSource;
  riskReasons: string[];
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string | null;
  originProvenance?: Provenance;
  sourceDomain: "lms" | "coursetrack";
  sourceTransport: SourceTransport;
  sourceNormalizedValues: {
    organization?: string | null;
    jurisdiction?: string | null;
    approvalNumber?: string | null;
    topicNumber?: string | null;
    effectiveDate?: string | null;
    expirationDate?: string | null;
  };
  alignmentStatus: Extract<DataAlignmentStatus, "In sync" | "Pending LMS update" | "Manually confirmed" | "App only">;
  confirmationActor: string | null;
  confirmationTime: string | null;
  confirmationNote: string | null;
}

export interface AssessedAccreditationRecord {
  record: AccreditationRecord;
  historyRole: AccreditationHistoryRole;
  riskState: AccreditationRiskState;
  isAtRisk: boolean;
}

export interface AccreditationHistoryGroup {
  key: string;
  courseKey: string;
  organization: string;
  jurisdiction: string;
  summary: AssessedAccreditationRecord;
  current: AssessedAccreditationRecord | null;
  history: AssessedAccreditationRecord[];
  riskState: AccreditationRiskState;
  isAtRisk: boolean;
}

export interface TaskCalloutActor {
  id: string;
  displayName: string;
  email: string;
}

export interface TaskCalloutRecord {
  id: string;
  recordKind: "Task" | "Callout";
  category: string;
  title: string;
  description: string;
  priority: "Low" | "Medium" | "High" | "Critical";
  status: "Open" | "In Progress" | "Blocked" | "Completed" | "Resolved";
  assignee: TaskCalloutActor | null;
  assigneeId: string | null;
  dueDate: string | null;
  completionNotes: string | null;
  completedBy: TaskCalloutActor | null;
  completedAt: string | null;
  resolvedBy: TaskCalloutActor | null;
  resolvedAt: string | null;
  createdBy: TaskCalloutActor | null;
  createdAt: string;
  updatedBy: TaskCalloutActor | null;
  updatedAt: string;
  archivedAt?: string | null;
  provenance?: Provenance;
}

export type CourseFlag = TaskCalloutRecord;

export interface CourseNote {
  id: string;
  type: string;
  author: string;
  createdAt: string;
  visibility: "Private" | "Team" | "Role restricted" | "Organization";
  body: string;
  authorId?: string | null;
  updatedAt?: string;
  archivedAt?: string | null;
  provenance?: Provenance;
}

export const revampBuckets = [
  "Submitted",
  "Under Review",
  "Approved",
  "In Progress",
] as const;

export type RevampBucket = (typeof revampBuckets)[number];

export interface RevampProposal {
  id: string;
  title: string;
  status:
    | "Draft"
    | "Submitted"
    | "Under Review"
    | "Approved"
    | "Approved for Future Cycle"
    | "Deferred"
    | "Completed"
    | "In Progress";
  priority: "Critical" | "High" | "Medium" | "Low" | "Monitor Only";
  score: number;
  targetPublicationDate: string | null;
  businessJustification: string;
  bucket?: RevampBucket | null;
  sortOrder?: number;
  updatedAt?: string;
  archivedAt?: string | null;
  provenance?: Provenance;
}

export interface Course {
  id: string;
  updatedAt?: string;
  archivedAt?: string | null;
  courseCode: string;
  lmsCourseId: string | null;
  managementClassification: ManagementClassification;
  monitoringEnabled: boolean;
  reconciliationStatus: ReconciliationStatus;
  title: string;
  shortTitle: string;
  description: string;
  learningAudience: string;
  primaryVertical: Vertical;
  secondaryVerticals: Vertical[];
  primaryTopic: string;
  tags: string[];
  lifecycleStatus: LifecycleStatus;
  publicationStatus: PublicationStatus;
  deliveryFormat: string;
  durationMinutes: number | null;
  authoringTool: string;
  stateCode: string | null;
  owner: string | null;
  instructionalDesigner: string | null;
  currentVersion: string;
  originalPublishDate: string | null;
  lastMajorRevisionDate: string | null;
  nextReviewDate: string | null;
  accreditationStatus: AccreditationRecord["status"];
  nearestAccreditationExpiration: string | null;
  healthStatus: HealthStatus;
  healthScore: number;
  metadataCompletenessScore: number;
  dataSource: DataSource;
  fieldProvenance?: Record<string, Provenance>;
  sourceSystem: string;
  retrievalStatus: RetrievalStatus;
  lastRetrievedAt: string | null;
  isSample: boolean;
  isFavorite?: boolean;
  internalSummary: string;
  versions: CourseVersion[];
  accreditations: AccreditationRecord[];
  flags: CourseFlag[];
  notes: CourseNote[];
  revampProposal: RevampProposal | null;
  revampTasks?: RevampProposal[];
  lmsSnapshot: LmsCourseSnapshot | null;
  contentMetadata: ContentMetadataRecord | null;
  resolvedFields: ResolvedCourseFields;
  fieldComparisons: FieldComparison[];
  sourceTimestamps: CourseSourceTimestamps;
  mappingWarnings: string[];
  topicAssignments: CourseTopicAssignment[];
  tagAssignments: CourseTagAssignment[];
  verticalAssignments: VerticalAssignment[];
  relationships: CourseRelationship[];
  importHistory: SourceHistoryRecord[];
  retrievalHistory: SourceHistoryRecord[];
  auditHistory: AuditHistoryRecord[];
  conflictCount: number;
  sourceDifferenceCount: number;
  projectionOrigin: ProjectionOrigin;
  hasManualOverrides: boolean;
  trainingCredits: NormalizedTrainingCredit;
  published: boolean | null;
  backendLink: string | null;
  frontendLink: string | null;
  updateType: string | null;
  contentUpdatedAt: string | null;
  contentNotes: string | null;
  importValidationErrors: string[];
}

export interface CourseProjectionUpdate {
  courseCode: string;
  title: string;
  shortTitle: string;
  description: string;
  learningAudience: string;
  primaryVertical: Vertical;
  secondaryVerticals: Vertical[];
  primaryTopic: string;
  managementClassification: ManagementClassification;
  monitoringEnabled: boolean;
  lifecycleStatus: Exclude<LifecycleStatus, "Proposed" | "Legal Review">;
  publicationStatus: PublicationStatus;
  contentType: string;
  durationMinutes: number | null;
  trainingCredits: NormalizedTrainingCredit;
  published: boolean | null;
  authoringTool: string;
  stateCode: string;
  owner: string;
  instructionalDesigner: string;
  publishedDate: string;
  lastMajorRevisionDate: string;
  nextReviewDate: string;
  backendLink: string;
  frontendLink: string;
  updateType: string;
  contentUpdatedAt: string;
  contentNotes: string;
  internalSummary: string;
  expectedUpdatedAt: string;
}

export interface RetrievalRun {
  id: string;
  provider: string;
  startedAt: string;
  completedAt: string;
  status: "Retrieved" | "Retrieved with Warnings" | "Retrieval Failed";
  recordsRequested: number;
  recordsReceived: number;
  recordsFailed: number;
  message: string;
}
