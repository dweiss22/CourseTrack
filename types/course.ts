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
