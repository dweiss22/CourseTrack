import sourceJson from "@/lib/generated/mock-source-data.json";
import { sampleWrikeTasks } from "@/lib/sample-wrike-data";
import {
  calculateMetadataCompleteness,
  calculateSourceAwareMetrics,
  normalizeDate,
  parseContentMetadataRow,
  parseLmsRow,
  reconcileCourseSources,
} from "@/lib/source-normalization";
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
  ReconciliationStatus,
  ResolvedCourseFields,
  RetrievalRun,
  RevampProposal,
  SourceHistoryRecord,
  Vertical,
  VerticalAssignment,
} from "@/types/course";
import { verticalNames, verticals } from "@/types/course";

type SourceRow = Record<string, unknown>;

type TopicImport = {
  topic: string;
  vertical: Vertical;
};

type SourceStats = {
  totalLmsRows: number;
  metadataRows: number;
  matchedCourses: number;
  metadataOnlyCourses: number;
  topicColumns: number;
  topicAssignments: number;
  matchedTopicAssignments: number;
  matchedTopicCourseIds: number;
  unknownTopicCourseIds: number;
  contentTypes: Record<string, number>;
};

type ImportedSourceData = {
  generatedAt: string;
  metadataRows: SourceRow[];
  lmsRowsByCourseId: Record<string, SourceRow>;
  topicsByCourseId: Record<string, TopicImport[]>;
  stats: SourceStats;
};

const sourceData = sourceJson as unknown as ImportedSourceData;
const importedAt = sourceData.generatedAt;
const comparedAt = "2026-07-31T20:15:00.000Z";
const retrievalRunId = "LMS-EXPORT-2026-0731";
const metadataImportRunId = "CONTENT-METADATA-2026-0731";
const topicsImportRunId = "TOPICS-IMPORT-2026-0731";
const verticalSet = new Set<string>(verticals);

const titleByLmsId = new Map(
  sourceData.metadataRows.map((row) => [
    String(row["Course Id"]),
    String(row["Course Name"] ?? "Untitled course"),
  ]),
);

function validVerticals(values: readonly string[]): Vertical[] {
  return values.filter((value): value is Vertical => verticalSet.has(value));
}

function inferVerticals(
  metadataVerticals: readonly Vertical[],
  importedTopics: readonly TopicImport[],
): Vertical[] {
  const inferred = importedTopics.map((topic) => topic.vertical);
  const values = [...new Set([...metadataVerticals, ...inferred])];
  return values.length > 0 ? values : ["P1A"];
}

function deliveryFormat(contentType: string | null): string {
  switch (contentType) {
    case "Single Video Course":
      return "Video";
    case "Training Block Course":
      return "Training Block";
    case "Roll Call Training":
      return "Roll Call Training";
    case "Policy":
      return "Policy Reference";
    default:
      return "Self-Paced Online";
  }
}

function dateValue(value: unknown): string | null {
  return normalizeDate(value).value?.slice(0, 10) ?? null;
}

function addDays(date: string | null, days: number): string {
  const base = date ? new Date(`${date}T12:00:00.000Z`) : new Date("2026-07-31T12:00:00.000Z");
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

function healthStatus(score: number): HealthStatus {
  if (score >= 85) return "Healthy";
  if (score >= 70) return "Monitor";
  if (score >= 55) return "Needs Review";
  if (score >= 35) return "At Risk";
  return "Critical";
}

function reconciliationStatus(input: {
  hasLms: boolean;
  validationErrors: string[];
  mappingWarnings: string[];
}): ReconciliationStatus {
  if (input.validationErrors.length > 0) return "Invalid source record";
  if (input.mappingWarnings.some((warning) => /unknown|mapping/i.test(warning))) {
    return "Mapping required";
  }
  return input.hasLms
    ? "Matched between LMS and Content Metadata"
    : "Content Metadata only / missing from LMS";
}

function buildVersions(
  courseId: string,
  index: number,
  publicationDate: string | null,
  updatedDate: string | null,
  updateType: string | null,
  authoringTool: string,
): CourseVersion[] {
  const initialDate = publicationDate ?? addDays(null, -1_000 - (index % 600));
  const hasRevision = Boolean(updateType || updatedDate);
  const dates = hasRevision ? [initialDate, updatedDate ?? addDays(initialDate, 365)] : [initialDate];
  return dates.map((date, versionIndex) => {
    const isCurrent = versionIndex === dates.length - 1;
    const task = isCurrent && hasRevision
      ? sampleWrikeTasks[index % sampleWrikeTasks.length]
      : null;
    return {
      id: `${courseId}-V${versionIndex + 1}`,
      versionNumber: versionIndex === 0 ? "1.0" : "2.0",
      versionType: versionIndex === 0 ? "Initial Release" : "Major Revision",
      publicationDate: date,
      isCurrent,
      versionStatus: isCurrent ? "Published" : "Superseded",
      managedBy: "CourseTrack",
      createdAt: `${date}T15:00:00.000Z`,
      createdBy: "CourseTrack import",
      releaseNotes: versionIndex === 0
        ? "Initial app-owned version created from imported course metadata."
        : `${updateType ?? "Course update"} recorded from the Content Metadata source.`,
      authoringTool,
      packageStandard: "Source package standard not supplied",
      wrikeTaskReferences: task
        ? [{
            id: `${courseId}-V${versionIndex + 1}-WRIKE-1`,
            wrikeTaskId: task.externalTaskId,
            taskTitle: task.title,
            projectId: task.projectId,
            projectTitle: task.projectTitle,
            taskStatus: task.status,
            assigneeNames: task.assigneeNames,
            dueDate: task.dueDate,
            permalink: task.permalink,
            provider: task.providerName,
            retrievedAt: task.retrievedAt,
            linkedAt: `${date}T14:00:00.000Z`,
            linkedBy: "Dana Weiss",
            isSample: true,
          }]
        : [],
    };
  });
}

function buildAccreditations(
  courseId: string,
  snapshot: LmsCourseSnapshot | null,
): AccreditationRecord[] {
  if (!snapshot) return [];
  const creditHours = (snapshot.normalized.trainingCredits.amount ?? 0) / 60;
  return snapshot.normalized.accreditations
    .filter((record) => record.issuingBody)
    .map((record, index) => {
      const expirationDate = record.endDate;
      const status: AccreditationRecord["status"] = !expirationDate
        ? "Approved"
        : expirationDate < "2026-07-31"
          ? "Expired"
          : expirationDate <= "2026-10-31"
            ? "Expiring Soon"
            : "Approved";
      return {
        id: `${courseId}-ACC-${index + 1}`,
        organization: record.issuingBody ?? "Unknown issuing body",
        jurisdiction: record.state ?? "National",
        status,
        approvalNumber: record.accreditationNumber,
        creditHours,
        effectiveDate: record.startDate,
        expirationDate,
        source: "lms",
        riskReasons: record.mappingWarnings,
      };
    });
}

function buildRelationships(
  courseId: string,
  metadata: ContentMetadataRecord,
): CourseRelationship[] {
  return [
    ...metadata.parentCourseIds.map((relatedCourseId, index) => ({
      id: `${courseId}-PARENT-${index + 1}`,
      relationship: "parent" as const,
      relatedCourseId,
      relatedCourseTitle: titleByLmsId.get(relatedCourseId) ?? null,
      source: "Content Metadata" as const,
      validationStatus: titleByLmsId.has(relatedCourseId) ? "Resolved" as const : "Missing target" as const,
    })),
    ...metadata.childCourseIds.map((relatedCourseId, index) => ({
      id: `${courseId}-CHILD-${index + 1}`,
      relationship: "child" as const,
      relatedCourseId,
      relatedCourseTitle: titleByLmsId.get(relatedCourseId) ?? null,
      source: "Content Metadata" as const,
      validationStatus: titleByLmsId.has(relatedCourseId) ? "Resolved" as const : "Missing target" as const,
    })),
  ];
}

function buildCourse(metadataRow: SourceRow, index: number): Course {
  const parsedMetadata = parseContentMetadataRow(metadataRow, {
    importRunId: metadataImportRunId,
    importedAt,
  });
  const lmsCourseId = parsedMetadata.lmsCourseId ?? `INVALID-${index + 1}`;
  const courseId = `CT-${lmsCourseId}`;
  const lmsRow = sourceData.lmsRowsByCourseId[lmsCourseId] ?? null;
  const parsedLms = lmsRow ? parseLmsRow(lmsRow) : null;
  const importedTopics = sourceData.topicsByCourseId[lmsCourseId] ?? [];
  const metadataVerticals = validVerticals(parsedMetadata.verticals);
  const assignedVerticals = inferVerticals(metadataVerticals, importedTopics);
  const primaryVertical = assignedVerticals[0];
  const secondaryVerticals = assignedVerticals.slice(1);
  const fieldComparisons = reconcileCourseSources(parsedLms, parsedMetadata, [], comparedAt) as FieldComparison[];
  const getResolved = (fieldKey: string) =>
    fieldComparisons.find((comparison) => comparison.fieldKey === fieldKey)?.resolvedValue ?? null;
  const resolvedFields: ResolvedCourseFields = {
    courseName: getResolved("courseName") as string | null,
    durationMinutes: getResolved("durationMinutes") as number | null,
    trainingCredits: getResolved("trainingCredits") as ResolvedCourseFields["trainingCredits"],
    published: getResolved("published") as boolean | null,
    description: getResolved("description") as string | null,
    publishedDate: getResolved("publishedDate") as string | null,
  };
  const title = resolvedFields.courseName ?? parsedMetadata.courseName ?? parsedLms?.normalized.courseName ?? `Course ${lmsCourseId}`;
  const description = resolvedFields.description ?? parsedMetadata.description ?? parsedLms?.normalized.courseDescription ?? "No course description was supplied in the current source files.";
  const durationMinutes = resolvedFields.durationMinutes ?? parsedMetadata.durationMinutes ?? parsedLms?.normalized.durationMinutes ?? 0;
  const published = resolvedFields.published ?? parsedMetadata.published ?? parsedLms?.normalized.isPublished ?? false;
  const publicationDate = resolvedFields.publishedDate ?? parsedMetadata.publishedDate ?? parsedLms?.normalized.publishedDate ?? null;
  const updatedDate = dateValue(parsedMetadata.updatedRawValue) ?? parsedLms?.normalized.lastRevisionDate?.slice(0, 10) ?? null;
  const authoringTool = parsedMetadata.authoringTool ?? "Not supplied";
  const versions = buildVersions(courseId, index, publicationDate, updatedDate, parsedMetadata.updateType, authoringTool);

  const lmsSnapshot: LmsCourseSnapshot | null = parsedLms?.normalized.courseId
    ? {
        id: `${courseId}-SNAPSHOT-1`,
        retrievalRunId,
        provider: "Mock LMS export",
        lmsCourseId: parsedLms.normalized.courseId,
        retrievedAt: "2026-07-31T19:45:00.000Z",
        isCurrent: true,
        rawPayload: parsedLms.rawPayload,
        normalized: {
          ...parsedLms.normalized,
          courseId: parsedLms.normalized.courseId,
          mappedVerticals: validVerticals(parsedLms.normalized.mappedVerticals),
        },
        mappingWarnings: parsedLms.warnings,
      }
    : null;
  const contentMetadata: ContentMetadataRecord = {
    ...parsedMetadata,
    lmsCourseId,
    verticals: metadataVerticals,
  };
  const topicAssignments: CourseTopicAssignment[] = [
    ...(lmsSnapshot?.normalized.publicTopics ?? []).map((topic, topicIndex) => ({
      id: `${courseId}-LMS-PUBLIC-${topicIndex + 1}`,
      topic,
      originalTopicLabel: topic,
      source: "LMS Public Topic" as const,
      importRunId: null,
      assignedAt: lmsSnapshot?.retrievedAt ?? importedAt,
    })),
    ...(lmsSnapshot?.normalized.privateTopics ?? []).map((topic, topicIndex) => ({
      id: `${courseId}-LMS-PRIVATE-${topicIndex + 1}`,
      topic,
      originalTopicLabel: topic,
      source: "LMS Private Topic" as const,
      importRunId: null,
      assignedAt: lmsSnapshot?.retrievedAt ?? importedAt,
    })),
    ...importedTopics.map(({ topic }, topicIndex) => ({
      id: `${courseId}-TOPIC-${topicIndex + 1}`,
      topic,
      originalTopicLabel: topic,
      source: "Topics import" as const,
      importRunId: topicsImportRunId,
      assignedAt: importedAt,
    })),
  ].filter((assignment, assignmentIndex, all) =>
    all.findIndex((candidate) => candidate.topic === assignment.topic && candidate.source === assignment.source) === assignmentIndex,
  );
  const verticalAssignments: VerticalAssignment[] = [
    ...assignedVerticals.map((vertical, verticalIndex) => ({
      vertical,
      source: metadataVerticals.includes(vertical) ? "Content Metadata" as const : "CourseTrack" as const,
      sourceValue: vertical,
      isPrimary: verticalIndex === 0,
    })),
    ...(lmsSnapshot?.normalized.mappedVerticals ?? []).map((vertical) => ({
      vertical,
      source: "LMS Site mapping" as const,
      sourceValue: vertical,
      isPrimary: vertical === primaryVertical,
    })),
  ].filter((assignment, assignmentIndex, all) =>
    all.findIndex((candidate) => candidate.vertical === assignment.vertical && candidate.source === assignment.source) === assignmentIndex,
  );
  const mappingWarnings = [
    ...(parsedLms?.warnings ?? []),
    ...parsedMetadata.mappingWarnings,
    ...(!lmsSnapshot ? ["Content Metadata Course ID is not present in the supplied LMS exports."] : []),
  ];
  const importValidationErrors = parsedMetadata.validationErrors;
  const status = reconciliationStatus({
    hasLms: Boolean(lmsSnapshot),
    validationErrors: importValidationErrors,
    mappingWarnings,
  });
  const metadataCompletenessScore = calculateMetadataCompleteness(contentMetadata);
  const conflictCount = fieldComparisons.filter((comparison) => comparison.comparisonStatus === "Conflict" && !comparison.selectedSource).length;
  const score = Math.max(
    10,
    Math.min(100, metadataCompletenessScore - conflictCount * 7 - importValidationErrors.length * 15 - (lmsSnapshot ? 0 : 10)),
  );
  const courseHealth = healthStatus(score);
  const flags: CourseFlag[] = [
    ...(conflictCount > 0 ? [{
      id: `${courseId}-FLAG-CONFLICT`,
      type: "Source conflict",
      title: `${conflictCount} source field${conflictCount === 1 ? "" : "s"} require resolution`,
      priority: conflictCount >= 3 ? "High" as const : "Medium" as const,
      status: "Open" as const,
      owner: null,
      dueDate: addDays(null, 30 + (index % 60)),
    }] : []),
    ...(importValidationErrors.length > 0 ? [{
      id: `${courseId}-FLAG-IMPORT`,
      type: "Import validation",
      title: "Content Metadata row contains validation errors",
      priority: "High" as const,
      status: "Open" as const,
      owner: null,
      dueDate: addDays(null, 14),
    }] : []),
  ];
  const notes: CourseNote[] = parsedMetadata.notes
    ? [{
        id: `${courseId}-NOTE-1`,
        type: "Imported note",
        author: "Content Metadata import",
        createdAt: importedAt,
        visibility: "Team",
        body: parsedMetadata.notes,
      }]
    : [];
  const revampProposal: RevampProposal | null = parsedMetadata.updateType || updatedDate
    ? {
        id: `${courseId}-REVAMP-1`,
        title: `${parsedMetadata.updateType ?? "Update"}: ${title}`,
        status: updatedDate ? "In Progress" : "Submitted",
        priority: "Medium",
        score: Math.max(40, 100 - score),
        targetPublicationDate: updatedDate,
        businessJustification: "Content Metadata identifies an update or revision for this course.",
      }
    : null;
  const accreditations = buildAccreditations(courseId, lmsSnapshot);
  const nearestAccreditationExpiration = accreditations
    .map((record) => record.expirationDate)
    .filter((value): value is string => Boolean(value))
    .sort()[0] ?? null;
  const relationships = buildRelationships(courseId, contentMetadata);
  const importHistory: SourceHistoryRecord[] = [
    {
      id: `${courseId}-IMPORT-METADATA`,
      source: "Content Metadata",
      runId: metadataImportRunId,
      status: importValidationErrors.length > 0 ? "Succeeded with warnings" : "Succeeded",
      occurredAt: importedAt,
      summary: "Course metadata imported from LMS new list - master.xlsx.",
    },
    ...(importedTopics.length > 0 ? [{
      id: `${courseId}-IMPORT-TOPICS`,
      source: "Topics" as const,
      runId: topicsImportRunId,
      status: "Succeeded" as const,
      occurredAt: importedAt,
      summary: `${importedTopics.length} topic assignment${importedTopics.length === 1 ? "" : "s"} imported from LMS new list - Topics.xlsx.`,
    }] : []),
  ];
  const retrievalHistory: SourceHistoryRecord[] = lmsSnapshot
    ? [{
        id: `${courseId}-RETRIEVAL-1`,
        source: "LMS",
        runId: retrievalRunId,
        status: parsedLms?.warnings.length ? "Succeeded with warnings" : "Succeeded",
        occurredAt: lmsSnapshot.retrievedAt,
        summary: "Read-only LMS snapshot loaded from the supplied LMS exports.",
      }]
    : [];
  const sourceTimestamps: CourseSourceTimestamps = {
    lmsRetrievedAt: lmsSnapshot?.retrievedAt ?? null,
    contentMetadataImportedAt: importedAt,
    topicsImportedAt: importedTopics.length > 0 ? importedAt : null,
    lastComparedAt: comparedAt,
  };
  const primaryTopic = topicAssignments[0]?.topic ?? parsedMetadata.contentType ?? "Uncategorized";
  const currentVersion = versions.find((version) => version.isCurrent)?.versionNumber ?? "1.0";
  const publicationStatus = published ? "Published" as const : "Draft" as const;
  const auditHistory: AuditHistoryRecord[] = [];

  return {
    id: courseId,
    courseCode: `${primaryVertical}-${lmsCourseId}`,
    lmsCourseId,
    managementClassification: "Lexipol managed",
    monitoringEnabled: true,
    reconciliationStatus: status,
    title,
    shortTitle: title.split(/\s+/).slice(0, 6).join(" "),
    description,
    learningAudience: `${verticalNames[primaryVertical]} learners and supervisors`,
    primaryVertical,
    secondaryVerticals,
    primaryTopic,
    tags: [...new Set([parsedMetadata.contentType ?? "Course", ...topicAssignments.map((assignment) => assignment.topic)])].slice(0, 6),
    lifecycleStatus: published ? "Published" : "In Development",
    publicationStatus,
    deliveryFormat: deliveryFormat(parsedMetadata.contentType),
    durationMinutes,
    authoringTool,
    stateCode: accreditations[0]?.jurisdiction ?? null,
    owner: parsedLms?.normalized.owner ?? parsedLms?.normalized.author.displayName ?? null,
    instructionalDesigner: null,
    currentVersion,
    originalPublishDate: publicationDate,
    lastMajorRevisionDate: updatedDate,
    nextReviewDate: addDays(updatedDate ?? publicationDate, 1_095 + (index % 180)),
    accreditationStatus: accreditations[0]?.status ?? "Not Required",
    nearestAccreditationExpiration,
    healthStatus: courseHealth,
    healthScore: score,
    metadataCompletenessScore,
    dataSource: "import",
    sourceSystem: "Mock LMS exports + Content Metadata",
    retrievalStatus: lmsSnapshot
      ? parsedLms?.warnings.length ? "Retrieved with Warnings" : "Retrieved"
      : "Sample Data",
    lastRetrievedAt: lmsSnapshot?.retrievedAt ?? null,
    isSample: true,
    internalSummary: lmsSnapshot
      ? "CourseTrack is comparing the supplied LMS snapshot with the current Content Metadata record."
      : "This Content Metadata course was not found in the supplied LMS exports.",
    versions,
    accreditations,
    flags,
    notes,
    revampProposal,
    lmsSnapshot,
    contentMetadata,
    resolvedFields,
    fieldComparisons,
    sourceTimestamps,
    mappingWarnings: [...new Set(mappingWarnings)],
    topicAssignments,
    verticalAssignments,
    relationships,
    importHistory,
    retrievalHistory,
    auditHistory,
    conflictCount,
    importValidationErrors: [...new Set(importValidationErrors)],
  };
}

export const sampleCourses: Course[] = sourceData.metadataRows.map(buildCourse);

export const sampleContentMetadataRows = sourceData.metadataRows;

export const sampleImportPreviews = {
  contentMetadata: {
    totalRows: sourceData.stats.metadataRows,
    matchedLmsCourses: sourceData.stats.matchedCourses,
    contentMetadataOnlyRecords: sourceData.stats.metadataOnlyCourses,
    lmsCoursesMissingMetadata: sourceData.stats.totalLmsRows - sourceData.stats.matchedCourses,
    duplicateCourseIds: 0,
    missingCourseIds: 0,
    invalidVerticals: sampleCourses.reduce((total, course) => total + course.mappingWarnings.filter((warning) => warning.includes("vertical")).length, 0),
    invalidUrls: sampleCourses.reduce((total, course) => total + course.importValidationErrors.filter((error) => error.startsWith("Invalid URL")).length, 0),
    missingRelationshipTargets: sampleCourses.reduce((total, course) => total + course.relationships.filter((relationship) => relationship.validationStatus === "Missing target").length, 0),
    circularRelationships: sampleCourses.reduce((total, course) => total + course.relationships.filter((relationship) => relationship.validationStatus === "Circular").length, 0),
    overlappingFieldConflicts: sampleCourses.reduce((total, course) => total + course.conflictCount, 0),
    fieldsWouldBeAdded: sampleCourses.reduce((total, course) => total + course.fieldComparisons.filter((comparison) => comparison.comparisonStatus === "Content Metadata only").length, 0),
    fieldsUnchanged: sampleCourses.reduce((total, course) => total + course.fieldComparisons.filter((comparison) => comparison.comparisonStatus === "Match").length, 0),
    rowsBlocked: sampleCourses.filter((course) => course.importValidationErrors.length > 0).length,
  },
  topics: {
    topicCount: sourceData.stats.topicColumns,
    assignmentCount: sourceData.stats.matchedTopicAssignments,
    uniqueCourseIdCount: sourceData.stats.matchedTopicCourseIds,
    duplicateAssignments: 0,
    unknownCourseIds: sourceData.stats.unknownTopicCourseIds,
    emptyTopics: 0,
    normalizedTopicNames: sourceData.stats.topicColumns,
  },
  monitoring: {
    fixtureLabel: "Generated monitoring preview",
    rows: sourceData.stats.metadataRows,
    enabled: sourceData.stats.metadataRows,
    excluded: 0,
  },
};

export const sampleMonitoringRows = sampleCourses.slice(0, 12).map((course) => ({
  "Course ID": course.lmsCourseId,
  Classification: course.managementClassification,
  "Monitoring Enabled": "Yes",
  Reason: "Included in the supplied Content Metadata master list.",
}));

export const sampleRetrievalRuns: RetrievalRun[] = [
  {
    id: retrievalRunId,
    provider: "Mock LMS export",
    startedAt: "2026-07-31T19:40:00.000Z",
    completedAt: "2026-07-31T19:45:00.000Z",
    status: "Retrieved",
    recordsRequested: sourceData.stats.totalLmsRows,
    recordsReceived: sourceData.stats.totalLmsRows,
    recordsFailed: 0,
    message: `${sourceData.stats.matchedCourses.toLocaleString()} LMS records matched the ${sourceData.stats.metadataRows.toLocaleString()}-course Content Metadata workspace.`,
  },
];

export function getCourse(courseId: string): Course | undefined {
  return sampleCourses.find((course) => course.id === courseId || course.lmsCourseId === courseId);
}

export const dashboardMetrics = {
  ...calculateSourceAwareMetrics(sampleCourses),
  total: sampleCourses.length,
  active: sampleCourses.filter((course) => !["Retired", "Archived"].includes(course.lifecycleStatus)).length,
  dueForReview: sampleCourses.filter((course) => course.nextReviewDate && course.nextReviewDate <= "2026-10-31").length,
  overdue: sampleCourses.filter((course) => course.nextReviewDate && course.nextReviewDate < "2026-07-31").length,
  accreditationRisk: sampleCourses.filter((course) => ["Expiring Soon", "Expired", "Renewal Due"].includes(course.accreditationStatus)).length,
  unresolvedFlags: sampleCourses.reduce((total, course) => total + course.flags.filter((flag) => flag.status !== "Resolved").length, 0),
  proposedRevamps: sampleCourses.filter((course) => course.revampProposal).length,
};

export const mockSourceStats = sourceData.stats;
