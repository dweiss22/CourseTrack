export const verticals = [
  "P1A",
  "FR1A",
  "C1A",
  "EMS1",
  "D1A",
  "LGU",
  "Lexipol",
  "Wellness",
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
};

export function getVerticalLabel(vertical: Vertical): string {
  return `${vertical} - ${verticalNames[vertical]}`;
}

export const managementClassifications = [
  "Lexipol managed",
  "Non-Lexipol tracked",
  "Non-Lexipol excluded",
  "Unclassified",
] as const;

export type ManagementClassification =
  (typeof managementClassifications)[number];

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

export interface FieldComparison {
  fieldKey: string;
  fieldLabel: string;
  lmsRawValue: unknown;
  lmsNormalizedValue: unknown;
  contentMetadataRawValue: unknown;
  contentMetadataNormalizedValue: unknown;
  resolvedValue: unknown;
  selectedSource: ResolvedFieldSource;
  comparisonStatus: ComparisonStatus;
  resolutionReason: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  lastComparedAt: string;
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
  | "Topics import";

export interface CourseTopicAssignment {
  id: string;
  topic: string;
  originalTopicLabel: string;
  source: TopicAssignmentSource;
  importRunId: string | null;
  assignedAt: string;
}

export interface VerticalAssignment {
  vertical: Vertical;
  source: "LMS Site mapping" | "Content Metadata" | "CourseTrack";
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

export type DataSource = "sample" | "lms" | "manual" | "import" | "calculated";

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
  | "Sample Data"
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

export interface CourseVersion {
  id: string;
  versionNumber: string;
  versionType: VersionType;
  publicationDate: string;
  isCurrent: boolean;
  source: DataSource;
  releaseNotes: string;
  authoringTool: string;
  packageStandard: string;
}

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
  creditHours: number;
  effectiveDate: string | null;
  expirationDate: string | null;
  source: DataSource;
  riskReasons: string[];
}

export interface CourseFlag {
  id: string;
  type: string;
  title: string;
  priority: "Low" | "Medium" | "High" | "Critical";
  status: "Open" | "Under Review" | "In Progress" | "Blocked" | "Resolved";
  owner: string | null;
  dueDate: string | null;
}

export interface CourseNote {
  id: string;
  type: string;
  author: string;
  createdAt: string;
  visibility: "Private" | "Team" | "Role restricted" | "Organization";
  body: string;
}

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
    | "In Progress";
  priority: "Critical" | "High" | "Medium" | "Low" | "Monitor Only";
  score: number;
  targetPublicationDate: string | null;
  businessJustification: string;
}

export interface Course {
  id: string;
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
  durationMinutes: number;
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
  sourceSystem: string;
  retrievalStatus: RetrievalStatus;
  lastRetrievedAt: string | null;
  isSample: boolean;
  internalSummary: string;
  versions: CourseVersion[];
  accreditations: AccreditationRecord[];
  flags: CourseFlag[];
  notes: CourseNote[];
  revampProposal: RevampProposal | null;
  lmsSnapshot: LmsCourseSnapshot | null;
  contentMetadata: ContentMetadataRecord | null;
  resolvedFields: ResolvedCourseFields;
  fieldComparisons: FieldComparison[];
  sourceTimestamps: CourseSourceTimestamps;
  mappingWarnings: string[];
  topicAssignments: CourseTopicAssignment[];
  verticalAssignments: VerticalAssignment[];
  relationships: CourseRelationship[];
  importHistory: SourceHistoryRecord[];
  retrievalHistory: SourceHistoryRecord[];
  auditHistory: AuditHistoryRecord[];
  conflictCount: number;
  importValidationErrors: string[];
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
