import type {
  AccreditationRecord,
  AuditHistoryRecord,
  ContentMetadataRecord,
  Course,
  CourseFlag,
  CourseNote,
  CourseRelationship,
  CourseSourceTimestamps,
  CourseTopicAssignment,
  CourseVersion,
  FieldComparison,
  HealthStatus,
  LmsCourseSnapshot,
  LifecycleStatus,
  ManagementClassification,
  PublicationStatus,
  ReconciliationStatus,
  ResolvedCourseFields,
  RetrievalRun,
  RevampProposal,
  SourceHistoryRecord,
  Vertical,
  VerticalAssignment,
} from "@/types/course";
import { verticalNames, verticals } from "@/types/course";
import {
  applyFieldResolution,
  calculateMetadataCompleteness,
  calculateSourceAwareMetrics,
  parseContentMetadataRow,
  parseLmsRow,
  reconcileCourseSources,
} from "@/lib/source-normalization";

const baseDate = new Date("2026-07-30T12:00:00.000Z");

const courseThemes: Record<Vertical, string[]> = {
  P1A: [
    "De-Escalation Under Pressure",
    "Search and Seizure Fundamentals",
    "Traffic Stop Risk Management",
    "Crisis Intervention for Patrol",
    "Evidence Handling Essentials",
    "Use of Force Decision-Making",
    "Missing Persons Response",
    "Supervisor Liability Update",
  ],
  FR1A: [
    "Fireground Command Essentials",
    "Vehicle Extrication Operations",
    "Hazardous Materials Awareness",
    "Wildland Interface Response",
    "Mayday Communications",
    "Technical Rescue Foundations",
    "Building Construction for Firefighters",
    "Rapid Intervention Team Operations",
  ],
  C1A: [
    "Inmate Suicide Prevention",
    "Correctional Use of Force",
    "Contraband Detection",
    "Direct Supervision Essentials",
    "PREA Response Responsibilities",
    "Special Management Populations",
    "Report Writing in Corrections",
    "Courtroom Security Fundamentals",
  ],
  EMS1: [
    "High-Performance CPR",
    "Trauma Assessment Essentials",
    "Pediatric Respiratory Emergencies",
    "Cardiac Arrest Team Leadership",
    "Mass-Casualty Triage",
    "Medication Safety for EMS",
    "Behavioral Crisis Response",
    "Airway Management Update",
  ],
  D1A: [
    "Emergency Medical Dispatch Essentials",
    "Caller Management Under Stress",
    "Radio Communications Discipline",
    "Active Threat Call Processing",
    "Quality Assurance for Dispatch",
    "Missing Child Call Response",
    "Critical Incident Stress for Telecommunicators",
    "Next Generation 911 Foundations",
  ],
  LGU: [
    "Public Records Fundamentals",
    "Workplace Investigation Basics",
    "Ethics in Local Government",
    "Emergency Operations Center Orientation",
    "Accessible Public Communication",
    "Supervising Hybrid Teams",
    "Cybersecurity Awareness for Municipal Staff",
    "Community Engagement Essentials",
  ],
  Lexipol: [
    "New Employee Orientation",
    "Manager Essentials",
    "Information Security Awareness",
    "Harassment-Free Workplace",
    "Data Privacy and Records",
    "Benefits and Wellbeing",
    "Inclusive Workplace Practices",
    "Business Continuity Essentials",
  ],
  Wellness: [
    "Resilience for First Responders",
    "Peer Support Foundations",
    "Sleep and Shift Work",
    "Managing Cumulative Stress",
    "Suicide Awareness for Public Safety",
    "Healthy Leadership Practices",
    "Family Readiness for Critical Incidents",
    "Financial Wellness for First Responders",
  ],
};

const topicsByVertical: Record<Vertical, string[]> = {
  P1A: [
    "De-Escalation",
    "Search and Seizure",
    "Traffic Enforcement",
    "Crisis Intervention",
  ],
  FR1A: [
    "Fireground Operations",
    "Vehicle Rescue",
    "Hazardous Materials",
    "Technical Rescue",
  ],
  C1A: [
    "Inmate Management",
    "Suicide Prevention",
    "Use of Force",
    "Facility Security",
  ],
  EMS1: [
    "Cardiology",
    "Trauma",
    "Respiratory Emergencies",
    "Mass-Casualty Incidents",
  ],
  D1A: [
    "Emergency Medical Dispatch",
    "Caller Management",
    "Radio Communications",
    "Quality Assurance",
  ],
  LGU: [
    "Public Administration",
    "Human Resources",
    "Emergency Management",
    "Community Engagement",
  ],
  Lexipol: [
    "Onboarding",
    "Leadership",
    "Information Security",
    "Workplace Compliance",
  ],
  Wellness: [
    "Resilience",
    "Peer Support",
    "Behavioral Health",
    "Leadership Wellness",
  ],
};

const lifecycleCycle: LifecycleStatus[] = [
  "Published",
  "Published",
  "Under Maintenance",
  "Internal Review",
  "In Development",
  "Scheduled for Revamp",
  "Retired",
  "Archived",
];

const publicationCycle: PublicationStatus[] = [
  "Published",
  "Published",
  "Published",
  "Draft",
  "Testing",
  "Published",
  "Retired",
  "Hidden",
];

const healthCycle: HealthStatus[] = [
  "Healthy",
  "Monitor",
  "Needs Review",
  "At Risk",
  "Critical",
  "At Risk",
  "Monitor",
  "Needs Review",
];

const owners = [
  "Alex Morgan",
  "Taylor Reed",
  "Jordan Kim",
  "Casey Bennett",
  "Morgan Ellis",
  null,
  "Riley Chen",
  "Avery Brooks",
];

const designers = [
  "Jamie Patel",
  "Robin Alvarez",
  "Skyler Thompson",
  "Drew Wallace",
  "Cameron Lee",
  null,
  "Parker Diaz",
  "Sam Nguyen",
];

const authoringTools = [
  "Articulate Rise",
  "Articulate Storyline",
  "Video",
  "Custom HTML",
  "Adobe Captivate",
  "Articulate Rise",
  "PDF",
  "External Provider",
];

const deliveryFormats = [
  "Self-Paced Online",
  "Self-Paced Online",
  "Video",
  "Blended",
  "Virtual Instructor-Led",
  "Self-Paced Online",
  "Reference Material",
  "Assessment Only",
];

const reviewOffsets = [-180, -30, 14, 45, 90, 180, 270, 365];
const accreditationOffsets = [14, 45, 90, 180, 365, -20, 120, 240];

function isoDate(offsetDays: number): string {
  const value = new Date(baseDate);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

function buildVersions(courseId: string, index: number): CourseVersion[] {
  const count = (index % 4) + 1;
  return Array.from({ length: count }, (_, versionIndex) => {
    const major = versionIndex + 1;
    return {
      id: `${courseId}-V${major}`,
      versionNumber: `${major}.${versionIndex === count - 1 ? index % 3 : 0}`,
      versionType:
        versionIndex === 0
          ? "Initial Release"
          : versionIndex === count - 1 && index % 3 === 0
            ? "Major Revision"
            : "Minor Revision",
      publicationDate: isoDate(-1_700 + index * 17 + versionIndex * 210),
      isCurrent: versionIndex === count - 1,
      source: versionIndex === count - 1 ? "lms" : "manual",
      releaseNotes:
        versionIndex === count - 1
          ? "Updated examples, accessibility checks, and policy references."
          : "Historical release retained for comparison.",
      authoringTool: authoringTools[index % authoringTools.length],
      packageStandard: index % 5 === 0 ? "xAPI" : "SCORM 2004 4th Edition",
    };
  });
}

function buildAccreditations(
  courseId: string,
  index: number,
): AccreditationRecord[] {
  if (index % 4 === 0) return [];

  const expirationOffset = accreditationOffsets[index % accreditationOffsets.length];
  const expirationDate = isoDate(expirationOffset);
  const status: AccreditationRecord["status"] =
    expirationOffset < 0
      ? "Expired"
      : expirationOffset <= 60
        ? "Expiring Soon"
        : index % 7 === 0
          ? "Approved with Conditions"
          : index % 5 === 0
            ? "Renewal Submitted"
            : "Approved";

  return [
    {
      id: `${courseId}-ACC-1`,
      organization:
        index % 3 === 0
          ? "State Training Commission"
          : index % 3 === 1
            ? "Emergency Services Accreditation Board"
            : "Professional Standards Council",
      jurisdiction: index % 4 === 1 ? "Texas" : index % 4 === 2 ? "California" : "National",
      status,
      approvalNumber: index % 6 === 0 ? null : `APP-${2020 + (index % 6)}-${String(index + 1).padStart(4, "0")}`,
      creditHours: Math.max(1, (index % 8) + 1),
      effectiveDate: isoDate(-365),
      expirationDate,
      source: index % 3 === 0 ? "lms" : "manual",
      riskReasons: [
        ...(expirationOffset <= 60 ? ["Expiration is approaching"] : []),
        ...(index % 6 === 0 ? ["Approval number is missing"] : []),
        ...(index % 7 === 0 ? ["Approval conditions require review"] : []),
      ],
    },
  ];
}

function buildFlags(courseId: string, index: number): CourseFlag[] {
  const count = index % 5;
  const types = [
    "Content May Be Outdated",
    "Legal Review Needed",
    "Accessibility Issue",
    "Missing Metadata",
  ];

  return Array.from({ length: count }, (_, flagIndex) => {
    const priority =
      flagIndex === 0 && index % 8 === 4
        ? "Critical"
        : flagIndex === 0
          ? "High"
          : flagIndex === 1
            ? "Medium"
            : "Low";
    return {
      id: `${courseId}-FLAG-${flagIndex + 1}`,
      type: types[flagIndex % types.length],
      title: types[flagIndex % types.length],
      priority,
      status: flagIndex === count - 1 && index % 6 === 0 ? "In Progress" : "Open",
      owner: priority === "Critical" ? owners[index % owners.length] ?? "Alex Morgan" : owners[index % owners.length],
      dueDate: isoDate(14 + flagIndex * 10),
    };
  });
}

function buildNotes(courseId: string, index: number): CourseNote[] {
  const noteTypes = ["Review Note", "Development Note", "Accreditation Note"];
  return Array.from({ length: (index % 3) + 1 }, (_, noteIndex) => ({
    id: `${courseId}-NOTE-${noteIndex + 1}`,
    type: noteTypes[noteIndex],
    author: designers[(index + noteIndex) % designers.length] ?? "Jamie Patel",
    createdAt: isoDate(-21 - noteIndex * 16),
    visibility: noteIndex === 2 ? "Role restricted" : "Team",
    body:
      noteIndex === 0
        ? "Review examples and policy references before the next scheduled review."
        : "Internal CourseTrack note. This information is not written back to the LMS.",
  }));
}

function buildRevamp(courseId: string, index: number): RevampProposal | null {
  if (index % 3 !== 0) return null;
  const statusCycle: RevampProposal["status"][] = [
    "Draft",
    "Submitted",
    "Under Review",
    "Approved",
    "Deferred",
    "In Progress",
  ];
  return {
    id: `${courseId}-REVAMP-1`,
    title: `Modernize ${courseThemes[verticals[Math.floor(index / 8)]][index % 8]}`,
    status: statusCycle[index % statusCycle.length],
    priority: index % 9 === 0 ? "High" : "Medium",
    score: 48 + ((index * 7) % 49),
    targetPublicationDate: isoDate(150 + index * 3),
    businessJustification:
      "Refresh aging content, improve accessibility, and align the course with current operational guidance.",
  };
}

type SourceAwareCourseFields = Pick<
  Course,
  | "managementClassification"
  | "monitoringEnabled"
  | "reconciliationStatus"
  | "lmsSnapshot"
  | "contentMetadata"
  | "resolvedFields"
  | "fieldComparisons"
  | "sourceTimestamps"
  | "mappingWarnings"
  | "topicAssignments"
  | "verticalAssignments"
  | "relationships"
  | "importHistory"
  | "retrievalHistory"
  | "auditHistory"
  | "conflictCount"
  | "importValidationErrors"
>;

type BaseCourse = Omit<Course, keyof SourceAwareCourseFields>;

const generatedBaseCourses: BaseCourse[] = Array.from({ length: 64 }, (_, index) => {
  const verticalIndex = Math.floor(index / 8);
  const vertical = verticals[verticalIndex];
  const withinVertical = index % 8;
  const id = `CT-${String(index + 1).padStart(4, "0")}`;
  const versions = buildVersions(id, index);
  const accreditations = buildAccreditations(id, index);
  const flags = buildFlags(id, index);
  const healthStatus = healthCycle[withinVertical];
  const lifecycleStatus = lifecycleCycle[withinVertical];
  const published = lifecycleStatus === "Published" || lifecycleStatus === "Under Maintenance";

  return {
    id,
    courseCode: `${vertical}-${String(index + 101).padStart(4, "0")}`,
    lmsCourseId: withinVertical === 4 ? null : String(102_300_000 + index * 137),
    title: courseThemes[vertical][withinVertical],
    shortTitle: courseThemes[vertical][withinVertical].split(" ").slice(0, 4).join(" "),
    description: `A practical ${deliveryFormats[withinVertical].toLowerCase()} course for ${verticalNames[vertical]} learners, focused on ${topicsByVertical[vertical][withinVertical % 4].toLowerCase()} and operational decision-making.`,
    learningAudience: `${verticalNames[vertical]} learners and supervisors`,
    primaryVertical: vertical,
    secondaryVerticals:
      withinVertical === 7
        ? [vertical === "Lexipol" ? "P1A" : "Lexipol"]
        : withinVertical === 3
          ? [verticals[(verticalIndex + 1) % verticals.length]]
          : [],
    primaryTopic: topicsByVertical[vertical][withinVertical % 4],
    tags: [
      withinVertical % 2 === 0 ? "Annual Training" : "Refresher",
      withinVertical % 3 === 0 ? "Legal Update" : "Scenario-Based",
      healthStatus === "Critical" ? "High-Risk" : "Continuing Education",
      vertical === "Lexipol" ? "Internal Employee" : "Policy-Related",
    ],
    lifecycleStatus,
    publicationStatus: publicationCycle[withinVertical],
    deliveryFormat: deliveryFormats[withinVertical],
    durationMinutes: 30 + withinVertical * 15,
    authoringTool: authoringTools[withinVertical],
    stateCode: withinVertical === 3 ? "TX" : withinVertical === 6 ? "CA" : null,
    owner: owners[withinVertical],
    instructionalDesigner: designers[withinVertical],
    currentVersion: versions.at(-1)?.versionNumber ?? "1.0",
    originalPublishDate: published ? isoDate(-2_300 + index * 23) : null,
    lastMajorRevisionDate: published ? isoDate(-850 + index * 9) : null,
    nextReviewDate: lifecycleStatus === "Archived" ? null : isoDate(reviewOffsets[withinVertical]),
    accreditationStatus: accreditations[0]?.status ?? "Not Required",
    nearestAccreditationExpiration: accreditations[0]?.expirationDate ?? null,
    healthStatus,
    healthScore: Math.max(12, 96 - withinVertical * 11 - (index % 3) * 3),
    metadataCompletenessScore: owners[withinVertical] ? 96 - withinVertical * 4 : 62,
    dataSource: "sample",
    sourceSystem: "Mock LMS",
    retrievalStatus:
      withinVertical === 4
        ? "Mapping Required"
        : withinVertical === 6
          ? "Retrieval Failed"
          : withinVertical === 5
            ? "Stale Data"
            : withinVertical === 2
              ? "Retrieved with Warnings"
              : "Retrieved",
    lastRetrievedAt: withinVertical === 6 ? isoDate(-40) : isoDate(-withinVertical),
    isSample: true,
    internalSummary:
      healthStatus === "Healthy"
        ? "Portfolio record is current and requires no immediate action."
        : "Internal review is recommended before the next planning cycle.",
    versions,
    accreditations,
    flags,
    notes: buildNotes(id, index),
    revampProposal: buildRevamp(id, index),
  };
});

const realTopicsByVertical: Record<Vertical, string[]> = {
  P1A: ["General Safety/Compliance", "Legal Issues", "Tactical Response"],
  FR1A: ["Fire Attack/Fireground Operations", "Fire Inspector", "Incident Command"],
  C1A: ["Career Survival for Corrections", "Contraband Control", "Mental Health for Inmates"],
  EMS1: ["Trauma", "Cardiology", "Airway Management and Ventilation"],
  D1A: ["Active Shooter for Dispatchers", "Dispatch Legal Issues", "Specialized Call Handling"],
  LGU: ["Customer Service", "Financial Management", "Information Technology"],
  Lexipol: ["General Human Resources", "General Management Skills", "General Professional Skills"],
  Wellness: ["General Health and Wellness", "Provider Wellbeing", "Health and Wellness for Fire"],
};

const acuteSpinalDescription =
  "Let’s be honest—spinal injuries can be tricky. One wrong move and things can go from bad to worse. This online training breaks down how the spine works, how it breaks, and what to do about it—without just defaulting to a backboard every time. It covers essential strategies for spinal motion restriction, airway management, neurological assessment, and trauma decision-making. The goal: better outcomes, safer care, and smarter decision-making in the field.";

type ScenarioSpec = {
  title?: string;
  description?: string;
  lmsPresent?: boolean;
  metadataPresent?: boolean;
  managementClassification?: ManagementClassification;
  monitoringEnabled?: boolean;
  lmsRaw?: Record<string, unknown>;
  metadataRaw?: Record<string, unknown>;
  mappingWarnings?: string[];
  importValidationErrors?: string[];
  importedTopics?: string[];
  relationships?: CourseRelationship[];
  existingResolution?: { fieldKey: string; source: "lms" | "content_metadata" };
  staleSnapshot?: boolean;
};

const generatedLmsId = (index: number) => String(102_300_000 + index * 137);

const scenarioSpecs: Record<number, ScenarioSpec> = {
  0: {
    title: "Acute Spinal Injuries (BLS)",
    description: acuteSpinalDescription,
    importedTopics: ["Trauma", "Airway Management and Ventilation"],
    lmsRaw: {
      "Course ID": 102319414,
      "Course Type": "Standard Course",
      "Course Name": "Acute Spinal Injuries (BLS)",
      Duration: "1.50",
      "Course Description": acuteSpinalDescription,
      "Public Topics": "Trauma",
      "Private Topics": "EMS; Suggested Second Training Courses",
      Sites: "ems1_academy; firerescue1_academy",
      "Published Date": "07/18/2025 03:30 PM",
      Author: "Natalie Nelson (NNelson@lexipol.com)",
      Owner: "Lexipol Learning",
      "Visibile in Organizations": null,
      "Hidden in Organizations": null,
      "Author Status": "Author is a member of the owner org",
      "Is published": "1",
      "Has topics": "1",
      "Is Lexipol": "1",
      "Generate Certificate": "Default course behavior",
      "Available in States": null,
      "Hidden in States": null,
      Surveys: "eLearning Course Survey - RP (NEW); eLearning Course Survey-EMS1A (NEW); eLearning Course Survey-FR1A (NEW)",
      "Created Date": "07/01/2025 03:33 PM",
      "Last Revision Date": "07/01/2025 03:33 PM",
      "Course Accreditation State": "CAPCE: National; Internal ID: National; VA EMS: Virginia",
      "Training Credits": "1 hour 30 minutes",
      "Issuing Body": "VA EMS, CAPCE, Internal ID",
      State: "Virginia, N/A, N/A",
      "Accreditation Number": "97046, 25-LEXI-F3-9967, ASPIB102",
      "Topic Number": "41029, N/A, N/A",
      "Accreditation Start Date": "2025-07-31, 2025-07-18, 2025-07-01",
      "Accreditation End Date": "2027-09-30, 2028-07-18, N/A",
    },
    metadataRaw: {
      "Course Id": 102319414,
      "Course Name": "Acute Spinal Injuries (BLS)",
      "Duration (min)": 90,
      "Training Credits": "1 hour 30 minutes",
      Published: "Yes",
      Description: acuteSpinalDescription,
      "Published Date": "07/18/2025 03:30 PM",
      Verticals: "EMS1; FR1A",
    },
  },
  1: {
    title: '"Ghost Ship" Fire : A Look at Code Enforcement',
    description: "Chief Rob Wylie discusses the Ghost Ship Fire out of Oakland, CA which claimed the lives of 36 people and the importance of maintaining Fire Codes.",
    lmsPresent: false,
    metadataRaw: {
      "Course Id": 102046126,
      "Course Name": '"Ghost Ship" Fire : A Look at Code Enforcement',
      "Content Type": "Single Video Course",
      "Duration (min)": 15,
      "Training Credits": "15 minutes",
      Published: "Yes",
      "Authoring Tool": "LMS",
      Description: "Chief Rob Wylie discusses the Ghost Ship Fire out of Oakland, CA which claimed the lives of 36 people and the importance of maintaining Fire Codes.",
      "Backend Link": "https://olt.policeoneacademy.com/editor/content/course/102046126/change/",
      "Frontend Link": "https://olt.policeoneacademy.com/courses/ghost-ship-fire",
      "Published Date": 42871,
      "Update Type": null,
      Updated: null,
      Verticals: "FR1A",
      Parent: null,
      Child: null,
      Notes: null,
    },
  },
  2: { title: "Complete Matched Portfolio Course" },
  3: { title: "Use of Force Annual Update", metadataRaw: { "Course Name": "Use of Force: Annual Legal Update" } },
  4: {
    title: "Course Type Mapping Review",
    lmsRaw: { "Course Type": "Standard Course", Sites: "unmapped_partner_portal" },
    metadataRaw: { "Content Type": "Single Video Course" },
    mappingWarnings: ["Course Type and Content Type remain separate until a configurable mapping is approved."],
  },
  5: { title: "Duration Conflict Scenario", metadataRaw: { "Duration (min)": 75 } },
  6: { title: "Training Credit Conflict Scenario", metadataRaw: { "Training Credits": "2 credits" } },
  7: { title: "Publication Status Conflict", metadataRaw: { Published: "No" } },
  8: { title: "Description Conflict Scenario", metadataRaw: { Description: "Content Team description intentionally differs from the current LMS snapshot." } },
  9: { title: "Published Date Conflict", metadataRaw: { "Published Date": "2024-01-15" } },
  10: {
    title: "Multi-Site and Multi-Vertical Response",
    lmsRaw: { Sites: "ems1_academy; firerescue1_academy", "Public Topics": "Mass Casualty Incidents for EMS" },
    metadataRaw: { Verticals: "EMS1; FR1A; Wellness" },
    importedTopics: ["Mass Casualty Incidents for EMS", "Tactical Medicine", "Provider Wellbeing"],
  },
  11: {
    title: "Unknown Vertical Mapping Scenario",
    lmsRaw: { Sites: "future_academy" },
    metadataRaw: { Verticals: "FR1A; FUTURE" },
  },
  12: {
    title: "Multiple Accreditation Records",
    lmsRaw: {
      "Issuing Body": "VA EMS, CAPCE, Internal ID",
      State: "Virginia, N/A, N/A",
      "Accreditation Number": "97046, 25-LEXI-F3-9967, ASPIB102",
      "Topic Number": "41029, N/A, N/A",
      "Accreditation Start Date": "2025-07-31, 2025-07-18, 2025-07-01",
      "Accreditation End Date": "2027-09-30, 2028-07-18, N/A",
    },
  },
  13: {
    title: "Accreditation Array Validation",
    lmsRaw: {
      "Issuing Body": "State Board, National Board, Local Authority",
      State: "Texas, N/A",
      "Accreditation Number": "TX-100",
      "Topic Number": "10, 20, 30",
      "Accreditation Start Date": "2025-01-01, not-a-date",
      "Accreditation End Date": "2026-01-01, 2027-01-01, 2028-01-01",
    },
  },
  14: { title: "LMS-Only Safety Course", metadataPresent: false },
  15: { title: "New Unclassified LMS Course", metadataPresent: false, managementClassification: "Unclassified" },
  16: { title: "Partner Course Under Monitoring", metadataPresent: false, managementClassification: "Non-Lexipol tracked" },
  17: { title: "Excluded Third-Party Catalog Course", metadataPresent: false, managementClassification: "Non-Lexipol excluded", monitoringEnabled: false },
  18: {
    title: "Incident Command Parent Curriculum",
    relationships: [
      { id: "REL-18-19", relationship: "child", relatedCourseId: generatedLmsId(19), relatedCourseTitle: "Missing Parent Relationship Scenario", source: "Content Metadata", validationStatus: "Resolved" },
      { id: "REL-18-20", relationship: "child", relatedCourseId: generatedLmsId(20), relatedCourseTitle: "Circular Relationship Scenario", source: "Content Metadata", validationStatus: "Circular" },
    ],
    metadataRaw: { Child: `${generatedLmsId(19)}; ${generatedLmsId(20)}` },
  },
  19: {
    title: "Missing Parent Relationship Scenario",
    relationships: [{ id: "REL-19-MISSING", relationship: "parent", relatedCourseId: "999999999", relatedCourseTitle: null, source: "Content Metadata", validationStatus: "Missing target" }],
    metadataRaw: { Parent: "999999999" },
    importValidationErrors: ["Parent Course ID 999999999 was not found."],
  },
  20: {
    title: "Circular Relationship Scenario",
    relationships: [{ id: "REL-20-18", relationship: "child", relatedCourseId: generatedLmsId(18), relatedCourseTitle: "Incident Command Parent Curriculum", source: "Content Metadata", validationStatus: "Circular" }],
    metadataRaw: { Child: generatedLmsId(18) },
    importValidationErrors: ["Circular relationship detected between the parent curriculum and child course."],
  },
  21: { title: "Stale Snapshot Preserved After Failure", staleSnapshot: true },
  22: {
    title: "Resolved Name Conflict",
    metadataRaw: { "Course Name": "Content Team Preferred Resolved Name" },
    existingResolution: { fieldKey: "courseName", source: "content_metadata" },
  },
  23: { title: "New Unresolved Conflict", metadataRaw: { Description: "A newly imported description has not been resolved." } },
  24: {
    title: "Malformed Administrative Link",
    metadataRaw: { "Backend Link": "not a valid URL" },
  },
  25: {
    title: "Invalid LMS Duration Scenario",
    lmsRaw: { Duration: "about one hour" },
  },
};

function defaultLmsRow(course: BaseCourse, index: number): Record<string, unknown> {
  const courseId = course.lmsCourseId ?? generatedLmsId(index);
  const site = course.primaryVertical === "EMS1"
    ? "ems1_academy"
    : course.primaryVertical === "FR1A"
      ? "firerescue1_academy"
      : null;
  const accreditation = course.accreditations[0];
  return {
    "Course ID": Number(courseId),
    "Course Type": "Standard Course",
    "Course Name": course.title,
    Duration: (course.durationMinutes / 60).toFixed(2),
    "Course Description": course.description,
    "Public Topics": realTopicsByVertical[course.primaryVertical][index % 3],
    "Private Topics": "Suggested Second Training Courses",
    Sites: site,
    "Published Date": course.originalPublishDate ?? "2025-01-15",
    Author: "Natalie Nelson (NNelson@lexipol.com)",
    Owner: "Lexipol Learning",
    "Visible in Organizations": null,
    "Hidden in Organizations": null,
    "Author Status": "Author is a member of the owner org",
    "Is published": course.publicationStatus === "Published" ? "1" : "0",
    "Has topics": "1",
    "Is Lexipol": "1",
    "Generate Certificate": "Default course behavior",
    "Available in States": course.stateCode,
    "Hidden in States": null,
    Surveys: "eLearning Course Survey - RP (NEW)",
    "Created Date": course.originalPublishDate ?? "2025-01-15",
    "Last Revision Date": course.lastMajorRevisionDate ?? "2025-06-01",
    "Course Accreditation State": accreditation ? `${accreditation.organization}: ${accreditation.jurisdiction}` : null,
    "Training Credits": `${course.durationMinutes} minutes`,
    "Issuing Body": accreditation?.organization ?? null,
    State: accreditation?.jurisdiction ?? null,
    "Accreditation Number": accreditation?.approvalNumber ?? null,
    "Topic Number": accreditation ? String(10_000 + index) : null,
    "Accreditation Start Date": accreditation?.effectiveDate ?? null,
    "Accreditation End Date": accreditation?.expirationDate ?? null,
  };
}

function defaultMetadataRow(course: BaseCourse, index: number): Record<string, unknown> {
  const courseId = course.lmsCourseId ?? generatedLmsId(index);
  return {
    "Course Id": Number(courseId),
    "Course Name": course.title,
    "Content Type": course.deliveryFormat === "Video" ? "Single Video Course" : "Interactive Course",
    "Duration (min)": course.durationMinutes,
    "Training Credits": `${course.durationMinutes} minutes`,
    Published: course.publicationStatus === "Published" ? "Yes" : "No",
    "Authoring Tool": course.authoringTool,
    Description: course.description,
    "Backend Link": `https://olt.policeoneacademy.com/editor/content/course/${courseId}/change/`,
    "Frontend Link": `https://olt.policeoneacademy.com/courses/${courseId}`,
    "Published Date": course.originalPublishDate ?? "2025-01-15",
    "Update Type": null,
    Updated: null,
    Verticals: course.primaryVertical,
    Parent: null,
    Child: null,
    Notes: index % 4 === 0 ? "Imported Content Team note retained separately from CourseTrack notes." : null,
  };
}

function deriveReconciliationStatus(input: {
  hasLms: boolean;
  hasMetadata: boolean;
  mappingWarnings: string[];
  validationErrors: string[];
}): ReconciliationStatus {
  if (input.validationErrors.length > 0) return "Invalid source record";
  if (input.mappingWarnings.some((warning) => /unknown|mapping/i.test(warning))) return "Mapping required";
  if (input.hasLms && input.hasMetadata) return "Matched between LMS and Content Metadata";
  if (input.hasLms) return "LMS only / missing Content Metadata";
  return "Content Metadata only / missing from LMS";
}

function toAccreditationRecords(
  course: BaseCourse,
  snapshot: LmsCourseSnapshot | null,
): AccreditationRecord[] {
  const records = snapshot?.normalized.accreditations.filter((record) => record.issuingBody) ?? [];
  if (records.length === 0) return course.accreditations;
  const creditHours = (snapshot?.normalized.trainingCredits.amount ?? 0) / 60;
  return records.map((record, index) => {
    const expiration = record.endDate;
    const status: AccreditationRecord["status"] = !expiration
      ? "Approved"
      : expiration < "2026-07-30"
        ? "Expired"
        : expiration <= "2026-09-30"
          ? "Expiring Soon"
          : "Approved";
    return {
      id: `${course.id}-LMS-ACC-${index + 1}`,
      organization: record.issuingBody ?? "Unknown issuing body",
      jurisdiction: record.state ?? "National",
      status,
      approvalNumber: record.accreditationNumber,
      creditHours,
      effectiveDate: record.startDate,
      expirationDate: record.endDate,
      source: "lms",
      riskReasons: record.mappingWarnings,
    };
  });
}

function enrichCourse(baseCourse: BaseCourse, index: number): Course {
  const spec = scenarioSpecs[index] ?? {};
  const course = {
    ...baseCourse,
    title: spec.title ?? baseCourse.title,
    shortTitle: (spec.title ?? baseCourse.title).split(" ").slice(0, 5).join(" "),
    description: spec.description ?? baseCourse.description,
    lmsCourseId: index === 0 ? "102319414" : index === 1 ? "102046126" : baseCourse.lmsCourseId ?? generatedLmsId(index),
  };
  const lmsPresent = spec.lmsPresent !== false;
  const metadataPresent = spec.metadataPresent !== false;
  const lmsRaw = { ...defaultLmsRow(course, index), ...spec.lmsRaw };
  const metadataRaw = { ...defaultMetadataRow(course, index), ...spec.metadataRaw };
  const parsedLms = lmsPresent ? parseLmsRow(lmsRaw) : null;
  const parsedMetadata = metadataPresent
    ? parseContentMetadataRow(metadataRaw, {
        importRunId: "CM-IMPORT-2026-0730",
        importedAt: "2026-07-30T14:15:00.000Z",
      })
    : null;
  let comparisons = reconcileCourseSources(parsedLms, parsedMetadata);
  const auditHistory: AuditHistoryRecord[] = [];
  if (spec.existingResolution) {
    const comparison = comparisons.find((item) => item.fieldKey === spec.existingResolution?.fieldKey);
    if (comparison) {
      const resolution = applyFieldResolution(
        comparison,
        spec.existingResolution.source === "lms" ? "Use LMS value" : "Keep Content Team value",
        "Dana Weiss",
        "2026-07-29T16:20:00.000Z",
        "Reviewed against the Content Team source record.",
      );
      comparisons = reconcileCourseSources(parsedLms, parsedMetadata, [resolution.comparison], "2026-07-30T14:30:00.000Z");
      auditHistory.push({
        id: `${course.id}-AUDIT-RESOLUTION`,
        action: resolution.audit.action,
        actor: resolution.audit.actor,
        occurredAt: resolution.audit.occurredAt,
        reason: resolution.audit.reason,
      });
    }
  }
  const mappingWarnings = [
    ...(parsedLms?.warnings ?? []),
    ...(parsedMetadata?.mappingWarnings ?? []),
    ...(spec.mappingWarnings ?? []),
    ...(!metadataPresent && lmsPresent ? ["No Content Metadata record matched this LMS Course ID."] : []),
    ...(!lmsPresent && metadataPresent ? ["Content Metadata Course ID is not present in the LMS snapshot."] : []),
  ];
  const importValidationErrors = [
    ...(parsedMetadata?.validationErrors ?? []),
    ...(spec.importValidationErrors ?? []),
  ];
  const lmsSnapshot: LmsCourseSnapshot | null = parsedLms?.normalized.courseId
    ? {
        id: `${course.id}-SNAPSHOT-1`,
        retrievalRunId: "RUN-2026-0730-01",
        provider: "Mock LMS",
        lmsCourseId: parsedLms.normalized.courseId,
        retrievedAt: spec.staleSnapshot ? "2026-05-15T12:00:00.000Z" : "2026-07-30T13:45:00.000Z",
        isCurrent: true,
        rawPayload: parsedLms.rawPayload,
        normalized: {
          ...parsedLms.normalized,
          courseId: parsedLms.normalized.courseId,
          mappedVerticals: parsedLms.normalized.mappedVerticals.filter((value): value is Vertical => verticals.includes(value as Vertical)),
        },
        mappingWarnings: parsedLms.warnings,
      }
    : null;
  const contentMetadata: ContentMetadataRecord | null = parsedMetadata?.lmsCourseId
    ? {
        ...parsedMetadata,
        lmsCourseId: parsedMetadata.lmsCourseId,
        verticals: parsedMetadata.verticals.filter((value): value is Vertical => verticals.includes(value as Vertical)),
      }
    : null;
  const importedTopics = spec.importedTopics ?? [realTopicsByVertical[course.primaryVertical][index % 3]];
  const topicAssignments: CourseTopicAssignment[] = [
    ...(lmsSnapshot?.normalized.publicTopics ?? []).map((topic, topicIndex) => ({
      id: `${course.id}-LMS-PUBLIC-${topicIndex + 1}`,
      topic,
      originalTopicLabel: topic,
      source: "LMS Public Topic" as const,
      importRunId: null,
      assignedAt: lmsSnapshot?.retrievedAt ?? "2026-07-30T13:45:00.000Z",
    })),
    ...(lmsSnapshot?.normalized.privateTopics ?? []).map((topic, topicIndex) => ({
      id: `${course.id}-LMS-PRIVATE-${topicIndex + 1}`,
      topic,
      originalTopicLabel: topic,
      source: "LMS Private Topic" as const,
      importRunId: null,
      assignedAt: lmsSnapshot?.retrievedAt ?? "2026-07-30T13:45:00.000Z",
    })),
    ...importedTopics.map((topic, topicIndex) => ({
      id: `${course.id}-TOPIC-IMPORT-${topicIndex + 1}`,
      topic,
      originalTopicLabel: topic,
      source: "Topics import" as const,
      importRunId: "TOPICS-IMPORT-2026-0730",
      assignedAt: "2026-07-30T15:00:00.000Z",
    })),
  ].filter((assignment, assignmentIndex, all) => all.findIndex((candidate) => candidate.topic === assignment.topic && candidate.source === assignment.source) === assignmentIndex);
  const verticalAssignments: VerticalAssignment[] = [
    { vertical: course.primaryVertical, source: "CourseTrack", sourceValue: course.primaryVertical, isPrimary: true },
    ...(lmsSnapshot?.normalized.mappedVerticals ?? []).map((vertical) => ({ vertical, source: "LMS Site mapping" as const, sourceValue: lmsSnapshot?.normalized.sites.find((site) => site.toLowerCase().includes(vertical.toLowerCase().replace("a", ""))) ?? vertical, isPrimary: vertical === course.primaryVertical })),
    ...(contentMetadata?.verticals ?? []).map((vertical) => ({ vertical, source: "Content Metadata" as const, sourceValue: vertical, isPrimary: vertical === course.primaryVertical })),
  ];
  const managementClassification = spec.managementClassification ?? (metadataPresent ? "Lexipol managed" : "Unclassified");
  const monitoringEnabled = spec.monitoringEnabled ?? managementClassification !== "Non-Lexipol excluded";
  const reconciliationStatus = deriveReconciliationStatus({
    hasLms: Boolean(lmsSnapshot),
    hasMetadata: Boolean(contentMetadata),
    mappingWarnings,
    validationErrors: importValidationErrors,
  });
  const sourceTimestamps: CourseSourceTimestamps = {
    lmsRetrievedAt: lmsSnapshot?.retrievedAt ?? null,
    contentMetadataImportedAt: contentMetadata?.importedAt ?? null,
    topicsImportedAt: topicAssignments.some((assignment) => assignment.source === "Topics import") ? "2026-07-30T15:00:00.000Z" : null,
    lastComparedAt: comparisons[0]?.lastComparedAt ?? null,
  };
  const getResolved = (fieldKey: string) => comparisons.find((comparison) => comparison.fieldKey === fieldKey)?.resolvedValue ?? null;
  const resolvedFields: ResolvedCourseFields = {
    courseName: getResolved("courseName") as string | null,
    durationMinutes: getResolved("durationMinutes") as number | null,
    trainingCredits: getResolved("trainingCredits") as ResolvedCourseFields["trainingCredits"],
    published: getResolved("published") as boolean | null,
    description: getResolved("description") as string | null,
    publishedDate: getResolved("publishedDate") as string | null,
  };
  const importHistory: SourceHistoryRecord[] = [
    ...(contentMetadata ? [{ id: `${course.id}-IMPORT-CM`, source: "Content Metadata" as const, runId: contentMetadata.importRunId, status: (contentMetadata.validationErrors.length > 0 ? "Succeeded with warnings" : "Succeeded") as SourceHistoryRecord["status"], occurredAt: contentMetadata.importedAt, summary: "Content Metadata record imported after preview confirmation." }] : []),
    { id: `${course.id}-IMPORT-TOPICS`, source: "Topics", runId: "TOPICS-IMPORT-2026-0730", status: "Succeeded", occurredAt: "2026-07-30T15:00:00.000Z", summary: `${importedTopics.length} topic assignment${importedTopics.length === 1 ? "" : "s"} imported.` },
  ];
  const retrievalHistory: SourceHistoryRecord[] = lmsSnapshot
    ? [
        { id: `${course.id}-RETRIEVAL-SUCCESS`, source: "LMS", runId: "RUN-2026-0730-01", status: "Succeeded", occurredAt: lmsSnapshot.retrievedAt, summary: "Read-only LMS snapshot retrieved and preserved." },
        ...(spec.staleSnapshot ? [{ id: `${course.id}-RETRIEVAL-FAILURE`, source: "LMS" as const, runId: "RUN-2026-0724-01", status: "Failed" as const, occurredAt: "2026-07-24T12:00:03.000Z", summary: "Retrieval failed; the previous successful snapshot remained current." }] : []),
      ]
    : [];
  const accreditations = toAccreditationRecords(course, lmsSnapshot);
  const nearestAccreditationExpiration = accreditations
    .map((record) => record.expirationDate)
    .filter((value): value is string => Boolean(value))
    .sort()[0] ?? null;
  const metadataCompletenessScore = calculateMetadataCompleteness(contentMetadata);
  const conflictCount = comparisons.filter((comparison) => comparison.comparisonStatus === "Conflict" && !comparison.selectedSource).length;
  const retrievalStatus = spec.staleSnapshot
    ? "Stale Data"
    : reconciliationStatus === "Mapping required"
      ? "Mapping Required"
      : baseCourse.retrievalStatus;

  return {
    ...course,
    title: resolvedFields.courseName ?? course.title,
    description: resolvedFields.description ?? course.description,
    durationMinutes: resolvedFields.durationMinutes ?? course.durationMinutes,
    managementClassification,
    monitoringEnabled,
    reconciliationStatus,
    accreditations,
    accreditationStatus: accreditations[0]?.status ?? course.accreditationStatus,
    nearestAccreditationExpiration,
    metadataCompletenessScore,
    retrievalStatus,
    lastRetrievedAt: lmsSnapshot?.retrievedAt ?? null,
    lmsSnapshot,
    contentMetadata,
    resolvedFields,
    fieldComparisons: comparisons as FieldComparison[],
    sourceTimestamps,
    mappingWarnings: [...new Set(mappingWarnings)],
    topicAssignments,
    verticalAssignments,
    relationships: spec.relationships ?? [],
    importHistory,
    retrievalHistory,
    auditHistory,
    conflictCount,
    importValidationErrors: [...new Set(importValidationErrors)],
  };
}

export const sampleCourses: Course[] = generatedBaseCourses.map(enrichCourse);

export const sampleContentMetadataRows = [
  defaultMetadataRow(generatedBaseCourses[2], 2),
  { ...defaultMetadataRow(generatedBaseCourses[3], 3), "Course Id": generatedLmsId(3) },
  { ...defaultMetadataRow(generatedBaseCourses[4], 4), "Course Id": generatedLmsId(3) },
  { ...defaultMetadataRow(generatedBaseCourses[5], 5), "Course Id": null },
  { ...defaultMetadataRow(generatedBaseCourses[6], 6), Verticals: "EMS1; FUTURE" },
  { ...defaultMetadataRow(generatedBaseCourses[7], 7), "Backend Link": "not a URL" },
] satisfies Record<string, unknown>[];

export const sampleImportPreviews = {
  contentMetadata: {
    matchedLmsCourses: 57,
    contentMetadataOnlyRecords: 1,
    lmsCoursesMissingMetadata: 6,
    duplicateCourseIds: 1,
    missingCourseIds: 1,
    invalidVerticals: 1,
    invalidUrls: 2,
    missingRelationshipTargets: 1,
    circularRelationships: 1,
    overlappingFieldConflicts: sampleCourses.reduce((count, course) => count + course.fieldComparisons.filter((comparison) => comparison.comparisonStatus === "Conflict").length, 0),
    fieldsWouldBeAdded: 142,
    fieldsUnchanged: 281,
    rowsBlocked: 4,
  },
  topics: {
    topicCount: 99,
    assignmentCount: 9_042,
    uniqueCourseIdCount: 2_184,
    duplicateAssignments: 7,
    unknownCourseIds: 13,
    emptyTopics: 2,
    normalizedTopicNames: 99,
  },
  monitoring: {
    fixtureLabel: "Mock monitored-course master list (column mapping configurable)",
    rows: 4,
    enabled: 3,
    excluded: 1,
  },
};

export const sampleMonitoringRows = [
  { "LMS Course ID": generatedLmsId(15), Classification: "Unclassified", Monitored: "Yes", Reason: "New LMS record awaiting portfolio review", Owner: null, "Effective Date": "2026-07-30" },
  { "LMS Course ID": generatedLmsId(16), Classification: "Non-Lexipol tracked", Monitored: "Yes", Reason: "Partner content retained for operational monitoring", Owner: "Alex Morgan", "Effective Date": "2026-07-30" },
  { "LMS Course ID": generatedLmsId(17), Classification: "Non-Lexipol excluded", Monitored: "No", Reason: "Third-party catalog content outside the managed portfolio", Owner: null, "Effective Date": "2026-07-30" },
  { "LMS Course ID": generatedLmsId(2), Classification: "Lexipol managed", Monitored: "Yes", Reason: "Confirmed by Content Metadata match", Owner: "Taylor Reed", "Effective Date": "2026-07-30" },
] as const;

export const sampleRetrievalRuns: RetrievalRun[] = [
  {
    id: "RUN-2026-0730-01",
    provider: "Mock LMS",
    startedAt: "2026-07-30T13:45:00.000Z",
    completedAt: "2026-07-30T13:45:08.000Z",
    status: "Retrieved",
    recordsRequested: 63,
    recordsReceived: 63,
    recordsFailed: 0,
    message: "Sample LMS snapshot retrieved successfully.",
  },
  {
    id: "RUN-2026-0728-02",
    provider: "Mock LMS",
    startedAt: "2026-07-28T16:10:00.000Z",
    completedAt: "2026-07-28T16:10:05.000Z",
    status: "Retrieved with Warnings",
    recordsRequested: 63,
    recordsReceived: 61,
    recordsFailed: 2,
    message: "Two sample records included mapping warnings; prior snapshots were preserved.",
  },
  {
    id: "RUN-2026-0724-01",
    provider: "Mock LMS",
    startedAt: "2026-07-24T12:00:00.000Z",
    completedAt: "2026-07-24T12:00:03.000Z",
    status: "Retrieval Failed",
    recordsRequested: 63,
    recordsReceived: 0,
    recordsFailed: 63,
    message: "Simulated provider outage. The last successful LMS snapshot remained active.",
  },
];

export function getCourse(courseId: string): Course | undefined {
  return sampleCourses.find((course) => course.id === courseId);
}

export const dashboardMetrics = {
  ...calculateSourceAwareMetrics(sampleCourses),
  total: sampleCourses.length,
  active: sampleCourses.filter(
    (course) => !["Retired", "Archived"].includes(course.lifecycleStatus),
  ).length,
  dueForReview: sampleCourses.filter(
    (course) => course.nextReviewDate && course.nextReviewDate <= isoDate(90),
  ).length,
  overdue: sampleCourses.filter(
    (course) => course.nextReviewDate && course.nextReviewDate < isoDate(0),
  ).length,
  accreditationRisk: sampleCourses.filter((course) =>
    ["Expiring Soon", "Expired", "Approved with Conditions"].includes(
      course.accreditationStatus,
    ),
  ).length,
  unresolvedFlags: sampleCourses.reduce(
    (count, course) =>
      count + course.flags.filter((flag) => flag.status !== "Resolved").length,
    0,
  ),
  proposedRevamps: sampleCourses.filter((course) => course.revampProposal).length,
  staleLms: sampleCourses.filter((course) =>
    ["Stale Data", "Retrieval Failed"].includes(course.retrievalStatus),
  ).length,
};
