import type {
  AccreditationRecord,
  Course,
  CourseFlag,
  CourseNote,
  CourseVersion,
  HealthStatus,
  LifecycleStatus,
  PublicationStatus,
  RetrievalRun,
  RevampProposal,
  Vertical,
} from "@/types/course";
import { verticals } from "@/types/course";

const baseDate = new Date("2026-07-30T12:00:00.000Z");

const courseThemes: Record<Vertical, string[]> = {
  "Law Enforcement": [
    "De-Escalation Under Pressure",
    "Search and Seizure Fundamentals",
    "Traffic Stop Risk Management",
    "Crisis Intervention for Patrol",
    "Evidence Handling Essentials",
    "Use of Force Decision-Making",
    "Missing Persons Response",
    "Supervisor Liability Update",
  ],
  "Fire and Rescue": [
    "Fireground Command Essentials",
    "Vehicle Extrication Operations",
    "Hazardous Materials Awareness",
    "Wildland Interface Response",
    "Mayday Communications",
    "Technical Rescue Foundations",
    "Building Construction for Firefighters",
    "Rapid Intervention Team Operations",
  ],
  "Emergency Medical Services": [
    "High-Performance CPR",
    "Trauma Assessment Essentials",
    "Pediatric Respiratory Emergencies",
    "Cardiac Arrest Team Leadership",
    "Mass-Casualty Triage",
    "Medication Safety for EMS",
    "Behavioral Crisis Response",
    "Airway Management Update",
  ],
  Corrections: [
    "Inmate Suicide Prevention",
    "Correctional Use of Force",
    "Contraband Detection",
    "Direct Supervision Essentials",
    "PREA Response Responsibilities",
    "Special Management Populations",
    "Report Writing in Corrections",
    "Courtroom Security Fundamentals",
  ],
  "Dispatch and Telecommunications": [
    "Emergency Medical Dispatch Essentials",
    "Caller Management Under Stress",
    "Radio Communications Discipline",
    "Active Threat Call Processing",
    "Quality Assurance for Dispatch",
    "Missing Child Call Response",
    "Critical Incident Stress for Telecommunicators",
    "Next Generation 911 Foundations",
  ],
  "Local Government": [
    "Public Records Fundamentals",
    "Workplace Investigation Basics",
    "Ethics in Local Government",
    "Emergency Operations Center Orientation",
    "Accessible Public Communication",
    "Supervising Hybrid Teams",
    "Cybersecurity Awareness for Municipal Staff",
    "Community Engagement Essentials",
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
  "Cross-Vertical": [
    "Harassment-Free Workplace",
    "Cybersecurity for Public Safety",
    "Inclusive Leadership",
    "Critical Incident Documentation",
    "Public Information During Emergencies",
    "Records Retention Essentials",
    "Accessibility in Digital Learning",
    "Continuity of Operations Planning",
  ],
};

const topicsByVertical: Record<Vertical, string[]> = {
  "Law Enforcement": [
    "De-Escalation",
    "Search and Seizure",
    "Traffic Enforcement",
    "Crisis Intervention",
  ],
  "Fire and Rescue": [
    "Fireground Operations",
    "Vehicle Rescue",
    "Hazardous Materials",
    "Technical Rescue",
  ],
  "Emergency Medical Services": [
    "Cardiology",
    "Trauma",
    "Respiratory Emergencies",
    "Mass-Casualty Incidents",
  ],
  Corrections: [
    "Inmate Management",
    "Suicide Prevention",
    "Use of Force",
    "Facility Security",
  ],
  "Dispatch and Telecommunications": [
    "Emergency Medical Dispatch",
    "Caller Management",
    "Radio Communications",
    "Quality Assurance",
  ],
  "Local Government": [
    "Public Administration",
    "Human Resources",
    "Emergency Management",
    "Community Engagement",
  ],
  Wellness: [
    "Resilience",
    "Peer Support",
    "Behavioral Health",
    "Leadership Wellness",
  ],
  "Cross-Vertical": [
    "Leadership",
    "Compliance",
    "Cybersecurity",
    "Communication",
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

export const sampleCourses: Course[] = Array.from({ length: 64 }, (_, index) => {
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
    courseCode: `${vertical
      .split(" ")
      .map((word) => word[0])
      .join("")
      .replace("&", "")}-${String(index + 101).padStart(4, "0")}`,
    lmsCourseId: withinVertical === 4 ? null : String(102_300_000 + index * 137),
    title: courseThemes[vertical][withinVertical],
    shortTitle: courseThemes[vertical][withinVertical].split(" ").slice(0, 4).join(" "),
    description: `A practical ${deliveryFormats[withinVertical].toLowerCase()} course for ${vertical.toLowerCase()} professionals, focused on ${topicsByVertical[vertical][withinVertical % 4].toLowerCase()} and operational decision-making.`,
    learningAudience: `${vertical} personnel and supervisors`,
    primaryVertical: vertical,
    secondaryVerticals:
      withinVertical === 7 ? ["Cross-Vertical"] : withinVertical === 3 ? [verticals[(verticalIndex + 1) % verticals.length]] : [],
    primaryTopic: topicsByVertical[vertical][withinVertical % 4],
    tags: [
      withinVertical % 2 === 0 ? "Annual Training" : "Refresher",
      withinVertical % 3 === 0 ? "Legal Update" : "Scenario-Based",
      healthStatus === "Critical" ? "High-Risk" : "Continuing Education",
      vertical === "Cross-Vertical" ? "Cross-Vertical" : "Policy-Related",
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

export const sampleRetrievalRuns: RetrievalRun[] = [
  {
    id: "RUN-2026-0730-01",
    provider: "Mock LMS",
    startedAt: "2026-07-30T13:45:00.000Z",
    completedAt: "2026-07-30T13:45:08.000Z",
    status: "Retrieved",
    recordsRequested: 64,
    recordsReceived: 64,
    recordsFailed: 0,
    message: "Sample LMS snapshot retrieved successfully.",
  },
  {
    id: "RUN-2026-0728-02",
    provider: "Mock LMS",
    startedAt: "2026-07-28T16:10:00.000Z",
    completedAt: "2026-07-28T16:10:05.000Z",
    status: "Retrieved with Warnings",
    recordsRequested: 64,
    recordsReceived: 62,
    recordsFailed: 2,
    message: "Two sample records included mapping warnings; prior snapshots were preserved.",
  },
  {
    id: "RUN-2026-0724-01",
    provider: "Mock LMS",
    startedAt: "2026-07-24T12:00:00.000Z",
    completedAt: "2026-07-24T12:00:03.000Z",
    status: "Retrieval Failed",
    recordsRequested: 64,
    recordsReceived: 0,
    recordsFailed: 64,
    message: "Simulated provider outage. The last successful LMS snapshot remained active.",
  },
];

export function getCourse(courseId: string): Course | undefined {
  return sampleCourses.find((course) => course.id === courseId);
}

export const dashboardMetrics = {
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
