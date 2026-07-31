"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Award,
  BookOpen,
  Calendar,
  Check,
  Clock,
  Flag,
  History,
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
import { type FormEvent, useState } from "react";
import type { Course } from "@/types/course";
import { StatusBadge } from "../status-badge";

const tabs = [
  "Overview",
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

export function CourseDetail({ course }: { course: Course }) {
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
              <StatusBadge tone="sample">Sample</StatusBadge>
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
                  ? "Internal metadata updated"
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
          {activeTab === "Versions" && <VersionsTab course={currentCourse} />}
          {activeTab === "Accreditation" && (
            <AccreditationTab course={currentCourse} />
          )}
          {activeTab === "Topics & Tags" && (
            <TopicsTab course={currentCourse} />
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
          <ProvenanceField label="Publication status" value={course.publicationStatus} source="LMS" locked />
          <ProvenanceField label="Duration" value={`${course.durationMinutes} minutes`} source="LMS" locked />
          <ProvenanceField label="Authoring tool" value={course.authoringTool} source="LMS" locked />
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

function VersionsTab({ course }: { course: Course }) {
  return (
    <article className="panel">
      <div className="panel-heading">
        <div>
          <h2>Version history</h2>
          <p>Historical records are retained; only one version is current.</p>
        </div>
        <span className="panel-stat">{course.versions.length} versions</span>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Version</th>
              <th>Type</th>
              <th>Published</th>
              <th>Authoring tool</th>
              <th>Package</th>
              <th>Source</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {[...course.versions].reverse().map((version) => (
              <tr key={version.id}>
                <td className="mono-cell">v{version.versionNumber}</td>
                <td>{version.versionType}</td>
                <td>{version.publicationDate}</td>
                <td>{version.authoringTool}</td>
                <td>{version.packageStandard}</td>
                <td>
                  <StatusBadge tone={version.source === "lms" ? "info" : "neutral"}>
                    {version.source.toUpperCase()}
                  </StatusBadge>
                </td>
                <td>{version.isCurrent ? <StatusBadge tone="success">Current</StatusBadge> : "Historical"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
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
  return (
    <div className="detail-section-stack">
      {course.accreditations.map((record) => (
        <article className="panel accreditation-card" key={record.id}>
          <div className="panel-heading">
            <div>
              <h2>{record.organization}</h2>
              <p>{record.jurisdiction} · {record.creditHours} credit hours</p>
            </div>
            <StatusBadge>{record.status}</StatusBadge>
          </div>
          <div className="field-grid">
            <ProvenanceField label="Approval number" value={record.approvalNumber ?? "Missing"} source={record.source === "lms" ? "LMS" : "CourseTrack"} locked={record.source === "lms"} />
            <ProvenanceField label="Effective date" value={record.effectiveDate ?? "Not set"} source="CourseTrack" />
            <ProvenanceField label="Expiration date" value={record.expirationDate ?? "Not set"} source="CourseTrack" />
            <ProvenanceField label="Jurisdiction" value={record.jurisdiction} source="CourseTrack" />
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
        </article>
      ))}
    </div>
  );
}

function TopicsTab({ course }: { course: Course }) {
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
      <div className="tag-list">
        {course.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
    </article>
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
  return (
    <div className="detail-section-stack">
      <article className="panel">
        <div className="panel-heading">
          <div>
            <h2>Current LMS snapshot</h2>
            <p>Normalized values retrieved from Mock LMS</p>
          </div>
          <StatusBadge>{course.retrievalStatus}</StatusBadge>
        </div>
        <div className="readonly-grid">
          {[
            ["External course ID", course.lmsCourseId ?? "Unmapped"],
            ["Course title", course.title],
            ["Publication status", course.publicationStatus],
            ["Duration", `${course.durationMinutes} minutes`],
            ["Authoring tool", course.authoringTool],
            ["Last retrieved", course.lastRetrievedAt ?? "Not retrieved"],
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
