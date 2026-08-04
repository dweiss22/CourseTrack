"use client";

import {
  AlertTriangle,
  Archive,
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
  ListTodo,
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
import { useRouter } from "next/navigation";
import { type Dispatch, type FormEvent, type SetStateAction, useState } from "react";
import type {
  AccreditationRecord,
  Course,
  CourseTagAssignment,
  CourseTopicAssignment,
  CourseVersion,
  CourseFlag,
  CourseNote,
  CourseRelationship,
  FieldComparison,
  VersionWrikeTaskReference,
  AccreditationHistoryGroup,
  TaskCalloutActor,
} from "@/types/course";
import { provenanceLabels } from "@/types/course";
import type { CourseIndexEntry, WrikeTaskCandidate } from "@/db";
import { StatusBadge } from "../status-badge";
import { HealthAboutDialog } from "../health-about-dialog";
import { WrikeTaskLinkControl } from "../wrike-task-link-control";
import { accreditationDisplayLabel, accreditationRiskLabels, groupAccreditationRecords } from "@/lib/accreditation-grouping";
import { statusesForKind, TASK_CALLOUT_KINDS, TASK_CALLOUT_PRIORITIES, taskCalloutDueState, taskCalloutStatusAction } from "@/lib/task-callouts";

const tabs = [
  "Overview",
  "Source Comparison",
  "Versions",
  "Accreditation",
  "Topics & Tags",
  "Notes",
  "Tasks & Callouts",
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
  initialFavorite,
  canEditCourse,
  lmsConnected,
  courseOptions,
  assignees,
}: {
  course: Course;
  topicSuggestions: string[];
  tagSuggestions: string[];
  initialFavorite: boolean;
  canEditCourse: boolean;
  lmsConnected: boolean;
  courseOptions: CourseIndexEntry[];
  assignees: TaskCalloutActor[];
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [currentCourse, setCurrentCourse] = useState(course);
  const [editing, setEditing] = useState(false);
  const [favorite, setFavorite] = useState(initialFavorite);
  const [favoritePending, setFavoritePending] = useState(false);
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

  const toggleFavorite = async () => {
    const nextFavorite = !favorite;
    setFavoritePending(true);
    setSaveState("saving");
    setMessage("");
    try {
      const response = await fetch(`/api/courses/${currentCourse.id}/favorite`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ favorite: nextFavorite }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message);
      setFavorite(nextFavorite);
      setSaveState("saved");
      setMessage(nextFavorite ? "Course added to your favorites." : "Course removed from your favorites.");
    } catch (error) {
      setSaveState("error");
      setMessage(error instanceof Error ? error.message : "Favorite could not be updated.");
    } finally {
      setFavoritePending(false);
    }
  };

  const archiveCourse = async () => {
    if (!window.confirm(`Archive ${currentCourse.title}?`)) return;
    setSaveState("saving"); setMessage("");
    try { const response = await fetch(`/api/courses/${currentCourse.id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: currentCourse.updatedAt }) }); const result = (await response.json()) as { message?: string }; if (!response.ok) throw new Error(result.message); router.push("/courses"); router.refresh(); } catch (error) { setSaveState("error"); setMessage(error instanceof Error ? error.message : "Course could not be archived."); }
  };

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
          expectedUpdatedAt: currentCourse.updatedAt,
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
        updatedAt: result.course?.updatedAt ?? value.updatedAt,
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

  const retrieveCourse = async () => {
    setRetrievalState("running");
    setMessage("");
    try {
      const response = await fetch("/api/lms/retrieve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
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
          body: JSON.stringify({ fieldKey, action, expectedUpdatedAt: currentCourse.fieldComparisons.find((comparison) => comparison.fieldKey === fieldKey)?.updatedAt }),
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
          <div className="course-identity">
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
            <div className="course-action-row" aria-label="Course actions">
              <button
                className={`icon-action ${favorite ? "is-active" : ""}`}
                onClick={toggleFavorite}
                disabled={favoritePending}
                aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
                data-tooltip={favorite ? "Remove from favorites" : "Add to favorites"}
              >
                <Star size={18} fill={favorite ? "currentColor" : "none"} />
              </button>
              <button
                className="icon-action"
                onClick={() => retrieveCourse()}
                disabled={!lmsConnected || retrievalState === "running"}
                aria-label={lmsConnected ? "Refresh LMS data" : "LMS refresh unavailable until a connector is configured"}
                data-tooltip={lmsConnected ? "Refresh LMS data" : "LMS refresh unavailable until a connector is configured"}
              >
                <RefreshCw size={18} className={retrievalState === "running" ? "spin" : ""} />
              </button>
              {canEditCourse && (
                <><button className="icon-action" onClick={() => setEditing(true)} aria-label="Edit CourseTrack fields" data-tooltip="Edit CourseTrack fields"><Pencil size={18} /></button><button className="icon-action" onClick={archiveCourse} aria-label="Archive course" data-tooltip="Archive course"><Archive size={18} /></button></>
              )}
            </div>
          </div>
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
                  : "Course action complete"}
            </strong>
            {message}
          </span>
        </div>
      )}

      <div className="provenance-banner">
        <ShieldCheck size={20} />
        <div>
          <strong>Immutable sources, editable projection</strong>
          <span>
            Uploaded values can be edited in CourseTrack while the original
            upload remains unchanged. Connected via LMS API fields are read-only.
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
            {tab === "Tasks & Callouts" && currentCourse.flags.filter((flag) => !flag.archivedAt).length > 0 && (
              <span>{currentCourse.flags.filter((flag) => !flag.archivedAt).length}</span>
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
              onCourseChange={setCurrentCourse}
              courseOptions={courseOptions}
              canEdit={canEditCourse}
            />
          )}
          {activeTab === "Versions" && (
            <VersionsTab course={currentCourse} onCourseChange={setCurrentCourse} canManageWrike={canEditCourse} />
          )}
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
          {activeTab === "Notes" && <NotesTab course={currentCourse} onCourseChange={setCurrentCourse} />}
          {activeTab === "Tasks & Callouts" && <FlagsTab course={currentCourse} onCourseChange={setCurrentCourse} assignees={assignees} />}
          {activeTab === "Revamp Planning" && (
            <RevampTab course={currentCourse} />
          )}
          {activeTab === "LMS Data" && (
            <LmsTab course={currentCourse} />
          )}
          {activeTab === "Activity" && <ActivityTab course={currentCourse} />}
        </div>

        <aside className="detail-sidebar">
          <article className="panel compact-panel">
            <div className="panel-heading"><h3>CourseTrack health</h3><HealthAboutDialog compact /></div>
            <div className="health-score-row">
              <div className={`health-score health-${currentCourse.healthStatus.toLowerCase().replaceAll(" ", "-")}`}>
                {currentCourse.healthScore}
              </div>
              <div>
                <StatusBadge>{currentCourse.healthStatus}</StatusBadge>
                <span>Calculated from metadata completeness, unresolved discrepancies, import validation errors, and current LMS snapshot availability.</span>
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
            <DetailRow icon={ShieldCheck} label="Data source" value={provenanceLabels[currentCourse.dataSource]} />
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
          <StatusBadge>{provenanceLabels[course.dataSource]}</StatusBadge>
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

function ComparisonState({ comparison }: { comparison: FieldComparison }) {
  const state = comparison.selectedSource && comparison.comparisonStatus === "Conflict"
    ? { label: "Resolved discrepancy", icon: Check, tone: "success" as const }
    : comparison.comparisonStatus === "Match"
      ? { label: "Match", icon: Check, tone: "success" as const }
      : comparison.comparisonStatus === "LMS only"
        ? { label: "Missing from CourseTrack", icon: Database, tone: "warning" as const }
        : comparison.comparisonStatus === "Content Metadata only"
          ? { label: "Missing from LMS", icon: LockKeyhole, tone: "warning" as const }
          : comparison.comparisonStatus === "Invalid" || comparison.comparisonStatus === "Missing from both"
            ? { label: "Invalid", icon: X, tone: "danger" as const }
            : { label: "Discrepancy", icon: AlertTriangle, tone: "danger" as const };
  const Icon = state.icon;
  return <StatusBadge tone={state.tone}><Icon size={12} aria-hidden="true" /> {state.label}</StatusBadge>;
}

function SourceComparisonTab({
  course,
  resolving,
  onResolve,
  onCourseChange,
  courseOptions,
  canEdit,
}: {
  course: Course;
  resolving: boolean;
  onResolve: (fieldKey: string, action: ResolutionAction) => void;
  onCourseChange: Dispatch<SetStateAction<Course>>;
  courseOptions: CourseIndexEntry[];
  canEdit: boolean;
}) {
  const sourceHistory = [...course.retrievalHistory, ...course.importHistory]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const hasDiscrepancies = course.fieldComparisons.some((comparison) => comparison.comparisonStatus !== "Match");

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
        {!hasDiscrepancies ? (
          <div className="empty-state compact-empty"><Check size={24} /><h3>No source discrepancies</h3><p>All comparable LMS and CourseTrack values match.</p></div>
        ) : <div className="table-scroll">
          <table className="data-table comparison-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>LMS value</th>
                <th>CourseTrack value</th>
                <th>Comparison status</th>
                <th>Resolution / action</th>
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
                    <strong>{formatSourceValue(comparison.selectedSource ? comparison.resolvedValue : comparison.contentMetadataNormalizedValue)}</strong>
                    <small>
                      {comparison.selectedSource
                        ? `Active resolution selected from ${comparison.selectedSource === "lms" ? "LMS" : "uploaded CourseTrack value"}`
                        : "Uploaded application-managed value"}
                    </small>
                    <details className="comparison-raw-details"><summary>Raw values and audit details</summary><dl><div><dt>Immutable LMS raw value</dt><dd>{formatSourceValue(comparison.lmsRawValue)}</dd></div><div><dt>Immutable uploaded raw value</dt><dd>{formatSourceValue(comparison.contentMetadataRawValue)}</dd></div><div><dt>Last compared</dt><dd>{comparison.lastComparedAt}</dd></div>{comparison.resolvedBy && <div><dt>Resolved by</dt><dd>{comparison.resolvedBy} · {comparison.resolvedAt}</dd></div>}</dl></details>
                  </td>
                  <td><ComparisonState comparison={comparison} /></td>
                  <td>
                    {canEdit && (comparison.comparisonStatus !== "Match" || comparison.selectedSource) ? <div className="comparison-actions">
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
                        Keep CourseTrack
                      </button>
                      <button
                        disabled={resolving || !comparison.selectedSource}
                        onClick={() => onResolve(comparison.fieldKey, "Clear resolution and review again")}
                      >
                        Clear
                      </button>
                    </div> : <small>{canEdit ? "No action required" : "View only"}</small>}
                    {comparison.resolvedBy && (
                      <small>{comparison.resolvedBy} · {comparison.resolvedAt?.slice(0, 10)}</small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
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
          <ProvenanceField label="Monitoring" value={course.monitoringEnabled ? "Enabled" : "Excluded from portfolio metrics"} source="CourseTrack" />
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
            {canEdit && <RelationshipEditor course={course} courseOptions={courseOptions} onCourseChange={onCourseChange} />}
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

function RelationshipEditor({ course, courseOptions, onCourseChange }: { course: Course; courseOptions: CourseIndexEntry[]; onCourseChange: Dispatch<SetStateAction<Course>> }) {
  const [relationship, setRelationship] = useState<"parent" | "child">("parent");
  const [relatedCourseId, setRelatedCourseId] = useState(courseOptions[0]?.id ?? "");
  const [pending, setPending] = useState(false); const [error, setError] = useState("");
  const add = async (event: FormEvent) => { event.preventDefault(); setPending(true); setError(""); try { const response = await fetch(`/api/courses/${course.id}/relationships`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ relationship, relatedCourseId }) }); const result = (await response.json()) as { relationship?: CourseRelationship; message?: string }; if (!response.ok || !result.relationship) throw new Error(result.message); const option = courseOptions.find((item) => item.id === relatedCourseId); onCourseChange((value) => ({ ...value, relationships: [...value.relationships, { ...result.relationship!, relatedCourseTitle: option?.title ?? null }] })); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Relationship could not be assigned."); } finally { setPending(false); } };
  const remove = async (id: string) => { setPending(true); setError(""); try { const response = await fetch(`/api/relationships/${id}`, { method: "DELETE" }); const result = (await response.json()) as { message?: string }; if (!response.ok) throw new Error(result.message); onCourseChange((value) => ({ ...value, relationships: value.relationships.filter((item) => item.id !== id) })); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Relationship could not be removed."); } finally { setPending(false); } };
  return <div className="relationship-editor"><div className="tag-list">{course.relationships.filter((item) => item.source === "CourseTrack").map((item) => <span className="tag-chip" key={item.id}>{item.relationship}: {item.relatedCourseTitle ?? item.relatedCourseId}<button aria-label={`Remove relationship to ${item.relatedCourseTitle ?? item.relatedCourseId}`} disabled={pending} onClick={() => remove(item.id)}><X size={11} /></button></span>)}</div><form className="taxonomy-add-form" onSubmit={add}><select value={relationship} onChange={(event) => setRelationship(event.target.value as "parent" | "child")}><option value="parent">Parent</option><option value="child">Child</option></select><select value={relatedCourseId} onChange={(event) => setRelatedCourseId(event.target.value)} required><option value="">Choose course</option>{courseOptions.map((option) => <option key={option.id} value={option.id}>{option.courseCode} — {option.title}</option>)}</select><button className="button button-secondary" disabled={pending || !relatedCourseId}>Add</button></form>{error && <p className="taxonomy-editor-error" role="alert">{error}</p>}</div>;
}

function VersionsTab({
  course,
  onCourseChange,
  canManageWrike,
}: {
  course: Course;
  onCourseChange: Dispatch<SetStateAction<Course>>;
  canManageWrike: boolean;
}) {
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
                <th>Wrike Task Link</th>
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
                    <VersionWrikeCell version={version} onCourseChange={onCourseChange} canManage={canManageWrike} />
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

function replaceVersionWrikeReferences(
  onCourseChange: Dispatch<SetStateAction<Course>>,
  versionId: string,
  wrikeTaskReferences: VersionWrikeTaskReference[],
) {
  onCourseChange((prev) => ({
    ...prev,
    versions: prev.versions.map((version) =>
      version.id === versionId ? { ...version, wrikeTaskReferences } : version,
    ),
  }));
}

function VersionWrikeCell({ version, onCourseChange, canManage }: { version: CourseVersion; onCourseChange: Dispatch<SetStateAction<Course>>; canManage: boolean }) {
  return <WrikeTaskLinkControl version={version} canManage={canManage} onReferencesChange={(references) => replaceVersionWrikeReferences(onCourseChange, version.id, references)} />;
}

function VersionWrikeCellLegacy({
  version,
  onCourseChange,
}: {
  version: CourseVersion;
  onCourseChange: Dispatch<SetStateAction<Course>>;
}) {
  const [linking, setLinking] = useState(false);
  const [permalink, setPermalink] = useState("");
  const [candidates, setCandidates] = useState<WrikeTaskCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const activeReference = version.wrikeTaskReferences[0] ?? null;

  const applyLinkResult = (
    link: { id: string; wrikeTaskId: string; taskTitle: string; permalink: string | null },
    linkMethod: VersionWrikeTaskReference["linkMethod"],
  ) => {
    const now = new Date().toISOString();
    replaceVersionWrikeReferences(onCourseChange, version.id, [
      {
        id: link.id,
        wrikeTaskId: link.wrikeTaskId,
        taskTitle: link.taskTitle,
        projectId: null,
        projectTitle: null,
        taskStatus: null,
        assigneeNames: [],
        dueDate: null,
        permalink: link.permalink,
        provider: "Live Wrike",
        retrievedAt: now,
        linkedAt: now,
        linkedBy: "You",
        linkMethod,
        lastVerifiedAt: null,
        updatedAt: now,
      },
    ]);
    setLinking(false);
    setPermalink("");
    setCandidates(null);
  };

  const handleLinkByPermalink = async (event: FormEvent) => {
    event.preventDefault();
    if (!permalink.trim()) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/course-versions/${version.id}/wrike/link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ permalink: permalink.trim() }),
      });
      const result = (await response.json()) as { link?: VersionWrikeCellLink; message?: string };
      if (!response.ok || !result.link) throw new Error(result.message ?? "Could not link this Wrike task.");
      applyLinkResult(result.link, "manual_permalink");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not link this Wrike task.");
    } finally {
      setPending(false);
    }
  };

  const handleFindCandidates = async () => {
    setSearching(true);
    setError("");
    try {
      const response = await fetch(`/api/course-versions/${version.id}/wrike/search`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const result = (await response.json()) as { items?: WrikeTaskCandidate[]; message?: string };
      if (!response.ok) throw new Error(result.message ?? "Could not search Wrike tasks.");
      setCandidates(result.items ?? []);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not search Wrike tasks.");
    } finally {
      setSearching(false);
    }
  };

  const handleSelectCandidate = async (candidateTaskId: string) => {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/course-versions/${version.id}/wrike/link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidateTaskId }),
      });
      const result = (await response.json()) as { link?: VersionWrikeCellLink; message?: string };
      if (!response.ok || !result.link) throw new Error(result.message ?? "Could not link this Wrike task.");
      applyLinkResult(result.link, "selected_candidate");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not link this Wrike task.");
    } finally {
      setPending(false);
    }
  };

  const handleVerify = async () => {
    if (!activeReference) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/course-versions/${version.id}/wrike/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ referenceId: activeReference.id }),
      });
      const result = (await response.json()) as {
        link?: VersionWrikeCellLink & { lastVerifiedAt: string };
        message?: string;
      };
      if (!response.ok || !result.link) throw new Error(result.message ?? "Could not verify this Wrike link.");
      replaceVersionWrikeReferences(onCourseChange, version.id, [
        { ...activeReference, taskTitle: result.link.taskTitle, permalink: result.link.permalink, lastVerifiedAt: result.link.lastVerifiedAt },
      ]);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not verify this Wrike link.");
    } finally {
      setPending(false);
    }
  };

  const handleUnlink = async () => {
    if (!activeReference) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/course-versions/${version.id}/wrike/link`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ referenceId: activeReference.id }),
      });
      const result = (await response.json()) as { unlinked?: boolean; message?: string };
      if (!response.ok || !result.unlinked) throw new Error(result.message ?? "Could not unlink this Wrike task.");
      replaceVersionWrikeReferences(onCourseChange, version.id, []);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not unlink this Wrike task.");
    } finally {
      setPending(false);
    }
  };

  if (activeReference && !linking) {
    return (
      <div className="wrike-reference">
        <Link2 size={13} />
        <strong>{activeReference.taskTitle}</strong>
        <small>
          {activeReference.wrikeTaskId}
          {activeReference.lastVerifiedAt && ` · Verified ${new Date(activeReference.lastVerifiedAt).toLocaleDateString()}`}
        </small>
        <div className="wrike-cell-actions">
          {activeReference.permalink && (
            <a href={activeReference.permalink} target="_blank" rel="noopener noreferrer">
              Open in Wrike
            </a>
          )}
          <button type="button" disabled={pending} onClick={handleVerify}>Verify link</button>
          <button type="button" disabled={pending} onClick={() => setLinking(true)}>Relink</button>
          <button type="button" disabled={pending} onClick={handleUnlink}>Unlink</button>
        </div>
        {error && <p className="taxonomy-editor-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="wrike-link-form">
      {!activeReference && !linking ? (
        <button type="button" className="button button-secondary" onClick={() => setLinking(true)}>
          Link Wrike task
        </button>
      ) : (
        <>
          <form className="taxonomy-add-form" onSubmit={handleLinkByPermalink}>
            <input
              type="url"
              placeholder="Paste a Wrike task URL…"
              value={permalink}
              onChange={(event) => setPermalink(event.target.value)}
              disabled={pending}
            />
            <button type="submit" className="button button-secondary" disabled={pending || !permalink.trim()}>
              Link
            </button>
          </form>
          <button type="button" disabled={searching || pending} onClick={handleFindCandidates}>
            {searching ? "Searching…" : "Find candidates"}
          </button>
          {candidates && (
            <ul className="wrike-candidate-list">
              {candidates.length === 0 && <li className="empty-hint">No matching tasks found in the synchronized index.</li>}
              {candidates.map((candidate) => (
                <li key={candidate.wrikeTaskId}>
                  <span>{candidate.title}</span>
                  <button type="button" disabled={pending} onClick={() => handleSelectCandidate(candidate.wrikeTaskId)}>
                    Select
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => setLinking(false)} disabled={pending}>
            Cancel
          </button>
          {error && <p className="taxonomy-editor-error">{error}</p>}
        </>
      )}
    </div>
  );
}

type VersionWrikeCellLink = { id: string; wrikeTaskId: string; taskTitle: string; permalink: string | null };

void VersionWrikeCellLegacy;

function AccreditationTab({ course }: { course: Course }) {
  if (course.accreditations.length === 0) {
    return (
      <div className="empty-state panel">
        <Award size={28} />
        <h2>No accreditation records</h2>
        <p>Add an internal accreditation record when this course requires approval tracking.</p>
      </div>
    );
  }
  const groups = groupAccreditationRecords(course.accreditations);
  return (
    <div className="detail-section-stack">
      {groups.map((group) => <AccreditationGroupCard group={group} key={group.key} />)}
    </div>
  );
}

function AccreditationGroupCard({ group }: { group: AccreditationHistoryGroup }) {
  const [expanded, setExpanded] = useState(false);
  const historyId = `accreditation-history-${group.key.replace(/[^a-z0-9]/gi, "-")}`;
  const older = group.history;
  return (
    <article className="panel accreditation-card">
      <div className="panel-heading">
        <div>
          <h2>{group.organization}</h2>
          <p>{group.jurisdiction}</p>
        </div>
        <div className="accreditation-summary-badges">
          <StatusBadge label={accreditationRiskLabels[group.riskState]} />
          {group.summary.historyRole === "future" && <StatusBadge tone="info">Future</StatusBadge>}
        </div>
      </div>
      <AccreditationRecordFields record={group.summary.record} />
      {group.summary.historyRole === "future" && group.current && (
        <div className="inline-alert alert-warning">
          <AlertTriangle size={16} />
          <span><strong>Not yet current</strong>The current risk remains {accreditationRiskLabels[group.current.riskState].toLowerCase()} until this record takes effect.</span>
        </div>
      )}
      {older.length > 0 && (
        <div className="accreditation-history">
          <button
            type="button"
            className="history-toggle"
            aria-expanded={expanded}
            aria-controls={historyId}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "Hide" : "Show"} {older.length} older {older.length === 1 ? "record" : "records"}
          </button>
          <div id={historyId} hidden={!expanded}>
            {older.map((item) => (
              <div className="accreditation-history-entry" key={item.record.id}>
                <div className="panel-heading">
                  <p>{item.record.creditHours} credit hours</p>
                  <StatusBadge label={item.historyRole === "duplicate" ? "Duplicate" : accreditationDisplayLabel(item.record, false)} />
                </div>
                <AccreditationRecordFields record={item.record} />
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function AccreditationRecordFields({ record }: { record: AccreditationRecord }) {
  return (
    <>
      <div className="field-grid">
        <ProvenanceField label="Approval number" value={record.approvalNumber ?? "Missing"} source={provenanceLabels[record.source]} locked={record.source === "lms_api"} />
        <ProvenanceField label="Effective date" value={record.effectiveDate ?? "Not set"} source={provenanceLabels[record.source]} locked={record.source === "lms_api"} />
        <ProvenanceField label="Expiration date" value={record.expirationDate ?? "Not set"} source={provenanceLabels[record.source]} locked={record.source === "lms_api"} />
        <ProvenanceField label="Credit hours" value={String(record.creditHours)} source={provenanceLabels[record.source]} locked={record.source === "lms_api"} />
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

function NotesTabLegacy({ course }: { course: Course }) {
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

function FlagsTabLegacy({ course }: { course: Course }) {
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
              <small>{flag.category} · Due {flag.dueDate ?? "not set"}</small>
            </div>
            <span>{flag.assignee?.displayName ?? "Unassigned"}</span>
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

void NotesTabLegacy;
void FlagsTabLegacy;

function NotesTab({ course, onCourseChange }: { course: Course; onCourseChange: Dispatch<SetStateAction<Course>> }) {
  const [editing, setEditing] = useState<CourseNote | "new" | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const current = editing === "new" ? null : editing;
    setPending(true); setError("");
    try {
      const response = await fetch(current ? `/api/notes/${current.id}` : `/api/courses/${course.id}/notes`, { method: current ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: String(form.get("type")), visibility: String(form.get("visibility")), body: String(form.get("body")), expectedUpdatedAt: current?.updatedAt }) });
      const result = (await response.json()) as { note?: CourseNote; message?: string }; if (!response.ok || !result.note) throw new Error(result.message);
      onCourseChange((value) => ({ ...value, notes: current ? value.notes.map((note) => note.id === current.id ? result.note! : note) : [result.note!, ...value.notes] })); setEditing(null);
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Note could not be saved."); } finally { setPending(false); }
  };
  const archive = async (note: CourseNote) => { if (!window.confirm("Archive this note?")) return; setPending(true); setError(""); try { const response = await fetch(`/api/notes/${note.id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: note.updatedAt }) }); const result = (await response.json()) as { message?: string }; if (!response.ok) throw new Error(result.message); onCourseChange((value) => ({ ...value, notes: value.notes.filter((item) => item.id !== note.id) })); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Note could not be archived."); } finally { setPending(false); } };
  return <article className="panel"><div className="panel-heading"><div><h2>Internal notes</h2><p>CourseTrack collaboration history—not written to source systems</p></div><button className="button button-primary" onClick={() => setEditing("new")}><MessageSquareText size={16} /> Add note</button></div>
    {editing && <form className="workflow-form" onSubmit={save}><div className="form-grid"><label>Type<input name="type" required defaultValue={editing === "new" ? "General" : editing.type} /></label><label>Visibility<select name="visibility" defaultValue={editing === "new" ? "Team" : editing.visibility}>{["Private", "Team", "Role restricted", "Organization"].map((value) => <option key={value}>{value}</option>)}</select></label><label className="form-span">Note<textarea name="body" required maxLength={5000} defaultValue={editing === "new" ? "" : editing.body} /></label></div><div className="button-row"><button type="button" className="button button-secondary" onClick={() => setEditing(null)}>Cancel</button><button className="button button-primary" disabled={pending}>{pending ? "Saving…" : "Save note"}</button></div></form>}
    {error && <p className="taxonomy-editor-error" role="alert">{error}</p>}
    {course.notes.length === 0 ? <div className="empty-state compact-empty"><MessageSquareText size={22} /><h3>No notes</h3><p>Add the first internal note.</p></div> : <div className="timeline-list">{course.notes.map((note) => <div key={note.id}><span className="timeline-marker"><MessageSquareText size={14} /></span><div><div className="timeline-heading"><strong>{note.type}</strong><StatusBadge tone="neutral">{note.visibility}</StatusBadge></div><p>{note.body}</p><small>{note.author} · {note.createdAt}</small><div className="table-actions"><button onClick={() => setEditing(note)}>Edit</button><button disabled={pending} onClick={() => archive(note)}>Archive</button></div></div></div>)}</div>}
  </article>;
}

function FlagsTab({ course, onCourseChange, assignees }: { course: Course; onCourseChange: Dispatch<SetStateAction<Course>>; assignees: TaskCalloutActor[] }) {
  const [editing, setEditing] = useState<CourseFlag | "new" | null>(null); const [editorKind, setEditorKind] = useState<CourseFlag["recordKind"]>("Task"); const [pending, setPending] = useState(false); const [error, setError] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const payload = (flag: CourseFlag, status = flag.status) => ({ recordKind: flag.recordKind, category: flag.category, title: flag.title, description: flag.description, priority: flag.priority, status, assigneeId: flag.assigneeId, dueDate: flag.dueDate, completionNotes: flag.completionNotes, expectedUpdatedAt: flag.updatedAt });
  const save = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const current = editing === "new" ? null : editing; setPending(true); setError(""); try { const response = await fetch(current ? `/api/flags/${current.id}` : `/api/courses/${course.id}/flags`, { method: current ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recordKind: String(form.get("recordKind")), category: String(form.get("category")), title: String(form.get("title")), description: String(form.get("description")), priority: String(form.get("priority")), status: String(form.get("status")), assigneeId: String(form.get("assigneeId")) || null, dueDate: String(form.get("dueDate")) || null, completionNotes: String(form.get("completionNotes")) || null, expectedUpdatedAt: current?.updatedAt }) }); const result = (await response.json()) as { flag?: CourseFlag; message?: string }; if (!response.ok || !result.flag) throw new Error(result.message); onCourseChange((value) => ({ ...value, flags: current ? value.flags.map((flag) => flag.id === current.id ? result.flag! : flag) : [result.flag!, ...value.flags] })); setEditing(null); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Task or callout could not be saved."); } finally { setPending(false); } };
  const archive = async (flag: CourseFlag) => { setPending(true); setError(""); try { const response = await fetch(`/api/flags/${flag.id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: flag.updatedAt }) }); const result = (await response.json()) as { message?: string }; if (!response.ok) throw new Error(result.message); onCourseChange((value) => ({ ...value, flags: value.flags.map((item) => item.id === flag.id ? { ...item, archivedAt: new Date().toISOString() } : item) })); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Task or callout could not be archived."); } finally { setPending(false); } };
  const changeStatus = async (flag: CourseFlag) => { const action = taskCalloutStatusAction(flag); setPending(true); setError(""); try { const response = await fetch(`/api/flags/${flag.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload(flag, action.status)) }); const result = (await response.json()) as { flag?: CourseFlag; message?: string }; if (!response.ok || !result.flag) throw new Error(result.message); onCourseChange((value) => ({ ...value, flags: value.flags.map((item) => item.id === flag.id ? result.flag! : item) })); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Status could not be changed."); } finally { setPending(false); } };
  const restore = async (flag: CourseFlag) => { setPending(true); setError(""); try { const response = await fetch(`/api/flags/${flag.id}/restore`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: flag.updatedAt }) }); const result = (await response.json()) as { message?: string }; if (!response.ok) throw new Error(result.message); window.location.reload(); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Task or callout could not be restored."); } finally { setPending(false); } };
  const visible = course.flags.filter((flag) => Boolean(flag.archivedAt) === showArchived);
  return <article className="panel"><div className="panel-heading"><div><h2>Tasks & Callouts</h2><p>Assigned work and contextual follow-up records</p></div><div className="button-row"><button className="button button-secondary" onClick={() => setShowArchived((value) => !value)}>{showArchived ? "View active" : "View archived"}</button><button className="button button-primary" onClick={() => { setEditorKind("Task"); setEditing("new"); }}><ListTodo size={16} /> Create</button></div></div>
    {editing && <form className="workflow-form" onSubmit={save}><div className="form-grid"><label>Kind<select name="recordKind" value={editorKind} onChange={(event) => setEditorKind(event.target.value as CourseFlag["recordKind"])}>{TASK_CALLOUT_KINDS.map((value) => <option key={value}>{value}</option>)}</select></label><label>Category<input name="category" required defaultValue={editing === "new" ? "Content" : editing.category} /></label><label>Title<input name="title" minLength={3} required defaultValue={editing === "new" ? "" : editing.title} /></label><label>Priority<select name="priority" defaultValue={editing === "new" ? "Medium" : editing.priority}>{TASK_CALLOUT_PRIORITIES.map((value) => <option key={value}>{value}</option>)}</select></label><label>Status<select key={editorKind} name="status" defaultValue={editing !== "new" && statusesForKind(editorKind).includes(editing.status) ? editing.status : "Open"}>{statusesForKind(editorKind).map((value) => <option key={value}>{value}</option>)}</select></label><label>Assignee<select name="assigneeId" defaultValue={editing === "new" ? "" : editing.assigneeId ?? ""}><option value="">Unassigned</option>{assignees.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select></label><label>Due date<input name="dueDate" type="date" defaultValue={editing === "new" ? "" : editing.dueDate ?? ""} /></label><label className="form-span">Description<textarea name="description" maxLength={5000} defaultValue={editing === "new" ? "" : editing.description} /></label><label className="form-span">Completion or resolution notes<textarea name="completionNotes" maxLength={5000} defaultValue={editing === "new" ? "" : editing.completionNotes ?? ""} /></label></div><div className="button-row"><button type="button" className="button button-secondary" onClick={() => setEditing(null)}>Cancel</button><button className="button button-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button></div></form>}
    {error && <p className="taxonomy-editor-error" role="alert">{error}</p>}
    {visible.length === 0 ? <div className="empty-state compact-empty"><ListTodo size={22} /><h3>No {showArchived ? "archived" : "active"} tasks or callouts</h3><p>Create a record or switch views.</p></div> : <div className="issue-list">{visible.map((flag) => { const action = taskCalloutStatusAction(flag); const due = taskCalloutDueState(flag); return <div key={flag.id}><span className={`priority-dot priority-${flag.priority.toLowerCase()}`} /><div><strong>{flag.title}</strong><small>{flag.recordKind} · {flag.category} · Due {flag.dueDate ?? "not set"}{due === "Overdue" ? " · Overdue" : ""}</small><small>Created by {flag.createdBy?.displayName ?? "Unknown"} · Updated by {flag.updatedBy?.displayName ?? "Unknown"} on {flag.updatedAt.slice(0, 10)}{flag.completedBy ? ` · Completed by ${flag.completedBy.displayName}` : ""}{flag.resolvedBy ? ` · Resolved by ${flag.resolvedBy.displayName}` : ""}</small></div><span>{flag.assignee?.displayName ?? "Unassigned"}</span><StatusBadge tone={flag.priority === "Critical" ? "danger" : flag.priority === "High" ? "warning" : "neutral"}>{flag.priority}</StatusBadge><StatusBadge>{flag.status}</StatusBadge><div className="table-actions">{showArchived ? <button disabled={pending} onClick={() => restore(flag)}>Restore</button> : <><button onClick={() => { setEditorKind(flag.recordKind); setEditing(flag); }}>Edit</button><button disabled={pending} onClick={() => changeStatus(flag)}>{action.label}</button><button disabled={pending} onClick={() => archive(flag)}>Archive</button></>}</div></div>; })}</div>}
  </article>;
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

function LmsTab({ course }: { course: Course }) {
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
    </div>
  );
}

function ActivityTab({ course }: { course: Course }) {
  const items = course.auditHistory.map((audit) => ({
    id: audit.id,
    title: audit.action,
    date: audit.occurredAt,
    actor: audit.actor,
    detail: audit.reason,
  }));
  return (
    <article className="panel">
      <div className="panel-heading">
        <div>
          <h2>Activity history</h2>
          <p>Immutable history for significant record activity</p>
        </div>
        <History size={20} className="panel-icon" />
      </div>
      {items.length === 0 ? (
        <div className="empty-state compact-empty">
          <History size={24} />
          <h3>No recorded activity</h3>
          <p>Audit entries will appear here after authorized changes.</p>
        </div>
      ) : (
        <div className="timeline-list">
        {items.map((item) => (
          <div key={item.id}>
            <span className="timeline-marker"><History size={14} /></span>
            <div>
              <strong>{item.title}</strong>
              <p>{item.detail ?? item.actor}</p>
              <small>{item.actor} · {item.date}</small>
            </div>
          </div>
        ))}
        </div>
      )}
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
