"use client";

import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Award,
  Check,
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
  CourseProjectionUpdate,
  FieldComparison,
  VersionWrikeTaskReference,
  AccreditationHistoryGroup,
  TaskCalloutActor,
} from "@/types/course";
import { managementClassifications, provenanceLabels, verticals } from "@/types/course";
import type { WrikeTaskCandidate } from "@/db";
import { StatusBadge } from "../status-badge";
import { HealthAboutDialog } from "../health-about-dialog";
import { WrikeTaskLinkControl } from "../wrike-task-link-control";
import { accreditationDisplayLabel, groupAccreditationRecords } from "@/lib/accreditation-grouping";
import { statusesForKind, TASK_CALLOUT_KINDS, TASK_CALLOUT_PRIORITIES, taskCalloutDueState, taskCalloutStatusAction } from "@/lib/task-callouts";
import { AsyncCourseSelect } from "../async-course-select";
import { AccreditationRecordEditor, VersionRecordEditor } from "../record-editors";
import { AlignmentGlossary, AlignmentStatusBadge } from "../alignment-help";
import { LmsLinkAction, LmsLinkActions, RestrictedLinkPresence, type LmsLinkKind } from "../lms-link-actions";
import { LinkFieldEditor } from "../link-field-editor";
import { RichTextField } from "../rich-text-field";
import type { EditableCourseField } from "@/lib/workflow-validation";
import { TablePagination, useLocalTablePagination } from "../table-pagination";

const tabs = [
  "Overview",
  "Versions",
  "Accreditation",
  "Topics & Tags",
  "Notes",
  "Tasks & Callouts",
  "Revamp Planning",
  "Activity",
] as const;

type Tab = (typeof tabs)[number];
type ProjectionForm = Omit<CourseProjectionUpdate, "expectedUpdatedAt">;
const editableLifecycleStatuses: ProjectionForm["lifecycleStatus"][] = ["In Development", "Internal Review", "Published", "Under Maintenance", "Scheduled for Revamp", "Retired", "Archived"];
const publicationStatuses: ProjectionForm["publicationStatus"][] = ["Unknown", "Not in LMS", "Draft", "Testing", "Published", "Hidden", "Inactive", "Retired", "Retrieval Error"];
const managementLabel = (value: Course["managementClassification"]) => value === "Lexipol managed" ? "Lexipol Managed" : "Unmanaged";

function projectionForm(course: Course): ProjectionForm {
  return {
    courseCode: course.courseCode, title: course.title, shortTitle: course.shortTitle ?? "", description: course.description,
    learningAudience: course.learningAudience, verticals: course.verticals,
    primaryTopic: course.primaryTopic, managementClassification: course.managementClassification, monitoringEnabled: course.monitoringEnabled,
    lifecycleStatus: editableLifecycleStatuses.includes(course.lifecycleStatus as ProjectionForm["lifecycleStatus"]) ? course.lifecycleStatus as ProjectionForm["lifecycleStatus"] : "In Development",
    publicationStatus: course.publicationStatus, contentType: course.deliveryFormat, durationMinutes: course.durationMinutes,
    trainingCredits: course.trainingCredits, published: course.published, authoringTool: course.authoringTool,
    stateCode: course.stateCode ?? "", owner: course.owner ?? "", instructionalDesigner: course.instructionalDesigner ?? "",
    publishedDate: course.originalPublishDate ?? "", lastMajorRevisionDate: course.lastMajorRevisionDate ?? "", nextReviewDate: course.nextReviewDate ?? "",
    backendLink: course.backendLink ?? "", frontendLink: course.frontendLink ?? "", updateType: course.updateType ?? "",
    contentUpdatedAt: course.contentUpdatedAt ?? "", contentNotes: course.contentNotes ?? "", internalSummary: course.internalSummary,
  };
}
type ResolutionAction =
  | "Use LMS value"
  | "Keep Content Team value"
  | "Clear resolution and review again";

function daysBetweenIso(fromIso: string, toIso: string): number {
  return Math.round((new Date(`${toIso}T00:00:00.000Z`).getTime() - new Date(`${fromIso}T00:00:00.000Z`).getTime()) / 86_400_000);
}

/** Approximate, human-readable span for a review countdown/overdue display (e.g. "4 months", "2 years"). */
function formatApproxSpan(days: number): string {
  const abs = Math.abs(days);
  if (abs < 60) return `${abs} day${abs === 1 ? "" : "s"}`;
  if (abs < 365) {
    const months = Math.round(abs / 30);
    return `${months} month${months === 1 ? "" : "s"}`;
  }
  const years = Math.round((abs / 365) * 10) / 10;
  return `${years} year${years === 1 ? "" : "s"}`;
}

interface ReviewCycleStatus { label: string; tone: "neutral" | "warning" | "danger" | "success"; overdue: boolean }

function reviewCycleStatus(nextReviewDate: string | null): ReviewCycleStatus {
  if (!nextReviewDate) return { label: "Not scheduled", tone: "neutral", overdue: false };
  const days = daysBetweenIso(new Date().toISOString().slice(0, 10), nextReviewDate);
  if (days >= 0) {
    if (days === 0) return { label: "Due today", tone: "warning", overdue: false };
    return { label: `Next review in ${formatApproxSpan(days)}`, tone: days <= 60 ? "warning" : "success", overdue: false };
  }
  const overdueDays = -days;
  return {
    label: `${formatApproxSpan(overdueDays)} overdue`,
    tone: overdueDays > 365 ? "danger" : overdueDays > 180 ? "warning" : "neutral",
    overdue: true,
  };
}

export function CourseDetail({
  course,
  topicSuggestions,
  tagSuggestions,
  initialFavorite,
  canEditCourse,
  canManageVersions,
  canManageAccreditations,
  isAdministrator,
  lmsAuthorityMode,
  assignees,
  userId,
}: {
  course: Course;
  topicSuggestions: string[];
  tagSuggestions: string[];
  initialFavorite: boolean;
  canEditCourse: boolean;
  canManageVersions: boolean;
  canManageAccreditations: boolean;
  isAdministrator: boolean;
  lmsAuthorityMode: "workbook" | "api";
  assignees: TaskCalloutActor[];
  userId: string;
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

  const reviewCycle = reviewCycleStatus(currentCourse.nextReviewDate);
  const accreditationRiskGroups = groupAccreditationRecords(currentCourse.accreditations).filter((group) => group.isAtRisk);
  const accreditationFlag = accreditationRiskGroups.length === 0 ? null : {
    label: accreditationRiskGroups.some((group) => group.riskState === "expired") ? "Accreditation expired" : "Accreditation expiring soon",
    tone: (accreditationRiskGroups.some((group) => group.riskState === "expired") ? "danger" : "warning") as "danger" | "warning",
  };

  const [form, setForm] = useState<ProjectionForm>(() => projectionForm(course));
  const beginEditing = () => { setForm(projectionForm(currentCourse)); setEditing(true); };
  void beginEditing;
  const updateForm = <K extends keyof ProjectionForm>(key: K, value: ProjectionForm[K]) => setForm((current) => ({ ...current, [key]: value }));

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
        body: JSON.stringify({ ...form, expectedUpdatedAt: currentCourse.updatedAt }),
      });
      const result = (await response.json()) as {
        message?: string;
        course?: Course;
      };
      if (!response.ok || !result.course) throw new Error(result.message || "The updated course was not returned.");
      setCurrentCourse(result.course);
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
        course?: Course;
      };
      if (!response.ok || !result.comparison) throw new Error(result.message);
      const resolvedComparison = result.comparison;
      if (result.course) {
        setCurrentCourse(result.course);
      } else {
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
      }
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

  void resolveField;
  return (
    <div className="page-stack">
      <Link href="/courses" className="back-link">
        <ArrowLeft size={16} />
        Back to Course Library
      </Link>

      <section className="course-heading course-heading-expanded">
        <div className="course-heading-main">
          <div className="course-monogram" aria-hidden="true">
            {(currentCourse.verticals[0] ?? currentCourse.courseCode)
              .split(" ")
              .slice(0, 2)
              .map((part) => part[0])
              .join("")}
          </div>
          <div className="course-identity">
            <div className="course-heading-badges">
              <StatusBadge
                tone={currentCourse.managementClassification === "Lexipol managed" ? "success" : "warning"}
              >
                {managementLabel(currentCourse.managementClassification)}
              </StatusBadge>
              <StatusBadge tone={currentCourse.lmsLinkStatus === "linked" ? "success" : "neutral"}>{currentCourse.lmsLinkStatus === "linked" ? "LMS linked" : "Not LMS linked"}</StatusBadge>
              <StatusBadge>{currentCourse.lifecycleStatus}</StatusBadge>
              <StatusBadge>{currentCourse.healthStatus}</StatusBadge>
              {currentCourse.deliveryFormat && <StatusBadge tone="info">{currentCourse.deliveryFormat}</StatusBadge>}
            </div>
            <h1>{currentCourse.title}</h1>
            <p>
              {currentCourse.courseCode} · {currentCourse.verticals.join(", ") || "No vertical"} · v
              {currentCourse.currentVersion}
              {currentCourse.durationMinutes !== null && ` · ${currentCourse.durationMinutes} min`}
            </p>
            <div className="course-action-row" aria-label="Course actions">
              <LmsLinkActions backendLink={currentCourse.backendLink} frontendLink={currentCourse.frontendLink} courseName={currentCourse.title} compact />
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
                disabled={lmsAuthorityMode !== "api" || retrievalState === "running"}
                aria-label={lmsAuthorityMode === "api" ? "Refresh LMS data" : "LMS refresh unavailable while workbook uploads are authoritative"}
                data-tooltip={lmsAuthorityMode === "api" ? "Refresh LMS data" : "LMS refresh unavailable while workbook uploads are authoritative"}
              >
                <RefreshCw size={18} className={retrievalState === "running" ? "spin" : ""} />
              </button>
              {canEditCourse && (
                <button className="icon-action" onClick={archiveCourse} aria-label="Archive course" data-tooltip="Archive course"><Archive size={18} /></button>
              )}
            </div>
          </div>
        </div>

        <div className="course-heading-summary" aria-label="Course summary">
          <article className="course-summary-card course-summary-health">
            <div className="course-summary-card-heading">
              <span>Course health</span>
              <HealthAboutDialog compact />
            </div>
            <div className="course-summary-health-row">
              <div className={`health-score health-score-compact health-${currentCourse.healthStatus.toLowerCase().replaceAll(" ", "-")}`}>
                {currentCourse.healthScore}
              </div>
              <div className="course-summary-health-detail">
                <div>
                  <StatusBadge>{currentCourse.healthStatus}</StatusBadge>
                  <strong>{currentCourse.metadataCompletenessScore}% CourseTrack data complete</strong>
                </div>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label="CourseTrack data completeness"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={currentCourse.metadataCompletenessScore}
                >
                  <span style={{ width: `${currentCourse.metadataCompletenessScore}%` }} />
                </div>
              </div>
            </div>
          </article>

          <article className="course-summary-card">
            <div className="course-summary-card-heading">
              <span><UserRound size={14} aria-hidden="true" /> Review cycle</span>
            </div>
            <dl className="course-summary-facts course-summary-facts-2col">
              <div>
                <dt>Next review</dt>
                <dd>
                  <StatusBadge tone={reviewCycle.tone}>{reviewCycle.label}</StatusBadge>
                </dd>
              </div>
              <div>
                <dt>Accreditation</dt>
                <dd>
                  {accreditationFlag ? (
                    <button type="button" className="link-button" onClick={() => setActiveTab("Accreditation")}>
                      <StatusBadge tone={accreditationFlag.tone}>{accreditationFlag.label}</StatusBadge>
                    </button>
                  ) : (
                    <StatusBadge tone="success">No accreditation risk</StatusBadge>
                  )}
                </dd>
              </div>
            </dl>
          </article>

          <article className="course-summary-card">
            <div className="course-summary-card-heading">
              <span><ShieldCheck size={14} aria-hidden="true" /> Source & retrieval</span>
            </div>
            <dl className="course-summary-facts">
              <div><dt>Source</dt><dd>{provenanceLabels[currentCourse.dataSource]}</dd></div>
              <div><dt>Status</dt><dd>{currentCourse.retrievalStatus}</dd></div>
              <div><dt>Last retrieved</dt><dd>{currentCourse.lastRetrievedAt ?? "Not retrieved"}</dd></div>
            </dl>
          </article>
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
              <h2>Edit CourseTrack course fields</h2>
              <p>The projection is editable; immutable LMS snapshots remain unchanged.</p>
            </div>
            <button
              className="icon-button"
              onClick={() => setEditing(false)}
              aria-label="Close edit panel"
            >
              <X size={18} />
            </button>
          </div>
          <form onSubmit={saveInternalMetadata} className="edit-form projection-edit-form">
            <fieldset><legend>Identity</legend>
              <label className="form-field"><span>Course code</span><input value={form.courseCode} onChange={(event) => updateForm("courseCode", event.target.value)} required /></label>
              <label className="form-field"><span>Course name</span><input value={form.title} onChange={(event) => updateForm("title", event.target.value)} required /></label>
              <label className="form-field"><span>Short title</span><input value={form.shortTitle} onChange={(event) => updateForm("shortTitle", event.target.value)} /></label>
              <label className="form-field form-field-wide"><span>Description</span><textarea value={form.description} onChange={(event) => updateForm("description", event.target.value)} maxLength={5000} /></label>
              <label className="form-field form-field-wide"><span>Learning audience</span><textarea value={form.learningAudience} onChange={(event) => updateForm("learningAudience", event.target.value)} maxLength={500} /></label>
            </fieldset>
            <fieldset><legend>Course metadata</legend>
              <label className="form-field"><span>Content type</span><input value={form.contentType} onChange={(event) => updateForm("contentType", event.target.value)} /></label>
              <label className="form-field"><span>Duration (minutes)</span><input type="number" min={0} value={form.durationMinutes ?? ""} onChange={(event) => updateForm("durationMinutes", event.target.value === "" ? null : Number(event.target.value))} /></label>
              <label className="form-field"><span>Training credit amount</span><input type="number" min={0} step="0.01" value={form.trainingCredits.amount ?? ""} onChange={(event) => updateForm("trainingCredits", { ...form.trainingCredits, amount: event.target.value === "" ? null : Number(event.target.value) })} /></label>
              <label className="form-field"><span>Training credit unit</span><input value={form.trainingCredits.unit ?? ""} onChange={(event) => updateForm("trainingCredits", { ...form.trainingCredits, unit: event.target.value || null })} placeholder="hours or minutes" /></label>
              <label className="form-field"><span>Publication status</span><select value={form.publicationStatus} onChange={(event) => updateForm("publicationStatus", event.target.value as ProjectionForm["publicationStatus"])}>{publicationStatuses.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="form-field"><span>Published in LMS</span><select value={form.published === null ? "unknown" : form.published ? "yes" : "no"} onChange={(event) => updateForm("published", event.target.value === "unknown" ? null : event.target.value === "yes")}><option value="unknown">Not supplied</option><option value="yes">Published</option><option value="no">Not published</option></select></label>
              <label className="form-field"><span>Publication date</span><input type="date" value={form.publishedDate} onChange={(event) => updateForm("publishedDate", event.target.value)} /></label>
              <label className="form-field"><span>Authoring tool</span><input value={form.authoringTool} onChange={(event) => updateForm("authoringTool", event.target.value)} /></label>
              <label className="form-field"><span>Content update type</span><input value={form.updateType} onChange={(event) => updateForm("updateType", event.target.value)} /></label>
              <label className="form-field"><span>Content updated</span><input type="date" value={form.contentUpdatedAt} onChange={(event) => updateForm("contentUpdatedAt", event.target.value)} /></label>
              <label className="form-field"><span>Backend URL</span><input type="url" value={form.backendLink} onChange={(event) => updateForm("backendLink", event.target.value)} /></label>
              <label className="form-field"><span>Frontend URL</span><input type="url" value={form.frontendLink} onChange={(event) => updateForm("frontendLink", event.target.value)} /></label>
              <label className="form-field form-field-wide"><span>Source notes</span><textarea value={form.contentNotes} onChange={(event) => updateForm("contentNotes", event.target.value)} maxLength={2000} /></label>
            </fieldset>
            <fieldset><legend>Classification and ownership</legend>
              <label className="form-field"><span>Verticals</span><select multiple value={form.verticals} onChange={(event) => updateForm("verticals", Array.from(event.currentTarget.selectedOptions, (option) => option.value) as ProjectionForm["verticals"])}>{verticals.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="form-field"><span>Primary topic</span><input value={form.primaryTopic} onChange={(event) => updateForm("primaryTopic", event.target.value)} /></label>
              <label className="form-field"><span>Management classification</span><select value={form.managementClassification} disabled={Boolean(currentCourse.contentMetadata)} onChange={(event) => updateForm("managementClassification", event.target.value as ProjectionForm["managementClassification"])}>{managementClassifications.map((value) => <option key={value} value={value}>{managementLabel(value)}</option>)}</select>{currentCourse.contentMetadata && <small>Managed by the current uploaded master metadata record.</small>}</label>
              <label className="form-field checkbox-field"><input type="checkbox" checked={form.monitoringEnabled} onChange={(event) => updateForm("monitoringEnabled", event.target.checked)} /><span>Monitoring enabled</span></label>
              <label className="form-field"><span>Lifecycle</span><select value={form.lifecycleStatus} onChange={(event) => updateForm("lifecycleStatus", event.target.value as ProjectionForm["lifecycleStatus"])}>{editableLifecycleStatuses.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="form-field"><span>Owner</span><input value={form.owner} onChange={(event) => updateForm("owner", event.target.value)} /></label>
              <label className="form-field"><span>Instructional designer</span><input value={form.instructionalDesigner} onChange={(event) => updateForm("instructionalDesigner", event.target.value)} /></label>
              <label className="form-field"><span>State code</span><input value={form.stateCode} onChange={(event) => updateForm("stateCode", event.target.value)} /></label>
              <label className="form-field"><span>Last major revision</span><input type="date" value={form.lastMajorRevisionDate} onChange={(event) => updateForm("lastMajorRevisionDate", event.target.value)} /></label>
              <label className="form-field"><span>Next review date</span><input type="date" value={form.nextReviewDate} onChange={(event) => updateForm("nextReviewDate", event.target.value)} /></label>
              <label className="form-field form-field-wide"><span>Internal summary</span><textarea value={form.internalSummary} onChange={(event) => updateForm("internalSummary", event.target.value)} maxLength={1200} /><small>CourseTrack source · visible to authorized internal users</small></label>
            </fieldset>
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
                {saveState === "saving" ? "Saving…" : "Save CourseTrack fields"}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="course-detail-grid course-detail-grid-single">
        <div className="detail-main">
          {activeTab === "Overview" && (
            <OverviewTab course={currentCourse} onCourseChange={setCurrentCourse} canEdit={canEditCourse} onNavigateToTopics={() => setActiveTab("Topics & Tags")} />
          )}
          {activeTab === "Versions" && (
            <VersionsTab course={currentCourse} onCourseChange={setCurrentCourse} canManage={canManageVersions} isAdministrator={isAdministrator} userId={userId} />
          )}
          {activeTab === "Accreditation" && (
            <AccreditationTab course={currentCourse} onCourseChange={setCurrentCourse} canManage={canManageAccreditations} authorityMode={lmsAuthorityMode} userId={userId} />
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
          {activeTab === "Activity" && <ActivityTab course={currentCourse} />}
        </div>

      </section>
    </div>
  );
}
type InlineCourseField = {
  field: EditableCourseField;
  label: string;
  lmsKey?: string;
  multiline?: boolean;
  rows?: number;
  kind?: "text" | "number" | "date" | "boolean" | "verticals" | "credits" | "richtext";
};

const identityFields: InlineCourseField[] = [
  { field: "title", label: "Course name", lmsKey: "courseName" },
  { field: "description", label: "Description", lmsKey: "description", multiline: true, rows: 6 },
];

const classificationFields: InlineCourseField[] = [
  { field: "verticals", label: "Verticals", kind: "verticals" },
];

const publishingFields: InlineCourseField[] = [
  { field: "lifecycleStatus", label: "Status", lmsKey: "published" },
  { field: "publishedDate", label: "Published date", lmsKey: "publishedDate", kind: "date" },
  { field: "contentUpdatedAt", label: "Last revision", lmsKey: "contentUpdatedAt", kind: "date" },
  { field: "nextReviewDate", label: "Next review", kind: "date" },
  { field: "updateType", label: "Update type", lmsKey: "updateType" },
];

const durationFields: InlineCourseField[] = [
  { field: "durationMinutes", label: "Duration", lmsKey: "durationMinutes", kind: "number" },
  { field: "trainingCredits", label: "Training credits", lmsKey: "trainingCredits", kind: "credits" },
];

const authoringFields: InlineCourseField[] = [
  { field: "authoringTool", label: "Authoring tool", lmsKey: "authoringTool" },
  { field: "instructionalDesigner", label: "Instructional designer" },
];

const contentNotesField: InlineCourseField = { field: "contentNotes", label: "Content notes", kind: "richtext" };

function courseFieldValue(course: Course, field: EditableCourseField): unknown {
  const values: Record<EditableCourseField, unknown> = {
    courseCode: course.courseCode, title: course.title, shortTitle: course.shortTitle, description: course.description,
    learningAudience: course.learningAudience, verticals: course.verticals, primaryTopic: course.primaryTopic,
    managementClassification: course.managementClassification, monitoringEnabled: course.monitoringEnabled,
    lifecycleStatus: course.lifecycleStatus, publicationStatus: course.publicationStatus, contentType: course.deliveryFormat,
    durationMinutes: course.durationMinutes, trainingCredits: course.trainingCredits, published: course.published,
    authoringTool: course.authoringTool, stateCode: course.stateCode ?? "", owner: course.owner ?? "",
    instructionalDesigner: course.instructionalDesigner ?? "", publishedDate: course.originalPublishDate ?? "",
    lastMajorRevisionDate: course.lastMajorRevisionDate ?? "", nextReviewDate: course.nextReviewDate ?? "",
    backendLink: course.backendLink ?? "", frontendLink: course.frontendLink ?? "", updateType: course.updateType ?? "",
    contentUpdatedAt: course.contentUpdatedAt ?? "", contentNotes: course.contentNotes ?? "", internalSummary: course.internalSummary,
  };
  return values[field];
}

function draftValue(value: unknown, kind: InlineCourseField["kind"]): string {
  if (kind === "verticals") return (value as string[]).join("|");
  if (kind === "credits") return String((value as Course["trainingCredits"])?.amount ?? "");
  if (kind === "boolean") return value === null ? "unknown" : value ? "true" : "false";
  return value === null || value === undefined ? "" : String(value);
}

function parsedDraft(draft: string, definition: InlineCourseField, course: Course): unknown {
  if (definition.kind === "verticals") return draft ? draft.split("|") : [];
  if (definition.kind === "number") return draft === "" ? null : Number(draft);
  if (definition.kind === "boolean") return draft === "unknown" ? null : draft === "true";
  if (definition.kind === "credits") return { ...course.trainingCredits, rawDisplay: draft || null, amount: draft === "" ? null : Number(draft) };
  return draft;
}

function OverviewTab({ course, onCourseChange, canEdit, onNavigateToTopics }: { course: Course; onCourseChange: Dispatch<SetStateAction<Course>>; canEdit: boolean; onNavigateToTopics: () => void }) {
  const [editingField, setEditingField] = useState<EditableCourseField | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const saveFieldValue = async (field: EditableCourseField, value: unknown) => {
    if (!course.updatedAt) { setError("Refresh the page before editing this course."); throw new Error("Refresh the page before editing this course."); }
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/courses/${course.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ field, value, expectedUpdatedAt: course.updatedAt }) });
      const result = await response.json() as { course?: Course; message?: string };
      if (!response.ok || !result.course) throw new Error(result.message || "The saved course was not returned.");
      onCourseChange(result.course);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "This field could not be saved.");
      throw saveError;
    } finally { setPending(false); }
  };

  const begin = (definition: InlineCourseField) => {
    setEditingField(definition.field); setDraft(draftValue(courseFieldValue(course, definition.field), definition.kind)); setError("");
  };
  const save = async (definition: InlineCourseField) => {
    if (pending) return;
    try { await saveFieldValue(definition.field, parsedDraft(draft, definition, course)); setEditingField(null); }
    catch { /* draft is retained; error is already surfaced */ }
  };

  const renderField = (definition: InlineCourseField) => {
    const value = courseFieldValue(course, definition.field);
    const comparison = course.fieldComparisons.find((item) => item.fieldKey === (definition.lmsKey ?? definition.field));
    const mismatch = comparison && !["In sync", "Manually confirmed"].includes(comparison.alignmentStatus);
    const isEditing = editingField === definition.field;
    return <div className={`inline-field-cell ${definition.multiline ? "inline-field-cell-wide" : ""} ${mismatch ? "has-mismatch" : ""}`} key={definition.field}>
      <div className="inline-field-heading"><span>{definition.label}</span>{mismatch && <ComparisonState comparison={comparison} />}</div>
      {isEditing ? <div className="inline-field-editor">
        {definition.kind === "verticals" ? <select aria-label={`Edit ${definition.label}`} autoFocus multiple value={draft ? draft.split("|") : []} onChange={(event) => setDraft(Array.from(event.currentTarget.selectedOptions, (option) => option.value).join("|"))} onKeyDown={(event) => { if (event.key === "Escape") setEditingField(null); }}>{verticals.map((vertical) => <option key={vertical}>{vertical}</option>)}</select>
          : definition.kind === "boolean" ? <select aria-label={`Edit ${definition.label}`} autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setEditingField(null); }}><option value="unknown">Not supplied</option><option value="true">Yes</option><option value="false">No</option></select>
            : definition.kind === "richtext" ? <RichTextField value={draft} onChange={setDraft} editable ariaLabel={definition.label} />
              : definition.multiline ? <textarea aria-label={`Edit ${definition.label}`} rows={definition.rows ?? 3} autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setEditingField(null); if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); void save(definition); } }} />
                : <input aria-label={`Edit ${definition.label}`} autoFocus type={definition.kind === "number" || definition.kind === "credits" ? "number" : definition.kind === "date" ? "date" : "text"} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") setEditingField(null); if (event.key === "Enter") { event.preventDefault(); void save(definition); } }} />}
        <div className="inline-field-actions"><button disabled={pending} onClick={() => void save(definition)}><Save size={13} /> Save</button><button disabled={pending} onClick={() => setEditingField(null)}>Cancel</button></div>
        {error && <small className="taxonomy-editor-error" role="alert">{error}</small>}
      </div> : <>
        {definition.kind === "richtext"
          ? <div className="source-lane source-lane-richtext"><small>CourseTrack</small><RichTextField value={typeof value === "string" ? value : ""} onChange={() => {}} editable={false} ariaLabel={definition.label} />{canEdit && <button aria-label={`Edit ${definition.label}`} onClick={() => begin(definition)}><Pencil size={13} /></button>}</div>
          : <div className="source-lane"><small>CourseTrack</small><strong>{formatSourceValue(value)}</strong>{canEdit && <button aria-label={`Edit ${definition.label}`} onClick={() => begin(definition)}><Pencil size={13} /></button>}</div>}
        {comparison && <div className="source-lane source-lane-lms"><small><LockKeyhole size={11} /> LMS</small><span>{formatSourceValue(comparison.lmsNormalizedValue)}</span></div>}
      </>}
    </div>;
  };

  const renderLinkCell = (field: "backendLink" | "frontendLink", kind: LmsLinkKind, label: string) => {
    const value = field === "backendLink" ? course.backendLink : course.frontendLink;
    const comparison = course.fieldComparisons.find((item) => item.fieldKey === field);
    const mismatch = comparison && !["In sync", "Manually confirmed"].includes(comparison.alignmentStatus);
    return <div className={`inline-field-cell ${mismatch ? "has-mismatch" : ""}`} key={field}>
      <div className="inline-field-heading"><span>{label}</span>{mismatch && <ComparisonState comparison={comparison} />}</div>
      <LinkFieldEditor kind={kind} value={value} label={label} editable={canEdit} pending={pending} onSave={(nextValue) => saveFieldValue(field, nextValue)} />
      {comparison && <div className="source-lane source-lane-lms"><small><LockKeyhole size={11} /> LMS</small><LmsLinkAction kind={kind} value={comparison.lmsNormalizedValue} compact /></div>}
    </div>;
  };

  const editableManagement = canEdit && !course.contentMetadata;
  const reviewCycle = reviewCycleStatus(course.nextReviewDate);

  return (
    <div className="detail-section-stack">
      <article className="panel">
        <div className="panel-heading"><div><h2>Identity</h2></div></div>
        <div className="inline-field-grid">{identityFields.map(renderField)}</div>
      </article>

      <article className="panel">
        <div className="panel-heading"><div><h2>Classification</h2></div></div>
        <div className="inline-field-grid">
          {classificationFields.map(renderField)}
          <div className="inline-field-cell">
            <div className="inline-field-heading"><span>Topics</span></div>
            <div className="source-lane">
              <small>CourseTrack</small>
              <strong>{course.topicAssignments.length} topics · {course.tagAssignments.length} tags</strong>
              {canEdit && <button aria-label="Edit Topics" onClick={onNavigateToTopics}><Pencil size={13} /></button>}
            </div>
          </div>
          <div className="inline-field-cell">
            <div className="inline-field-heading"><span>Management</span></div>
            <label className="form-field checkbox-field">
              <input type="checkbox" checked={course.managementClassification === "Lexipol managed"} disabled={!editableManagement || pending}
                onChange={(event) => void saveFieldValue("managementClassification", event.target.checked ? "Lexipol managed" : "Unclassified")} />
              <span>Lexipol managed</span>
            </label>
            {course.contentMetadata && <small>Managed by the current uploaded master metadata record.</small>}
          </div>
        </div>
      </article>

      <article className="panel">
        <div className="panel-heading"><div><h2>Publishing</h2></div></div>
        <div className="inline-field-grid">
          {publishingFields.map((definition) => {
            if (definition.field !== "nextReviewDate") return renderField(definition);
            const cell = renderField(definition);
            return reviewCycle.overdue ? <div className="next-review-overdue" key="nextReviewDate-overdue">{cell}<StatusBadge tone={reviewCycle.tone}>{reviewCycle.label}</StatusBadge></div> : cell;
          })}
        </div>
      </article>

      <article className="panel">
        <div className="panel-heading"><div><h2>Duration &amp; Credits</h2></div></div>
        <div className="inline-field-grid">{durationFields.map(renderField)}</div>
      </article>

      <article className="panel">
        <div className="panel-heading"><div><h2>Links</h2></div></div>
        <div className="inline-field-grid">
          {renderLinkCell("backendLink", "backend", "Backend link")}
          {renderLinkCell("frontendLink", "course", "Frontend link")}
        </div>
      </article>

      <article className="panel">
        <div className="panel-heading"><div><h2>Authoring</h2></div></div>
        <div className="inline-field-grid">{authoringFields.map(renderField)}</div>
      </article>

      <article className="panel">
        <div className="panel-heading"><div><h2>Content Notes</h2><p>CourseTrack only — not sourced from the LMS.</p></div></div>
        <div className="inline-field-grid">{renderField(contentNotesField)}</div>
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
    if (credit.rawDisplay) return credit.rawDisplay.replace(/\[([^\]]+)\]/g, "$1");
    return JSON.stringify(value);
  }
  return String(value).replace(/\[([^\]]+)\]/g, "$1");
}
function ComparisonState({ comparison }: { comparison: FieldComparison }) {
  const state = comparison.alignmentStatus === "In sync"
    ? { label: "In sync", icon: Check, tone: "success" as const }
    : comparison.alignmentStatus === "Manually confirmed"
      ? { label: "Manually confirmed", icon: ShieldCheck, tone: "success" as const }
      : comparison.alignmentStatus === "Pending LMS update"
        ? { label: "Pending LMS update", icon: AlertTriangle, tone: "danger" as const }
        : comparison.alignmentStatus === "Missing metadata"
          ? { label: "Missing metadata", icon: Database, tone: "warning" as const }
          : comparison.alignmentStatus === "App only"
            ? { label: "App only", icon: Sparkles, tone: "info" as const }
            : { label: "Mapping required", icon: AlertTriangle, tone: "danger" as const };
  const Icon = state.icon;
  return <AlignmentStatusBadge status={comparison.alignmentStatus} tone={state.tone}><Icon size={12} aria-hidden="true" /> {state.label}</AlignmentStatusBadge>;
}

function comparisonLinkKind(fieldKey: string): LmsLinkKind | null {
  if (fieldKey === "backendLink") return "backend";
  if (fieldKey === "frontendLink") return "course";
  return null;
}

function ComparisonValue({ comparison, value, raw = false }: { comparison: FieldComparison; value: unknown; raw?: boolean }) {
  const kind = comparisonLinkKind(comparison.fieldKey);
  if (!kind) return <>{formatSourceValue(value)}</>;
  if (raw && kind === "backend") return <RestrictedLinkPresence value={value} kind={kind} />;
  return <LmsLinkAction kind={kind} value={value} compact />;
}

function DataComparisonTab({
  course,
  resolving,
  onResolve,
  onCourseChange,
  canEdit,
  authorityMode,
}: {
  course: Course;
  resolving: boolean;
  onResolve: (fieldKey: string, action: ResolutionAction) => void;
  onCourseChange: Dispatch<SetStateAction<Course>>;
  canEdit: boolean;
  authorityMode: "workbook" | "api";
}) {
  const sourceHistory = [...course.retrievalHistory, ...course.importHistory]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmationError, setConfirmationError] = useState("");
  const hasDiscrepancies = course.fieldComparisons.some((comparison) => comparison.alignmentStatus !== "In sync");
  const confirmAlignment = async (comparison: FieldComparison) => {
    const note = window.prompt("Optional note describing the LMS update:", "") ?? "";
    setConfirmingId(comparison.id); setConfirmationError("");
    try {
      const response = await fetch(`/api/courses/${course.id}/data-comparisons/${comparison.id}/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: comparison.updatedAt, note }) });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message);
      const confirmedAt = new Date().toISOString();
      onCourseChange((current) => ({ ...current, sourceDifferenceCount: Math.max(0, current.sourceDifferenceCount - 1), fieldComparisons: current.fieldComparisons.map((item) => item.id === comparison.id ? { ...item, alignmentStatus: "Manually confirmed", confirmationTime: confirmedAt, confirmationNote: note, updatedAt: confirmedAt } : item) }));
    } catch (error) { setConfirmationError(error instanceof Error ? error.message : "Alignment could not be confirmed."); }
    finally { setConfirmingId(null); }
  };

  return (
    <div className="detail-section-stack">
      <article className="panel">
        <div className="panel-heading">
          <div>
            <h2>Data Comparison</h2>
            <p>LMS, uploaded metadata, and editable CourseTrack values stay separate and auditable.</p>
          </div>
          <div className="comparison-heading-actions"><AlignmentGlossary /><StatusBadge tone={course.sourceDifferenceCount > 0 ? "danger" : "success"}>{course.sourceDifferenceCount} actionable difference{course.sourceDifferenceCount === 1 ? "" : "s"}</StatusBadge></div>
        </div>
        <div className="readonly-callout">
          <LockKeyhole size={18} />
          <span>
            <strong>{authorityMode === "api" ? "LMS API authority" : "Workbook authority"}</strong>
            {authorityMode === "api" ? "LMS-exclusive source fields are server-locked; resynchronization clears differences." : "Edits create a pending LMS update until a user separately confirms the LMS was changed."}
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
                <th>Uploaded metadata</th>
                <th>CourseTrack value</th>
                <th>Alignment</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {course.fieldComparisons.map((comparison) => (
                <tr key={comparison.fieldKey}>
                  <td data-label="Field">
                    <strong>{comparison.fieldLabel}</strong>
                    <small>Compared {comparison.lastComparedAt.slice(0, 10)}</small>
                  </td>
                  <td data-label="LMS value">
                    <span><ComparisonValue comparison={comparison} value={comparison.lmsNormalizedValue} /></span>
                    <small>{comparison.lmsSourceTimestamp?.slice(0, 10) ?? "No LMS source"}</small>
                  </td>
                  <td data-label="Uploaded metadata">
                    <span><ComparisonValue comparison={comparison} value={comparison.contentMetadataNormalizedValue} /></span>
                    <small>{comparison.metadataSourceTimestamp?.slice(0, 10) ?? "No metadata source"}</small>
                  </td>
                  <td data-label="CourseTrack value">
                    <strong><ComparisonValue comparison={comparison} value={comparison.courseTrackNormalizedValue} /></strong>
                    <small>Editable CourseTrack projection</small>
                    <details className="comparison-raw-details"><summary>Raw values and audit details</summary><dl><div><dt>Immutable LMS raw value</dt><dd><ComparisonValue comparison={comparison} value={comparison.lmsRawValue} raw /></dd></div><div><dt>Immutable uploaded raw value</dt><dd><ComparisonValue comparison={comparison} value={comparison.contentMetadataRawValue} raw /></dd></div><div><dt>Last compared</dt><dd>{comparison.lastComparedAt}</dd></div>{comparison.resolvedBy && <div><dt>Resolved by</dt><dd>{comparison.resolvedBy} · {comparison.resolvedAt}</dd></div>}</dl></details>
                  </td>
                  <td data-label="Alignment"><ComparisonState comparison={comparison} /></td>
                  <td data-label="Actions">
                    {canEdit && comparison.alignmentStatus !== "In sync" && comparison.fieldScope === "shared" ? <div className="comparison-actions">
                      <button disabled={resolving} onClick={() => onResolve(comparison.fieldKey, "Use LMS value")}>Use LMS</button>
                      {authorityMode === "workbook" && comparison.alignmentStatus === "Pending LMS update" && <button disabled={confirmingId === comparison.id} onClick={() => void confirmAlignment(comparison)}>Confirm LMS updated</button>}
                      <button disabled={resolving} onClick={() => onResolve(comparison.fieldKey, "Keep Content Team value")}>Keep CourseTrack</button>
                      <button disabled={resolving || !comparison.selectedSource} onClick={() => onResolve(comparison.fieldKey, "Clear resolution and review again")}>Clear</button>
                    </div> : <small>{!canEdit ? "View only" : comparison.fieldScope === "metadata_only" && comparison.alignmentStatus === "App only" ? "CourseTrack override; no LMS action required" : "No action required"}</small>}
                    {comparison.resolvedBy && (
                      <small>{comparison.resolvedBy} · {comparison.resolvedAt?.slice(0, 10)}</small>
                    )}
                    {comparison.confirmationTime && <small>{comparison.confirmationActor ?? "Confirmed"} · {comparison.confirmationTime.slice(0, 10)}{comparison.confirmationNote ? ` · ${comparison.confirmationNote}` : ""}</small>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
        {confirmationError && <p className="taxonomy-editor-error" role="alert">{confirmationError}</p>}
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
          <ProvenanceField label="Management classification" value={managementLabel(course.managementClassification)} source={course.contentMetadata ? "Content Metadata" : "CourseTrack"} />
          <ProvenanceField label="Monitoring" value={course.monitoringEnabled ? "Enabled" : "Disabled"} source="CourseTrack" />
          <ProvenanceField label="LMS snapshot" value={course.lmsSnapshot ? course.lmsSnapshot.retrievedAt : "Missing from LMS"} source="LMS" locked />
          <ProvenanceField label="Content Metadata" value={course.contentMetadata ? course.contentMetadata.importedAt : "Missing metadata"} source="Import" />
          <ProvenanceField label="Backend link" value={course.contentMetadata?.backendLink ? "Restricted internal administrative link present" : "Not supplied"} source="Content Metadata" />
          <ProvenanceField label="Frontend link" value={course.contentMetadata?.frontendLink ? "LMS course link present" : "Not supplied"} source="Content Metadata" />
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
            <h3>Vertical membership and LMS availability</h3>
            {course.verticalAssignments.map((assignment, index) => (
              <span key={`${assignment.source}-${assignment.vertical}-${index}`}>
                <strong>{assignment.kind === "availability" ? `Available on ${assignment.vertical}` : assignment.vertical}</strong>
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
            {canEdit && <RelationshipEditor course={course} onCourseChange={onCourseChange} />}
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

function RelationshipEditor({ course, onCourseChange }: { course: Course; onCourseChange: Dispatch<SetStateAction<Course>> }) {
  const [relationship, setRelationship] = useState<"parent" | "child">("parent");
  const [pending, setPending] = useState(false); const [error, setError] = useState("");
  const add = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const relatedCourseId = String(new FormData(event.currentTarget).get("relatedCourseId")); setPending(true); setError(""); try { const response = await fetch(`/api/courses/${course.id}/relationships`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ relationship, relatedCourseId }) }); const result = (await response.json()) as { relationship?: CourseRelationship; message?: string }; if (!response.ok || !result.relationship) throw new Error(result.message); onCourseChange((value) => ({ ...value, relationships: [...value.relationships, result.relationship!] })); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Relationship could not be assigned."); } finally { setPending(false); } };
  const remove = async (id: string) => { setPending(true); setError(""); try { const response = await fetch(`/api/relationships/${id}`, { method: "DELETE" }); const result = (await response.json()) as { message?: string }; if (!response.ok) throw new Error(result.message); onCourseChange((value) => ({ ...value, relationships: value.relationships.filter((item) => item.id !== id) })); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Relationship could not be removed."); } finally { setPending(false); } };
  return <div className="relationship-editor"><div className="tag-list">{course.relationships.filter((item) => item.source === "CourseTrack").map((item) => <span className="tag-chip" key={item.id}>{item.relationship}: {item.relatedCourseTitle ?? item.relatedCourseId}<button aria-label={`Remove relationship to ${item.relatedCourseTitle ?? item.relatedCourseId}`} disabled={pending} onClick={() => remove(item.id)}><X size={11} /></button></span>)}</div><form className="relationship-add-form" onSubmit={add}><select value={relationship} onChange={(event) => setRelationship(event.target.value as "parent" | "child")}><option value="parent">Parent</option><option value="child">Child</option></select><AsyncCourseSelect name="relatedCourseId" label="Related course" /><button className="button button-secondary" disabled={pending}>Add</button></form>{error && <p className="taxonomy-editor-error" role="alert">{error}</p>}</div>;
}

function VersionsTab({
  course,
  onCourseChange,
  canManage,
  isAdministrator,
  userId,
}: {
  course: Course;
  onCourseChange: Dispatch<SetStateAction<Course>>;
  canManage: boolean;
  isAdministrator: boolean;
  userId: string;
}) {
  const [editingVersion, setEditingVersion] = useState<CourseVersion | "new" | null>(null);
  const [pending, setPending] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [versionMessage, setVersionMessage] = useState("");
  const visibleVersions = course.versions.filter((version) => showArchived ? Boolean(version.archivedAt) : !version.archivedAt);
  const versionPagination = useLocalTablePagination([...visibleVersions].reverse(), `coursetrack:${userId}:table:course:${course.id}:versions`);
  const saveVersionRecord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const current = editingVersion === "new" ? null : editingVersion;
    const payload = { versionNumber: String(form.get("versionNumber")), versionType: String(form.get("versionType")), publicationDate: String(form.get("publicationDate")), versionStatus: String(form.get("versionStatus")), isCurrent: form.get("isCurrent") === "on", releaseNotes: String(form.get("releaseNotes")), authoringTool: String(form.get("authoringTool")), packageStandard: String(form.get("packageStandard")), expectedUpdatedAt: current?.updatedAt };
    setPending(true); setVersionMessage("");
    try {
      const response = await fetch(current ? `/api/course-versions/${current.id}` : `/api/courses/${course.id}/versions`, { method: current ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { version?: CourseVersion; message?: string }; if (!response.ok || !result.version) throw new Error(result.message);
      onCourseChange((value) => ({ ...value, versions: current ? value.versions.map((item) => item.id === current.id ? { ...result.version!, wrikeTaskReferences: item.wrikeTaskReferences } : result.version!.isCurrent ? { ...item, isCurrent: false, versionStatus: "Superseded" as const } : item) : [...value.versions.map((item) => result.version!.isCurrent ? { ...item, isCurrent: false, versionStatus: "Superseded" as const } : item), result.version!] }));
      setEditingVersion(null); setVersionMessage(result.message ?? "Version saved.");
    } catch (error) { setVersionMessage(error instanceof Error ? error.message : "Version could not be saved."); }
    finally { setPending(false); }
  };
  const archiveOrRestore = async (version: CourseVersion, restore: boolean) => {
    if (!version.updatedAt || (!restore && !window.confirm(`Archive version ${version.versionNumber}?`))) return;
    setPending(true); setVersionMessage("");
    try { const response = await fetch(`/api/course-versions/${version.id}${restore ? "/restore" : ""}`, { method: restore ? "POST" : "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: version.updatedAt }) }); const result = await response.json() as { message?: string }; if (!response.ok) throw new Error(result.message); const now = new Date().toISOString(); onCourseChange((value) => ({ ...value, versions: value.versions.map((item) => item.id === version.id ? { ...item, archivedAt: restore ? null : now, updatedAt: now } : item) })); setVersionMessage(result.message ?? (restore ? "Version restored." : "Version archived.")); }
    catch (error) { setVersionMessage(error instanceof Error ? error.message : "Version could not be updated."); } finally { setPending(false); }
  };
  return (
    <div className="detail-section-stack">
      <article className="panel">
        <div className="panel-heading">
          <div>
            <h2>Version history</h2>
            <p>Historical records are retained; only one CourseTrack version is current.</p>
          </div>
          <div className="button-row">{canManage && <button className="button button-primary" onClick={() => setEditingVersion("new")}>Create version</button>}<button className="button button-secondary" onClick={() => setShowArchived((value) => !value)}>{showArchived ? "Show active" : "Archived history"}</button></div>
        </div>
        {versionMessage && <div className="inline-alert" role="status"><ShieldCheck size={16} /><span>{versionMessage}</span></div>}
        {editingVersion && <VersionRecordEditor version={editingVersion === "new" ? null : editingVersion} courseField={<input type="hidden" name="courseId" value={course.id} />} pending={pending} onSubmit={saveVersionRecord} onCancel={() => setEditingVersion(null)} />}
        <div className="table-scroll">
          <table className="data-table version-detail-table">
            <thead>
              <tr>
                <th>Version</th>
                <th>Type</th>
                <th>Publication dates</th>
                <th>Wrike Task Link</th>
                <th>Release notes</th>
                <th>Maintained by</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {versionPagination.pageItems.map((version) => (
                <tr key={version.id}>
                  <td className="mono-cell">v{version.versionNumber}</td>
                  <td>{version.versionType}</td>
                  <td><strong>CourseTrack: {version.publicationDate}</strong><small>Wrike: {version.wrikeTaskReferences[0]?.wrikePublishedDate ?? "Not mapped"}</small><small>Metadata fallback: {course.contentUpdatedAt ?? "Not supplied"}</small></td>
                  <td className="version-wrike-cell">
                    <VersionWrikeCell version={version} onCourseChange={onCourseChange} canManage={canManage && !version.archivedAt} />
                  </td>
                  <td>{version.releaseNotes}</td>
                  <td><StatusBadge tone="success">{provenanceLabels[version.provenance ?? "coursetrack"]}</StatusBadge><small>Origin: {provenanceLabels[version.originProvenance ?? "coursetrack"]}</small></td>
                  <td>{version.archivedAt ? <StatusBadge>Archived</StatusBadge> : version.isCurrent ? <StatusBadge tone="success">Current</StatusBadge> : <StatusBadge>{version.versionStatus}</StatusBadge>}</td>
                  <td><div className="table-actions">{canManage && !version.archivedAt && <button onClick={() => setEditingVersion(version)}>Edit</button>}{canManage && !version.archivedAt && <button disabled={pending || version.isCurrent} onClick={() => void archiveOrRestore(version, false)}>Archive</button>}{isAdministrator && version.archivedAt && <button disabled={pending} onClick={() => void archiveOrRestore(version, true)}>Restore</button>}</div></td>
                </tr>
              ))}
            </tbody>
          </table>{visibleVersions.length === 0 && <div className="empty-state compact-empty"><History size={22} /><p>No {showArchived ? "archived" : "active"} versions.</p></div>}
        </div>
        <TablePagination page={versionPagination.page} pageSize={versionPagination.pageSize} total={visibleVersions.length} onPageChange={versionPagination.setPage} onPageSizeChange={versionPagination.setPageSize} noun="versions" />
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
        wrikePublishedDate: null,
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

function AccreditationTab({ course, onCourseChange, canManage, authorityMode, userId }: { course: Course; onCourseChange: Dispatch<SetStateAction<Course>>; canManage: boolean; authorityMode: "workbook" | "api"; userId: string }) {
  const [editingRecord, setEditingRecord] = useState<AccreditationRecord | "new" | null>(null);
  const [pending, setPending] = useState(false);
  const [accreditationMessage, setAccreditationMessage] = useState("");
  const activeRecords = course.accreditations.filter((record) => !record.archivedAt);
  const archivedRecords = course.accreditations.filter((record) => record.archivedAt);
  const groups = groupAccreditationRecords(course.accreditations, { courseKey: course.id });
  const saveRecord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const current = editingRecord === "new" ? null : editingRecord;
    const value = (name: string, fallback: string | null = null) => form.get(name) === null ? fallback : String(form.get(name));
    const payload = { organization: value("organization", current?.organization ?? "")!, jurisdiction: value("jurisdiction", current?.jurisdiction ?? "")!, status: value("status", current?.status ?? "Approved")!, approvalNumber: value("approvalNumber", current?.approvalNumber ?? null) || null, topicNumber: value("topicNumber", current?.topicNumber ?? null) || null, creditHours: Number(value("creditHours", String(current?.creditHours ?? 0))), effectiveDate: value("effectiveDate", current?.effectiveDate ?? null) || null, expirationDate: value("expirationDate", current?.expirationDate ?? null) || null, expectedUpdatedAt: current?.updatedAt };
    setPending(true); setAccreditationMessage("");
    try { const response = await fetch(current ? `/api/accreditations/${current.id}` : `/api/courses/${course.id}/accreditations`, { method: current ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); const result = await response.json() as { record?: AccreditationRecord; message?: string }; if (!response.ok || !result.record) throw new Error(result.message); onCourseChange((valueCourse) => ({ ...valueCourse, accreditations: current ? valueCourse.accreditations.map((item) => item.id === current.id ? result.record! : item) : [...valueCourse.accreditations, result.record!] })); setEditingRecord(null); setAccreditationMessage(result.message ?? "Accreditation saved."); }
    catch (error) { setAccreditationMessage(error instanceof Error ? error.message : "Accreditation could not be saved."); } finally { setPending(false); }
  };
  const archiveOrRestore = async (record: AccreditationRecord, restore: boolean) => {
    if (!record.updatedAt || (!restore && !window.confirm(`Archive ${record.organization} accreditation?`))) return; setPending(true); setAccreditationMessage("");
    try { const response = await fetch(`/api/accreditations/${record.id}${restore ? "/restore" : ""}`, { method: restore ? "POST" : "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: record.updatedAt }) }); const result = await response.json() as { message?: string }; if (!response.ok) throw new Error(result.message); const now = new Date().toISOString(); onCourseChange((value) => ({ ...value, accreditations: value.accreditations.map((item) => item.id === record.id ? { ...item, archivedAt: restore ? null : now, updatedAt: now, alignmentStatus: !restore && item.sourceDomain === "lms" ? "Pending LMS update" : item.alignmentStatus } : item) })); setAccreditationMessage(result.message ?? (restore ? "Accreditation restored." : "Accreditation archived.")); }
    catch (error) { setAccreditationMessage(error instanceof Error ? error.message : "Accreditation could not be updated."); } finally { setPending(false); }
  };
  const confirmRecord = async (record: AccreditationRecord) => { if (!record.updatedAt) return; setPending(true); const note = window.prompt("Optional note describing the LMS update:", "") ?? ""; try { const response = await fetch(`/api/accreditations/${record.id}/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: record.updatedAt, note }) }); const result = await response.json() as { message?: string }; if (!response.ok) throw new Error(result.message); const now = new Date().toISOString(); onCourseChange((value) => ({ ...value, accreditations: value.accreditations.map((item) => item.id === record.id ? { ...item, alignmentStatus: "Manually confirmed", confirmationTime: now, confirmationNote: note, updatedAt: now } : item) })); setAccreditationMessage(result.message ?? "Alignment confirmed."); } catch (error) { setAccreditationMessage(error instanceof Error ? error.message : "Alignment could not be confirmed."); } finally { setPending(false); } };
  const deleteRecord = async (record: AccreditationRecord) => {
    if (!record.updatedAt || !record.archivedAt || record.sourceDomain !== "coursetrack") return;
    if (!window.confirm(`Permanently delete this archived ${record.organization} accreditation? This cannot be undone.`)) return;
    setPending(true); setAccreditationMessage("");
    try { const response = await fetch(`/api/accreditations/${record.id}/permanent`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: record.updatedAt }) }); const result = await response.json() as { deleted?: boolean; message?: string }; if (!response.ok || !result.deleted) throw new Error(result.message || "The database did not confirm deletion."); onCourseChange((value) => ({ ...value, accreditations: value.accreditations.filter((item) => item.id !== record.id) })); setAccreditationMessage(result.message ?? "Archived accreditation permanently deleted."); }
    catch (error) { setAccreditationMessage(error instanceof Error ? error.message : "Accreditation could not be deleted."); } finally { setPending(false); }
  };
  return (
    <div className="detail-section-stack">
      <article className="panel"><div className="panel-heading"><div><h2>Accreditation</h2><p>{groups.length} issuing body and jurisdiction groups · {activeRecords.length} active · {archivedRecords.length} archived</p></div>{canManage && <button className="button button-primary" onClick={() => setEditingRecord("new")}>Add accreditation</button>}</div>
      {accreditationMessage && <div className="inline-alert" role="status"><ShieldCheck size={16} /><span>{accreditationMessage}</span></div>}
      {editingRecord && <AccreditationRecordEditor record={editingRecord === "new" ? null : editingRecord} courseField={<input type="hidden" name="courseId" value={course.id} />} pending={pending} apiLocked={authorityMode === "api"} onSubmit={saveRecord} onCancel={() => setEditingRecord(null)} />}
      </article>
      {groups.map((group) => <AccreditationGroupCard group={group} key={group.key} courseId={course.id} canManage={canManage} pending={pending} authorityMode={authorityMode} userId={userId} onEdit={setEditingRecord} onArchiveOrRestore={archiveOrRestore} onConfirm={confirmRecord} onDelete={deleteRecord} />)}
      {groups.length === 0 && <div className="empty-state compact-empty"><Award size={24} /><p>No accreditation records.</p></div>}
    </div>
  );
}

function accreditationAlignmentLabel(record: AccreditationRecord, authorityMode: "workbook" | "api"): "Aligned" | "Update LMS" | "Update CourseTrack" {
  if (record.alignmentStatus === "In sync" || record.alignmentStatus === "Manually confirmed") return "Aligned";
  return authorityMode === "api" && record.sourceDomain === "lms" ? "Update CourseTrack" : "Update LMS";
}

function AccreditationGroupCard({ group, courseId, canManage, pending, authorityMode, userId, onEdit, onArchiveOrRestore, onConfirm, onDelete }: {
  group: AccreditationHistoryGroup; canManage: boolean; pending: boolean; authorityMode: "workbook" | "api";
  userId: string; courseId: string;
  onEdit: (record: AccreditationRecord) => void; onArchiveOrRestore: (record: AccreditationRecord, restore: boolean) => Promise<void>;
  onConfirm: (record: AccreditationRecord) => Promise<void>; onDelete: (record: AccreditationRecord) => Promise<void>;
}) {
  const records = [group.summary, ...group.history];
  const summary = group.summary.record;
  const storageKey = `coursetrack:${userId}:table:course:${courseId}:accreditation:${group.key}`;
  const pagination = useLocalTablePagination(records, storageKey);
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return sessionStorage.getItem(`${storageKey}:expanded`) === "true"; }
    catch { return false; }
  });
  return (
    <details className="panel accreditation-accordion" open={open} onToggle={(event) => {
      const next = event.currentTarget.open;
      setOpen(next);
      try { sessionStorage.setItem(`${storageKey}:expanded`, String(next)); }
      catch { /* Session storage can be unavailable in restricted browser contexts. */ }
    }}>
      <summary>
        <div><h2>{group.organization}</h2><p>{group.jurisdiction} · {records.length} {records.length === 1 ? "record" : "records"}</p></div>
        <div className="accreditation-summary-line"><strong>{summary.approvalNumber ?? "No accreditation number"}</strong><span>{summary.effectiveDate ?? "No start"} – {summary.expirationDate ?? "No expiration"}</span><StatusBadge>{summary.archivedAt ? "Archived" : summary.status}</StatusBadge><StatusBadge tone={accreditationAlignmentLabel(summary, authorityMode) === "Aligned" ? "success" : "warning"}>{accreditationAlignmentLabel(summary, authorityMode)}</StatusBadge></div>
      </summary>
      <div className="accreditation-accordion-body">
        {pagination.pageItems.map((item) => {
          const record = item.record;
          const alignment = accreditationAlignmentLabel(record, authorityMode);
          return <section className={`accreditation-history-entry ${record.archivedAt ? "is-archived" : ""}`} key={record.id}>
            <div className="panel-heading"><div><strong>{record.approvalNumber ?? "No accreditation number"}</strong><p>Topic {record.topicNumber ?? "not used"} · {record.sourceDomain === "lms" ? "LMS" : "CourseTrack"}</p></div><div className="accreditation-summary-badges"><StatusBadge>{record.archivedAt ? "Archived" : accreditationDisplayLabel(record, item.historyRole === "current")}</StatusBadge><StatusBadge tone={alignment === "Aligned" ? "success" : "warning"}>{alignment}</StatusBadge></div></div>
            <div className="accreditation-record-grid"><span><small>Start date</small>{record.effectiveDate ?? "Not set"}</span><span><small>Expiration</small>{record.expirationDate ?? "Not set"}</span><span><small>Status</small>{record.status}</span><span><small>Credits</small>{record.creditHours} hours</span></div>
            {canManage && <div className="table-actions">
              {!record.archivedAt && <button disabled={pending || (authorityMode === "api" && record.sourceDomain === "lms")} onClick={() => onEdit(record)}>Edit</button>}
              {!record.archivedAt && <button disabled={pending || (authorityMode === "api" && record.sourceDomain === "lms")} onClick={() => void onArchiveOrRestore(record, false)}>Archive</button>}
              {!record.archivedAt && authorityMode === "workbook" && alignment === "Update LMS" && <button disabled={pending} onClick={() => void onConfirm(record)}>Confirm LMS updated</button>}
              {record.archivedAt && <button disabled={pending} onClick={() => void onArchiveOrRestore(record, true)}>Restore</button>}
              {record.archivedAt && record.sourceDomain === "coursetrack" && <button className="danger-action" disabled={pending} onClick={() => void onDelete(record)}>Delete permanently</button>}
            </div>}
          </section>;
        })}
        <TablePagination page={pagination.page} pageSize={pagination.pageSize} total={records.length} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} noun="entries" />
      </div>
    </details>
  );
}

function AccreditationRecordFields({ record }: { record: AccreditationRecord }) {
  return (
    <>
      <div className="field-grid">
        <ProvenanceField label="Approval number" value={record.approvalNumber ?? "Missing"} source={provenanceLabels[record.source]} locked={record.source === "lms_api"} />
        <ProvenanceField label="Topic number" value={record.topicNumber ?? "Not used"} source={provenanceLabels[record.source]} locked={record.source === "lms_api"} />
        <ProvenanceField label="Effective date" value={record.effectiveDate ?? "Not set"} source={provenanceLabels[record.source]} locked={record.source === "lms_api"} />
        <ProvenanceField label="Expiration date" value={record.expirationDate ?? "Not set"} source={provenanceLabels[record.source]} locked={record.source === "lms_api"} />
        <ProvenanceField label="Credit hours" value={String(record.creditHours)} source={provenanceLabels[record.source]} />
        <ProvenanceField label="Alignment" value={record.alignmentStatus} source="CourseTrack" />
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
        <small>{course.verticals.join(", ") || "No vertical"} / {course.primaryTopic}</small>
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
  const payload = (flag: CourseFlag, status = flag.status) => ({ recordKind: flag.recordKind, category: flag.category, title: flag.title, description: flag.description, priority: flag.priority, status, assigneeId: flag.assigneeId, dueDate: flag.dueDate, completionNotes: flag.completionNotes, expectedUpdatedAt: flag.updatedAt });
  const save = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const form = new FormData(event.currentTarget); const current = editing === "new" ? null : editing; setPending(true); setError(""); try { const response = await fetch(current ? `/api/flags/${current.id}` : `/api/courses/${course.id}/flags`, { method: current ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recordKind: String(form.get("recordKind")), category: String(form.get("category")), title: String(form.get("title")), description: String(form.get("description")), priority: String(form.get("priority")), status: String(form.get("status")), assigneeId: String(form.get("assigneeId")) || null, dueDate: String(form.get("dueDate")) || null, completionNotes: String(form.get("completionNotes")) || null, expectedUpdatedAt: current?.updatedAt }) }); const result = (await response.json()) as { flag?: CourseFlag; message?: string }; if (!response.ok || !result.flag) throw new Error(result.message); onCourseChange((value) => ({ ...value, flags: current ? value.flags.map((flag) => flag.id === current.id ? result.flag! : flag) : [result.flag!, ...value.flags] })); setEditing(null); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Task or callout could not be saved."); } finally { setPending(false); } };
  const deleteFlag = async (flag: CourseFlag) => { if (!window.confirm(`Permanently delete “${flag.title}”? This cannot be undone.`)) return; setPending(true); setError(""); try { const response = await fetch(`/api/flags/${flag.id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: flag.updatedAt }) }); const result = (await response.json()) as { message?: string }; if (!response.ok) throw new Error(result.message); onCourseChange((value) => ({ ...value, flags: value.flags.filter((item) => item.id !== flag.id) })); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Task or callout could not be deleted."); } finally { setPending(false); } };
  const changeStatus = async (flag: CourseFlag) => { const action = taskCalloutStatusAction(flag); setPending(true); setError(""); try { const response = await fetch(`/api/flags/${flag.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload(flag, action.status)) }); const result = (await response.json()) as { flag?: CourseFlag; message?: string }; if (!response.ok || !result.flag) throw new Error(result.message); onCourseChange((value) => ({ ...value, flags: value.flags.map((item) => item.id === flag.id ? result.flag! : item) })); } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Status could not be changed."); } finally { setPending(false); } };
  const visible = course.flags.filter((flag) => !flag.archivedAt);
  return <article className="panel"><div className="panel-heading"><div><h2>Tasks & Callouts</h2><p>Assigned work and contextual follow-up records</p></div><div className="button-row"><button className="button button-primary" onClick={() => { setEditorKind("Task"); setEditing("new"); }}><ListTodo size={16} /> Create</button></div></div>
    {editing && <form className="workflow-form" onSubmit={save}><div className="form-grid"><label>Kind<select name="recordKind" value={editorKind} onChange={(event) => setEditorKind(event.target.value as CourseFlag["recordKind"])}>{TASK_CALLOUT_KINDS.map((value) => <option key={value}>{value}</option>)}</select></label><label>Category<input name="category" required defaultValue={editing === "new" ? "Content" : editing.category} /></label><label>Title<input name="title" minLength={3} required defaultValue={editing === "new" ? "" : editing.title} /></label><label>Priority<select name="priority" defaultValue={editing === "new" ? "Medium" : editing.priority}>{TASK_CALLOUT_PRIORITIES.map((value) => <option key={value}>{value}</option>)}</select></label><label>Status<select key={editorKind} name="status" defaultValue={editing !== "new" && statusesForKind(editorKind).includes(editing.status) ? editing.status : "Open"}>{statusesForKind(editorKind).map((value) => <option key={value}>{value}</option>)}</select></label><label>Assignee<select name="assigneeId" defaultValue={editing === "new" ? "" : editing.assigneeId ?? ""}><option value="">Unassigned</option>{assignees.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select></label><label>Due date<input name="dueDate" type="date" defaultValue={editing === "new" ? "" : editing.dueDate ?? ""} /></label><label className="form-span">Description<textarea name="description" maxLength={5000} defaultValue={editing === "new" ? "" : editing.description} /></label><label className="form-span">Completion or resolution notes<textarea name="completionNotes" maxLength={5000} defaultValue={editing === "new" ? "" : editing.completionNotes ?? ""} /></label></div><div className="button-row"><button type="button" className="button button-secondary" onClick={() => setEditing(null)}>Cancel</button><button className="button button-primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button></div></form>}
    {error && <p className="taxonomy-editor-error" role="alert">{error}</p>}
    {visible.length === 0 ? <div className="empty-state compact-empty"><ListTodo size={22} /><h3>No active tasks or callouts</h3><p>Create the first record.</p></div> : <div className="issue-list">{visible.map((flag) => { const action = taskCalloutStatusAction(flag); const due = taskCalloutDueState(flag); return <div key={flag.id}><span className={`priority-dot priority-${flag.priority.toLowerCase()}`} /><div><strong>{flag.title}</strong><small>{flag.recordKind} · {flag.category} · Due {flag.dueDate ?? "not set"}{due === "Overdue" ? " · Overdue" : ""}</small><small>Created by {flag.createdBy?.displayName ?? "Unknown"} · Updated by {flag.updatedBy?.displayName ?? "Unknown"} on {flag.updatedAt.slice(0, 10)}{flag.completedBy ? ` · Completed by ${flag.completedBy.displayName}` : ""}{flag.resolvedBy ? ` · Resolved by ${flag.resolvedBy.displayName}` : ""}</small></div><span>{flag.assignee?.displayName ?? "Unassigned"}</span><StatusBadge tone={flag.priority === "Critical" ? "danger" : flag.priority === "High" ? "warning" : "neutral"}>{flag.priority}</StatusBadge><StatusBadge>{flag.status}</StatusBadge><div className="table-actions"><button onClick={() => { setEditorKind(flag.recordKind); setEditing(flag); }}>Edit</button><button disabled={pending} onClick={() => changeStatus(flag)}>{action.label}</button><button disabled={pending} onClick={() => deleteFlag(flag)}>Delete</button></div></div>; })}</div>}
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
// Course detail helpers remain colocated with the view that owns them.
void DataComparisonTab;
void AccreditationRecordFields;
void LmsTab;
