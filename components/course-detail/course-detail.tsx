"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Award,
  BookOpen,
  Calendar,
  Check,
  Clock,
  Database,
  Flag,
  GitCompareArrows,
  History,
  Link2,
  LockKeyhole,
  MessageSquareText,
  Pencil,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Star,
  Tags,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { type Dispatch, type FormEvent, type SetStateAction, useState } from "react";
import type {
  AccreditationRecord,
  Course,
  CourseTagAssignment,
  CourseTopicAssignment,
  FieldComparison,
} from "@/types/course";
import { StatusBadge } from "../status-badge";
import { accreditationDisplayLabel, groupAccreditationRecords } from "@/lib/accreditation-grouping";

const tabs = [
  "Overview",
  "Source Comparison",
  "Versions",
  "Accreditation",
  "Topics & Tags",
  "Notes",
  "Flags",
  "Revamp Planning",
  "LMS Data",
  "Activity",
] as const;

type Tab = (typeof tabs)[number];
type ResolutionAction =
  | "Use LMS value"
  | "Keep Content Team value"
  | "Clear resolution and review again";

export function CourseDetail({
  course,
  topicSuggestions,
  tagSuggestions,
}: {
  course: Course;
  topicSuggestions: string[];
  tagSuggestions: string[];
}) {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [currentCourse, setCurrentCourse] = useState(course);
  const [editing, setEditing] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [message, setMessage] = useState("");
  const [retrievalState, setRetrievalState] = useState<
    "idle" | "running" | "success" | "error"
  >("idle");

  const [form, setForm] = useState({
    internalSummary: currentCourse.internalSummary,
    owner: currentCourse.owner ?? "",
    nextReviewDate: currentCourse.nextReviewDate ?? "",
  });

  const saveInternalMetadata = async (event: FormEvent) => {
    event.preventDefault();
    setSaveState("saving");
    setMessage("");
    try {
      const response = await fetch(`/api/courses/${currentCourse.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          internalSummary: form.internalSummary,
          owner: form.owner.trim() || null,
          nextReviewDate: form.nextReviewDate || null,
        }),
      });
      const result = (await response.json()) as {
        message?: string;
        course?: Partial<Course>;
      };
      if (!response.ok) throw new Error(result.message);
      setCurrentCourse((value) => ({
        ...value,
        internalSummary: form.internalSummary,
        owner: form.owner.trim() || null,
        nextReviewDate: form.nextReviewDate || null,
      }));
      setSaveState("saved");
      setMessage(
        result.message ??
          "Internal CourseTrack metadata saved. LMS data was not changed.",
      );
      setEditing(false);
    } catch (error) {
      setSaveState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Internal metadata could not be saved.",
      );
    }
  };

  const retrieveCourse = async (mode: "healthy" | "outage" = "healthy") => {
    setRetrievalState("running");
    setMessage("");
    try {
      const response = await fetch("/api/lms/retrieve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode,
          courseId: currentCourse.lmsCourseId ?? currentCourse.id,
        }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message);
      setRetrievalState("success");
      setMessage(result.message ?? "Read-only retrieval complete.");
    } catch (error) {
      setRetrievalState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "Retrieval failed. The prior snapshot was preserved.",
      );
    }
  };

  const resolveField = async (
    fieldKey: string,
    action: ResolutionAction,
  ) => {
    setSaveState("saving");
    setMessage("");
    try {
      const response = await fetch(
        `/api/courses/${currentCourse.id}/resolution`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ fieldKey, action }),
        },
      );
      const result = (await response.json()) as {
        message?: string;
        comparison?: FieldComparison;
      };
      if (!response.ok || !result.comparison) throw new Error(result.message);
      const resolvedComparison = result.comparison;
      setCurrentCourse((value) => {
        const fieldComparisons = value.fieldComparisons.map((comparison) =>
          comparison.fieldKey === fieldKey
            ? resolvedComparison
            : comparison,
        );
        return {
          ...value,
          fieldComparisons,
          conflictCount: fieldComparisons.filter(
            (comparison) =>
              comparison.comparisonStatus === "Conflict" &&
              !comparison.selectedSource,
          ).length,
          resolvedFields: {
            ...value.resolvedFields,
            [fieldKey]: resolvedComparison.resolvedValue,
          },
        };
      });
      setSaveState("saved");
      setMessage(
        result.message ??
          "CourseTrack field resolution updated. Source records were not changed.",
      );
    } catch (error) {
      setSaveState("error");
      setMessage(
        error instanceof Error
          ? error.message
          : "The field resolution could not be updated.",
      );
    }
  };

  return (
    <div className="page-stack">
      <Link href="/courses" className="back-link">
        <ArrowLeft size={16} />
        Back to Course Library
      </Link>

      <section className="course-heading">
        <div className="course-heading-main">
          <div className="course-monogram" aria-hidden="true">
            {currentCourse.primaryVertical
              .split(" ")
              .slice(0, 2)
              .map((part) => part[0])
              .join("")}
          </div>
          <div>
            <div className="course-heading-badges">
              <StatusBadge
                tone={
                  currentCourse.managementClassification === "Lexipol managed"
                    ? "success"
                    : currentCourse.managementClassification ===
                        "Non-Lexipol excluded"
                      ? "neutral"
                      : "warning"
                }
              >
                {currentCourse.managementClassification}
              </StatusBadge>
              <StatusBadge>{currentCourse.reconciliationStatus}</StatusBadge>
              <StatusBadge>{currentCourse.lifecycleStatus}</StatusBadge>
              <StatusBadge>{currentCourse.healthStatus}</StatusBadge>
            </div>
            <h1>{currentCourse.title}</h1>
            <p>
              {currentCourse.courseCode} · {currentCourse.primaryVertical} · v
              {currentCourse.currentVersion}
            </p>
          </div>
        </div>
        <div className="heading-actions">
          <button
            className={`button button-secondary ${favorite ? "button-favorite" : ""}`}
            onClick={() => setFavorite((value) => !value)}
          >
            <Star size={16} fill={favorite ? "currentColor" : "none"} />
            {favorite ? "Favorited" : "Favorite"}
          </button>
          <button
            className="button button-secondary"
            onClick={() => retrieveCourse()}
            disabled={retrievalState === "running"}
          >
            <RefreshCw
              size={16}
              className={retrievalState === "running" ? "spin" : ""}
            />
            {retrievalState === "running" ? "Retrieving…" : "Refresh LMS data"}
          </button>
          <button
            className="button button-primary"
            onClick={() => setEditing(true)}
          >
            <Pencil size={16} />
            Edit internal metadata
          </button>
        </div>
      </section>

      {message && (
        <div
          className={`inline-alert ${
            saveState === "error" || retrievalState === "error"
              ? "alert-danger"
              : "alert-success"
          }`}
          role="status"
        >
          {saveState === "error" || retrievalState === "error" ? (
            <AlertTriangle size={17} />
          ) : (
            <Check size={17} />
          )}
          <span>
            <strong>
              {retrievalState === "error"
                ? "Prior snapshot preserved"
                : saveState === "saved"
                  ? "CourseTrack value updated"
                  : "Read-only retrieval complete"}
            </strong>
            {message}
          </span>
        </div>
      )}

      <div className="provenance-banner">
        <ShieldCheck size={20} />
        <div>
          <strong>CourseTrack never writes to the LMS</strong>
          <span>
            LMS fields below are read-only and show their retrieval source.
            Internal fields are stored separately in CourseTrack.
          </span>
        </div>
        <span>Last retrieved {currentCourse.lastRetrievedAt ?? "Not available"}</span>
      </div>

      <div className="detail-tabs" role="tablist" aria-label="Course detail sections">
        {tabs.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            className={activeTab === tab ? "active" : ""}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
            {tab === "Flags" && currentCourse.flags.length > 0 && (
              <span>{currentCourse.flags.length}</span>
            )}
          </button>
        ))}
      </div>

      {editing && (
        <section className="edit-panel">
          <div className="panel-heading">
            <div>
              <h2>Edit internal CourseTrack metadata</h2>
              <p>These changes remain in CourseTrack and do not update the LMS.</p>
            </div>
            <button
              className="icon-button"
              onClick={() => setEditing(false)}
              aria-label="Close edit panel"
            >
              <X size={18} />
            </button>
          </div>
          <form onSubmit={saveInternalMetadata} className="edit-form">
            <label className="form-field form-field-wide">
              <span>Internal summary</span>
              <textarea
                value={form.internalSummary}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    internalSummary: event.target.value,
                  }))
                }
                minLength={10}
                maxLength={1200}
                required
              />
              <small>CourseTrack source · visible to authorized internal users</small>
            </label>
            <label className="form-field">
              <span>Course owner</span>
              <input
                value={form.owner}
                onChange={(event) =>
                  setForm((value) => ({ ...value, owner: event.target.value }))
                }
                placeholder="Assign an owner"
              />
            </label>
            <label className="form-field">
              <span>Next review date</span>
              <input
                type="date"
                value={form.nextReviewDate}
                onChange={(event) =>
                  setForm((value) => ({
                    ...value,
                    nextReviewDate: event.target.value,
                  }))
                }
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="button button-primary"
                disabled={saveState === "saving"}
              >
                <Save size={16} />
                {saveState === "saving" ? "Saving…" : "Save internal metadata"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="course-detail-grid">
        <div className="detail-main">
          {activeTab === "Overview" && (
            <OverviewTab course={currentCourse} />
          )}
          {activeTab === "Source Comparison" && (
            <SourceComparisonTab
              course={currentCourse}
              resolving={saveState === "saving"}
              onResolve={resolveField}
            />
          )}
          {activeTab === "Versions" && <VersionsTab course={currentCourse} />}
          {activeTab === "Accreditation" && (
            <AccreditationTab course={currentCourse} />
          )}
          {activeTab === "Topics & Tags" && (
            <TopicsTab
              course={currentCourse}
              onCourseChange={setCurrentCourse}
              topicSuggestions={topicSuggestions}
              tagSuggestions={tagSuggestions}
            />
          )}
          {activeTab === "Notes" && <NotesTab course={currentCourse} />}
          {activeTab === "Flags" && <FlagsTab course={currentCourse} />}
          {activeTab === "Revamp Planning" && (
            <RevampTab course={currentCourse} />
          )}
          {activeTab === "LMS Data" && (
            <LmsTab
              course={currentCourse}
              onSimulateOutage={() => retrieveCourse("outage")}
            />
          )}
          {activeTab === "Activity" && <ActivityTab course={currentCourse} />}
        </div>

        <aside className="detail-sidebar">
          <article className="panel compact-panel">
            <h3>Portfolio health</h3>
            <div className="health-score-row">
              <div className={`health-score health-${currentCourse.healthStatus.toLowerCase().replaceAll(" ", "-")}`}>
                {currentCourse.healthScore}
              </div>
              <div>
                <StatusBadge>{currentCourse.healthStatus}</StatusBadge>
                <span>Calculated from review age, flags, metadata, and LMS freshness.</span>
              </div>
            </div>
            <div className="progress-label">
              <span>Metadata completeness</span>
              <strong>{currentCourse.metadataCompletenessScore}%</strong>
            </div>
            <div className="progress-track">
              <span style={{ width: `${currentCourse.metadataCompletenessScore}%` }} />
            </div>
          </article>

          <article className="panel compact-panel">
            <h3>Ownership & review</h3>
            <DetailRow icon={UserRound} label="Course owner" value={currentCourse.owner ?? "Unassigned"} />
            <DetailRow icon={BookOpen} label="Instructional designer" value={currentCourse.instructionalDesigner ?? "Unassigned"} />
            <DetailRow icon={Calendar} label="Next review" value={currentCourse.nextReviewDate ?? "Not scheduled"} />
          </article>

          <article className="panel compact-panel">
            <h3>Source & retrieval</h3>
            <DetailRow icon={ShieldCheck} label="Data source" value="Sample / Mock LMS" />
            <DetailRow icon={RefreshCw} label="Retrieval status" value={currentCourse.retrievalStatus} />
            <DetailRow icon={Clock} label="Last retrieved" value={currentCourse.lastRetrievedAt ?? "Not retrieved"} />
          </article>
        </aside>
      </section>
    </div>
  );
}

function OverviewTab({ course }: { course: Course }) {
  return (
    <div className="detail-section-stack">
      <article className="panel">
        <div className="panel-heading">
          <div>
            <h2>Course overview</h2>
            <p>Current normalized metadata and field provenance</p>
          </div>
          <StatusBadge tone="sample">Sample record</StatusBadge>
        </div>
        <p className="course-description">{course.description}</p>
        <div className="field-grid">
          <ProvenanceField label="LMS course ID" value={course.lmsCourseId ?? "Not mapped"} source="LMS" locked />
          <ProvenanceField label="Management classification" value={course.managementClassification} source="CourseTrack" />
          <ProvenanceField label="Reconciliation" value={course.reconciliationStatus} source="Calculated" />
          <ProvenanceField label="Duration" value={`${course.durationMinutes} minutes`} source="Resolved value" />
          <ProvenanceField label="Authoring tool" value={course.contentMetadata?.authoringTool ?? course.authoringTool} source="Content Metadata" />
          <ProvenanceField label="Primary vertical" value={course.primaryVertical} source="CourseTrack" />
          <ProvenanceField label="Lifecycle status" value={course.lifecycleStatus} source="CourseTrack" />
          <ProvenanceField label="Course owner" value={course.owner ?? "Unassigned"} source="CourseTrack" />
          <ProvenanceField label="Next review date" value={course.nextReviewDate ?? "Not set"} source="CourseTrack" />
        </div>
      </article>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <h2>Internal summary</h2>
            <p>CourseTrack-owned planning context</p>
          </div>
          <StatusBadge tone="info">CourseTrack</StatusBadge>
        </div>
        <p className="internal-summary">{course.internalSummary}</p>
      </article>
    </div>
  );
}

function formatSourceValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not supplied";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") {
    const credit = value as {
      rawDisplay?: string | null;
      amount?: number | null;
      unit?: string | null;
    };
    if (credit.rawDisplay) return credit.rawDisplay;
    return JSON.stringify(value);
  }
  return String(value);
}

function SourceComparisonTab({
  course,
  resolving,
  onResolve,
}: {
  course: Course;
  resolving: boolean;
  onResolve: (fieldKey: string, action: ResolutionAction) => void;
}) {
  const sourceHistory = [...course.retrievalHistory, ...course.importHistory]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  return (
    <div className="detail-section-stack">
      <article className="panel">
        <div className="panel-heading">
          <div>
            <h2>Source comparison</h2>
            <p>Overlapping source values remain separate until CourseTrack resolves them.</p>
          </div>
          <StatusBadge
            tone={course.conflictCount > 0 ? "danger" : "success"}
          >
            {course.conflictCount} unresolved conflict{course.conflictCount === 1 ? "" : "s"}
          </StatusBadge>
        </div>
        <div className="readonly-callout">
          <LockKeyhole size={18} />
          <span>
            <strong>LMS snapshot is read-only</strong>
            Choosing an active CourseTrack value never changes an LMS snapshot or writes back to the LMS.
          </span>
        </div>
        <div className="table-scroll">
          <table className="data-table comparison-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>LMS value</th>
                <th>Content Team value</th>
                <th>Active CourseTrack value</th>
                <th>Status</th>
                <th>Resolution</th>
              </tr>
            </thead>
            <tbody>
              {course.fieldComparisons.map((comparison) => (
                <tr key={comparison.fieldKey}>
                  <td>
                    <strong>{comparison.fieldLabel}</strong>
                    <small>Compared {comparison.lastComparedAt.slice(0, 10)}</small>
                  </td>
                  <td>
                    <span>{formatSourceValue(comparison.lmsNormalizedValue)}</span>
                    <small><LockKeyhole size={11} /> Read-only LMS</small>
                  </td>
                  <td>
                    <span>{formatSourceValue(comparison.contentMetadataNormalizedValue)}</span>
                    <small>Content Metadata import</small>
                  </td>
                  <td>
                    <strong>{formatSourceValue(comparison.resolvedValue)}</strong>
                    <small>
                      {comparison.selectedSource
                        ? `Selected: ${comparison.selectedSource === "lms" ? "LMS" : "Content Team"}`
                        : "Awaiting decision"}
                    </small>
                  </td>
                  <td><StatusBadge>{comparison.comparisonStatus}</StatusBadge></td>
                  <td>
                    <div className="comparison-actions">
                      <button
                        disabled={resolving}
                        onClick={() => onResolve(comparison.fieldKey, "Use LMS value")}
                      >
                        Use LMS
                      </button>
                      <button
                        disabled={resolving}
                        onClick={() => onResolve(comparison.fieldKey, "Keep Content Team value")}
                      >
                        Keep Content Team
                      </button>
                      <button
                        disabled={resolving || !comparison.selectedSource}
                        onClick={() => onResolve(comparison.fieldKey, "Clear resolution and review again")}
                      >
                        Clear
                      </button>
                    </div>
                    {comparison.resolvedBy && (
                      <small>{comparison.resolvedBy} · {comparison.resolvedAt?.slice(0, 10)}</small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <h2>Source records and mappings</h2>
            <p>Provenance, freshness, classification, and relationship context</p>
          </div>
          <GitCompareArrows size={20} className="panel-icon" />
        </div>
        <div className="field-grid source-record-grid">
          <ProvenanceField label="Management classification" value={course.managementClassification} source="CourseTrack" />
          <ProvenanceField label="Monitoring" value={course.monitoringEnabled ? "Enabled" : "Excluded from normal metrics"} source="CourseTrack" />
          <ProvenanceField label="LMS snapshot" value={course.lmsSnapshot ? course.lmsSnapshot.retrievedAt : "Missing from LMS"} source="LMS" locked />
          <ProvenanceField label="Content Metadata" value={course.contentMetadata ? course.contentMetadata.importedAt : "Missing metadata"} source="Import" />
          <ProvenanceField label="Backend link" value={course.contentMetadata?.backendLink ? "Restricted internal administrative link" : "Not supplied"} source="Content Metadata" />
          <ProvenanceField label="Frontend link" value={course.contentMetadata?.frontendLink ?? "Not supplied"} source="Content Metadata" />
          <ProvenanceField label="Topic assignments" value={`${course.topicAssignments.length} assignments from ${new Set(course.topicAssignments.map((item) => item.source)).size} sources`} source="Multiple" />
          <ProvenanceField label="Vertical assignments" value={`${course.verticalAssignments.length} sourced assignments`} source="Multiple" />
          <ProvenanceField label="Relationships" value={`${course.relationships.length} parent/child records`} source="Content Metadata" />
          <ProvenanceField label="Accreditation comparison" value={`${course.lmsSnapshot?.normalized.accreditations.length ?? 0} LMS records · ${course.accreditations.length} active records`} source="LMS / CourseTrack" />
        </div>
        {(course.mappingWarnings.length > 0 || course.importValidationErrors.length > 0) && (
          <div className="source-warning-list">
            {[...course.mappingWarnings, ...course.importValidationErrors].map((warning) => (
              <div key={warning}>
                <AlertTriangle size={15} />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        )}
        <div className="source-assignment-grid">
          <div>
            <h3>Topics by source</h3>
            {course.topicAssignments.map((assignment) => (
              <span key={assignment.id}>
                <strong>{assignment.topic}</strong>
                <small>{assignment.source}</small>
              </span>
            ))}
          </div>
          <div>
            <h3>Verticals by source</h3>
            {course.verticalAssignments.map((assignment, index) => (
              <span key={`${assignment.source}-${assignment.vertical}-${index}`}>
                <strong>{assignment.vertical}{assignment.isPrimary ? " · Primary" : ""}</strong>
                <small>{assignment.source} · {assignment.sourceValue}</small>
              </span>
            ))}
          </div>
          <div>
            <h3>Parent / child relationships</h3>
            {course.relationships.length > 0 ? course.relationships.map((relationship) => (
              <span key={relationship.id}>
                <strong>{relationship.relationship}: {relationship.relatedCourseTitle ?? relationship.relatedCourseId}</strong>
                <small>{relationship.validationStatus}</small>
              </span>
            )) : <p>No relationships supplied.</p>}
          </div>
        </div>
      </article>

      <article className="panel">
        <div className="panel-heading">
          <div>
            <h2>Import, retrieval, and audit history</h2>
            <p>Immutable source events and user decisions</p>
          </div>
          <Database size={20} className="panel-icon" />
        </div>
        <div className="timeline-list">
          {sourceHistory.map((history) => (
            <div key={history.id}>
              <span className="timeline-marker"><History size={14} /></span>
              <div>
                <strong>{history.source} · {history.status}</strong>
                <p>{history.summary}</p>
                <small>{history.runId} · {history.occurredAt}</small>
              </div>
            </div>
          ))}
          {course.auditHistory.map((audit) => (
            <div key={audit.id}>
              <span className="timeline-marker"><ShieldCheck size={14} /></span>
              <div>
                <strong>{audit.action}</strong>
                <p>{audit.reason ?? "No reason supplied."}</p>
                <small>{audit.actor} · {audit.occurredAt}</small>
              </div>
            </div>
          ))}
        </div>
      </article>
    </div>
  );
}

function VersionsTab({ course }: { course: Course }) {
  return (
    <div className="detail-section-stack">
      <section className="version-governance-banner">
        <ShieldCheck size={22} />
        <div>
          <strong>Version history is owned by CourseTrack</strong>
          <span>
            The LMS does not communicate its internal versioning to CourseTrack.
            These version numbers, current-version decisions, notes, and Wrike
            references are created and maintained in this app.
          </span>
        </div>
      </section>
      <article className="panel">
        <div className="panel-heading">
          <div>
            <h2>Version history</h2>
            <p>Historical records are retained; only one CourseTrack version is current.</p>
          </div>
          <span className="panel-stat">{course.versions.length} versions</span>
        </div>
        <div className="table-scroll">
          <table className="data-table version-detail-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Type</th>
                <th>Published</th>
                <th>Wrike work reference</th>
                <th>Release notes</th>
                <th>Maintained by</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {[...course.versions].reverse().map((version) => (
                <tr key={version.id}>
                  <td className="mono-cell">v{version.versionNumber}</td>
                  <td>{version.versionType}</td>
                  <td>{version.publicationDate}</td>
                  <td className="version-wrike-cell">
                    {version.wrikeTaskReferences.length === 0 ? (
                      <span className="wrike-empty">No task linked</span>
                    ) : (
                      version.wrikeTaskReferences.map((reference) => (
                        <span className="wrike-reference" key={reference.id}>
                          <Link2 size={13} />
                          <strong>{reference.taskTitle}</strong>
                          <small>{reference.projectTitle ?? "No project supplied"} · {reference.wrikeTaskId}</small>
                          {reference.isSample && <StatusBadge tone="sample">Mock Wrike</StatusBadge>}
                        </span>
                      ))
                    )}
                  </td>
                  <td>{version.releaseNotes}</td>
                  <td><StatusBadge tone="success">{version.managedBy}</StatusBadge></td>
                  <td>{version.isCurrent ? <StatusBadge tone="success">Current</StatusBadge> : <StatusBadge>{version.versionStatus}</StatusBadge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="readonly-callout">
          <ShieldCheck size={18} />
          <span><strong>Wrike remains read-only</strong>Task details are presented as work context for a version. Linking or unlinking a reference changes CourseTrack only.</span>
        </div>
      </article>
    </div>
  );
}

function AccreditationTab({ course }: { course: Course }) {
  if (course.accreditations.length === 0) {
    return (
      <div className="empty-state panel">
        <Award size={28} />
        <h2>No accreditation required</h2>
        <p>This sample course has no current accreditation records.</p>
      </div>
    );
  }
  const groups = groupAccreditationRecords(course.accreditations);
  return (
    <div className="detail-section-stack">
      {groups.map((group) => (
        <article className="panel accreditation-card" key={group.key}>
          <div className="panel-heading">
            <div>
              <h2>{group.organization}</h2>
              <p>{group.jurisdiction}</p>
            </div>
            {group.current && (
              <StatusBadge label={accreditationDisplayLabel(group.current, true)} />
            )}
          </div>
          {group.current && <AccreditationRecordFields record={group.current} />}
          {group.expired.length > 0 && (
            <div className="accreditation-history">
              <h3>Expired history</h3>
              {group.expired.map((record) => (
                <div className="accreditation-history-entry" key={record.id}>
                  <div className="panel-heading">
                    <p>{record.creditHours} credit hours</p>
                    <StatusBadge label="Expired" />
                  </div>
                  <AccreditationRecordFields record={record} />
                </div>
              ))}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function AccreditationRecordFields({ record }: { record: AccreditationRecord }) {
  return (
    <>
      <div className="field-grid">
        <ProvenanceField label="Approval number" value={record.approvalNumber ?? "Missing"} source={record.source === "lms" ? "LMS" : "CourseTrack"} locked={record.source === "lms"} />
        <ProvenanceField label="Effective date" value={record.effectiveDate ?? "Not set"} source="CourseTrack" />
        <ProvenanceField label="Expiration date" value={record.expirationDate ?? "Not set"} source="CourseTrack" />
        <ProvenanceField label="Credit hours" value={String(record.creditHours)} source="CourseTrack" />
      </div>
      {record.riskReasons.length > 0 && (
        <div className="risk-reasons">
          <AlertTriangle size={17} />
          <span>
            <strong>Risk factors</strong>
            {record.riskReasons.join(" · ")}
          </span>
        </div>
      )}
    </>
  );
}

function TopicsTab({
  course,
  onCourseChange,
  topicSuggestions,
  tagSuggestions,
}: {
  course: Course;
  onCourseChange: Dispatch<SetStateAction<Course>>;
  topicSuggestions: string[];
  tagSuggestions: string[];
}) {
  return (
    <article className="panel">
      <div className="panel-heading">
        <div>
          <h2>Topics and tags</h2>
          <p>Structured taxonomy plus flexible internal classification</p>
        </div>
        <Tags size={20} className="panel-icon" />
      </div>
      <div className="taxonomy-block">
        <span>Primary topic</span>
        <strong>{course.primaryTopic}</strong>
        <small>{course.primaryVertical} / {course.primaryTopic}</small>
      </div>
      <TaxonomyEditor
        courseId={course.id}
        kind="topic"
        title="Topics"
        assignments={course.topicAssignments}
        onCourseChange={onCourseChange}
        suggestions={topicSuggestions}
      />
      <TaxonomyEditor
        courseId={course.id}
        kind="tag"
        title="Tags"
        suggestions={tagSuggestions}
        assignments={course.tagAssignments}
        onCourseChange={onCourseChange}
      />
      <p className="taxonomy-note">
        LMS- and import-sourced topics are read-only here. Manually added topics and tags are
        CourseTrack-owned since the LMS does not report them.
      </p>
    </article>
  );
}

type TaxonomyAssignment = CourseTopicAssignment | CourseTagAssignment;

function taxonomyLabel(kind: "topic" | "tag", assignment: TaxonomyAssignment): string {
  return kind === "topic" ? (assignment as CourseTopicAssignment).topic : (assignment as CourseTagAssignment).tag;
}

function TaxonomyEditor({
  courseId,
  kind,
  title,
  assignments,
  onCourseChange,
  suggestions,
}: {
  courseId: string;
  kind: "topic" | "tag";
  title: string;
  assignments: TaxonomyAssignment[];
  onCourseChange: Dispatch<SetStateAction<Course>>;
  suggestions: string[];
}) {
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const endpoint = kind === "topic" ? "topics" : "tags";
  const datalistId = `${courseId}-${kind}-suggestions`;
  const assignedLabels = new Set(assignments.map((assignment) => taxonomyLabel(kind, assignment)));
  const unassignedSuggestions = suggestions.filter((label) => !assignedLabels.has(label));
  const listKey: "topicAssignments" | "tagAssignments" =
    kind === "topic" ? "topicAssignments" : "tagAssignments";

  const handleAdd = async (event: FormEvent) => {
    event.preventDefault();
    const label = input.trim();
    if (!label) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/courses/${courseId}/${endpoint}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const result = (await response.json()) as { saved?: boolean; message?: string };
      if (!response.ok || !result.saved) {
        throw new Error(result.message ?? `Could not add this ${kind}.`);
      }
      const newAssignment: TaxonomyAssignment =
        kind === "topic"
          ? {
              id: `pending-${label}-${Date.now()}`,
              topic: label,
              originalTopicLabel: label,
              source: "Manual",
              importRunId: null,
              assignedAt: new Date().toISOString(),
            }
          : {
              id: `pending-${label}-${Date.now()}`,
              tag: label,
              source: "Manual",
              assignedAt: new Date().toISOString(),
            };
      onCourseChange((prev) => ({
        ...prev,
        [listKey]: [...(prev[listKey] as TaxonomyAssignment[]), newAssignment],
      }));
      setInput("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : `Could not add this ${kind}.`);
    } finally {
      setPending(false);
    }
  };

  const handleRemove = async (assignmentId: string) => {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/courses/${courseId}/${endpoint}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          kind === "topic" ? { courseTopicId: assignmentId } : { courseTagId: assignmentId },
        ),
      });
      const result = (await response.json()) as { removed?: boolean; message?: string };
      if (!response.ok || !result.removed) {
        throw new Error(result.message ?? `Could not remove this ${kind}.`);
      }
      onCourseChange((prev) => ({
        ...prev,
        [listKey]: (prev[listKey] as TaxonomyAssignment[]).filter((assignment) => assignment.id !== assignmentId),
      }));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : `Could not remove this ${kind}.`);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="taxonomy-editor">
      <h3>{title}</h3>
      <div className="tag-list">
        {assignments.map((assignment) => {
          const locked = assignment.source !== "Manual";
          const label = taxonomyLabel(kind, assignment);
          return (
            <span className={locked ? "tag-chip tag-chip-locked" : "tag-chip"} key={assignment.id}>
              {locked && <LockKeyhole size={11} />}
              {label}
              {!locked && (
                <button
                  type="button"
                  onClick={() => handleRemove(assignment.id)}
                  disabled={pending}
                  aria-label={`Remove ${label}`}
                >
                  <X size={11} />
                </button>
              )}
            </span>
          );
        })}
        {assignments.length === 0 && <span className="empty-hint">No {title.toLowerCase()} assigned yet.</span>}
      </div>
      <form className="taxonomy-add-form" onSubmit={handleAdd}>
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={`Add an existing or new ${kind}…`}
          list={datalistId}
          disabled={pending}
        />
        <datalist id={datalistId}>
          {unassignedSuggestions.map((label) => (
            <option value={label} key={label} />
          ))}
        </datalist>
        <button type="submit" className="button button-secondary" disabled={pending || !input.trim()}>
          Add
        </button>
      </form>
      {error && <p className="taxonomy-editor-error">{error}</p>}
    </div>
  );
}

function NotesTab({ course }: { course: Course }) {
  return (
    <article className="panel">
      <div className="panel-heading">
        <div>
          <h2>Internal notes</h2>
          <p>CourseTrack collaboration history—not written to the LMS</p>
        </div>
        <button className="button button-primary">
          <MessageSquareText size={16} /> Add note
        </button>
      </div>
      <div className="timeline-list">
        {course.notes.map((note) => (
          <div key={note.id}>
            <span className="timeline-marker"><MessageSquareText size={14} /></span>
            <div>
              <div className="timeline-heading">
                <strong>{note.type}</strong>
                <StatusBadge tone="neutral">{note.visibility}</StatusBadge>
              </div>
              <p>{note.body}</p>
              <small>{note.author} · {note.createdAt}</small>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function FlagsTab({ course }: { course: Course }) {
  if (course.flags.length === 0) {
    return (
      <div className="empty-state panel">
        <Flag size={28} />
        <h2>No unresolved flags</h2>
        <p>This course has no current follow-up items.</p>
      </div>
    );
  }
  return (
    <article className="panel">
      <div className="panel-heading">
        <div>
          <h2>Flags and follow-up</h2>
          <p>Operational issues requiring internal attention</p>
        </div>
        <button className="button button-primary"><Flag size={16} /> Create flag</button>
      </div>
      <div className="issue-list">
        {course.flags.map((flag) => (
          <div key={flag.id}>
            <span className={`priority-dot priority-${flag.priority.toLowerCase()}`} />
            <div>
              <strong>{flag.title}</strong>
              <small>{flag.type} · Due {flag.dueDate ?? "not set"}</small>
            </div>
            <span>{flag.owner ?? "Unassigned"}</span>
            <StatusBadge tone={flag.priority === "Critical" ? "danger" : flag.priority === "High" ? "warning" : "neutral"}>
              {flag.priority}
            </StatusBadge>
            <StatusBadge>{flag.status}</StatusBadge>
          </div>
        ))}
      </div>
    </article>
  );
}

function RevampTab({ course }: { course: Course }) {
  const proposal = course.revampProposal;
  if (!proposal) {
    return (
      <div className="empty-state panel">
        <Sparkles size={28} />
        <h2>No active revamp proposal</h2>
        <p>Proposals are maintained internally and never alter the current LMS course.</p>
        <button className="button button-primary">Propose revamp</button>
      </div>
    );
  }
  return (
    <article className="panel">
      <div className="panel-heading">
        <div>
          <h2>{proposal.title}</h2>
          <p>Internal portfolio planning proposal</p>
        </div>
        <StatusBadge>{proposal.status}</StatusBadge>
      </div>
      <p className="course-description">{proposal.businessJustification}</p>
      <div className="field-grid">
        <ProvenanceField label="Priority" value={proposal.priority} source="CourseTrack" />
        <ProvenanceField label="Prioritization score" value={`${proposal.score} / 100`} source="Calculated" />
        <ProvenanceField label="Target publication" value={proposal.targetPublicationDate ?? "Not scheduled"} source="CourseTrack" />
        <ProvenanceField label="Proposal status" value={proposal.status} source="CourseTrack" />
      </div>
    </article>
  );
}

function LmsTab({
  course,
  onSimulateOutage,
}: {
  course: Course;
  onSimulateOutage: () => void;
}) {
  const snapshot = course.lmsSnapshot;
  if (!snapshot) {
    return (
      <div className="empty-state panel">
        <Database size={28} />
        <h2>Content Metadata record is missing from the LMS</h2>
        <p>The imported Course ID is retained, but there is no LMS snapshot to display.</p>
      </div>
    );
  }
  const lms = snapshot.normalized;
  return (
    <div className="detail-section-stack">
      <article className="panel">
        <div className="panel-heading">
          <div>
            <h2>Current LMS snapshot</h2>
            <p>Raw source values are retained with these normalized, read-only fields.</p>
          </div>
          <StatusBadge>{course.retrievalStatus}</StatusBadge>
        </div>
        <div className="readonly-grid">
          {[
            ["External course ID", lms.courseId],
            ["Course type", lms.courseType ?? "Not supplied"],
            ["Course name", lms.courseName ?? "Not supplied"],
            ["Duration", lms.durationMinutes === null ? "Not supplied" : `${lms.durationMinutes} minutes`],
            ["Published", lms.isPublished === null ? "Not supplied" : lms.isPublished ? "Yes" : "No"],
            ["Published date", lms.publishedDate ?? "Not supplied"],
            ["LMS author", [lms.author.displayName, lms.author.email].filter(Boolean).join(" · ") || "Not supplied"],
            ["Owner", lms.owner ?? "Not supplied"],
            ["Sites", lms.sites.join(" · ") || "Not supplied"],
            ["Public topics", lms.publicTopics.join(" · ") || "Not supplied"],
            ["Private topics", lms.privateTopics.join(" · ") || "Not supplied"],
            ["Surveys", lms.surveys.join(" · ") || "Not supplied"],
            ["Last revision", lms.lastRevisionDate ?? "Not supplied"],
            ["Training credits", lms.trainingCredits.rawDisplay ?? "Not supplied"],
            ["Accreditation records", String(lms.accreditations.length)],
            ["Last retrieved", snapshot.retrievedAt],
          ].map(([label, value]) => (
            <div key={label}>
              <span><LockKeyhole size={13} /> {label}</span>
              <strong>{value}</strong>
              <small>Source: LMS · Read-only</small>
            </div>
          ))}
        </div>
      </article>
      <article className="panel outage-demo">
        <div>
          <AlertTriangle size={20} />
          <span>
            <strong>Retrieval safety demonstration</strong>
            Simulate a provider outage to verify that the prior successful snapshot remains available.
          </span>
        </div>
        <button className="button button-secondary" onClick={onSimulateOutage}>
          Simulate outage
        </button>
      </article>
    </div>
  );
}

function ActivityTab({ course }: { course: Course }) {
  const items = [
    ["LMS snapshot retrieved", course.lastRetrievedAt ?? "2026-07-30", "Mock LMS"],
    ["Internal metadata reviewed", "2026-07-22", "Dana Weiss"],
    ["Current version confirmed", course.versions.at(-1)?.publicationDate ?? "2026-07-01", "Jamie Patel"],
    ["Course record created", course.originalPublishDate ?? "2025-01-15", "Sample generator"],
  ];
  return (
    <article className="panel">
      <div className="panel-heading">
        <div>
          <h2>Activity history</h2>
          <p>Immutable history for significant record activity</p>
        </div>
        <History size={20} className="panel-icon" />
      </div>
      <div className="timeline-list">
        {items.map(([title, date, actor]) => (
          <div key={title}>
            <span className="timeline-marker"><History size={14} /></span>
            <div>
              <strong>{title}</strong>
              <p>{actor}</p>
              <small>{date}</small>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

function ProvenanceField({
  label,
  value,
  source,
  locked = false,
}: {
  label: string;
  value: string;
  source: string;
  locked?: boolean;
}) {
  return (
    <div className={locked ? "field-card field-locked" : "field-card"}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>
        {locked && <LockKeyhole size={12} />}
        Source: {source}
      </small>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Calendar;
  label: string;
  value: string;
}) {
  return (
    <div className="detail-row">
      <Icon size={16} />
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
      </span>
    </div>
  );
}
