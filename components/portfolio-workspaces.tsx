"use client";

import {
  AlertTriangle,
  ArrowRight,
  Award,
  Check,
  Download,
  FileBarChart,
  Flag,
  Link2,
  ListTodo,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { demoUser, rolePermissions } from "@/lib/permissions";
import { accreditationDisplayLabel } from "@/lib/accreditation-grouping";
import type {
  AccreditationBoardEntry,
  CourseIndexEntry,
  FlagBoardEntry,
  ImportPreviewSummary,
  PortfolioReportMetrics,
  RevampBoardEntry,
  SampleDataCounts,
  TaxonomyCourseEntry,
  TaxonomySummary,
  VersionBoardEntry,
  WrikeConnectionSummary,
  WrikeSyncStatus,
} from "@/db";
import { StatusBadge } from "./status-badge";
import { ImportPreview } from "./import-preview/import-preview";
import type { CourseVersion, RetrievalRun } from "@/types/course";
import type { WrikeTask } from "@/providers/wrike";

export function AccreditationWorkspace({ entries }: { entries: AccreditationBoardEntry[] }) {
  const records = entries;
  const atRisk = records.filter(({ record }) =>
    ["Expiring Soon", "Expired", "Approved with Conditions"].includes(
      record.status,
    ),
  );

  return (
    <WorkspaceFrame
      eyebrow="Compliance workspace"
      title="Accreditation"
      description="Monitor approvals, renewals, expiration risk, and version alignment."
      action={<button className="button button-primary"><Award size={16} /> Add internal record</button>}
    >
      <MetricStrip
        metrics={[
          ["Accreditation records", String(records.length), "Across the sample portfolio"],
          ["Expiring in 90 days", String(records.filter(({ record }) => record.expirationDate && record.expirationDate <= "2026-10-28" && record.expirationDate >= "2026-07-30").length), "Renewal planning required"],
          ["Expired", String(records.filter(({ record }) => record.status === "Expired").length), "Immediate review"],
          ["Version mismatch", "4", "Approved version differs"],
        ]}
      />
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Accreditation risk queue</h2>
            <p>Records requiring the nearest action</p>
          </div>
          <StatusBadge tone="warning">{atRisk.length} at risk</StatusBadge>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Course</th><th>Organization</th><th>Jurisdiction</th>
                <th>Status</th><th>Expiration</th><th>Approval #</th>
              </tr>
            </thead>
            <tbody>
              {records
                .sort((a, b) =>
                  (a.record.expirationDate ?? "9999").localeCompare(
                    b.record.expirationDate ?? "9999",
                  ),
                )
                .slice(0, 12)
                .map(({ course, record }) => (
                  <tr key={record.id}>
                    <td><Link href={`/courses/${course.courseId}`} className="table-link">{course.courseTitle}</Link></td>
                    <td>{record.organization}</td>
                    <td>{record.jurisdiction}</td>
                    <td><StatusBadge label={accreditationDisplayLabel(record, record.status !== "Expired")} /></td>
                    <td>{record.expirationDate ?? "Not set"}</td>
                    <td className="mono-cell">{record.approvalNumber ?? "Missing"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </WorkspaceFrame>
  );
}

export function VersionsWorkspace({
  entries,
  initialWrikeTasks,
}: {
  entries: VersionBoardEntry[];
  initialWrikeTasks: WrikeTask[];
}) {
  const versions = [...entries].sort((a, b) =>
    b.version.publicationDate.localeCompare(a.version.publicationDate),
  );
  const [availableTasks, setAvailableTasks] = useState<WrikeTask[]>(initialWrikeTasks);
  const [selectedVersion, setSelectedVersion] = useState<{
    course: VersionBoardEntry["course"];
    version: CourseVersion;
  } | null>(null);
  const [sessionTaskIds, setSessionTaskIds] = useState<Record<string, string[]>>({});
  const [taskSearch, setTaskSearch] = useState("");
  const [linkMessage, setLinkMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/wrike/tasks?pageSize=12")
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { items?: WrikeTask[] };
      })
      .then((result) => {
        if (!cancelled && result?.items?.length) setAvailableTasks(result.items);
      })
      .catch(() => {
        // The deterministic fixtures remain visible when no live data link exists.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleTasks = useMemo(() => {
    const search = taskSearch.trim().toLowerCase();
    if (!search) return availableTasks;
    return availableTasks.filter((task) =>
      [task.externalTaskId, task.title, task.projectTitle ?? "", task.status ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(search),
    );
  }, [availableTasks, taskSearch]);

  const referenceTask = (task: WrikeTask) => {
    if (!selectedVersion) return;
    setSessionTaskIds((current) => ({
      ...current,
      [selectedVersion.version.id]: [
        ...new Set([
          ...(current[selectedVersion.version.id] ?? []),
          task.externalTaskId,
        ]),
      ],
    }));
    setLinkMessage(
      `${task.externalTaskId} is referenced by ${selectedVersion.course.courseCode} v${selectedVersion.version.versionNumber} in this sample session.`,
    );
  };

  const referencedVersionCount = versions.filter(
    ({ version }) => version.wrikeTaskReferences.length > 0,
  ).length;
  return (
    <WorkspaceFrame
      eyebrow="Lifecycle workspace"
      title="Versions"
      description="Create and maintain the authoritative course-version history inside CourseTrack."
      action={<StatusBadge tone="success">CourseTrack controlled</StatusBadge>}
    >
      <section className="version-governance-banner">
        <ShieldCheck size={22} />
        <div>
          <strong>CourseTrack is the version system of record</strong>
          <span>
            LMS versioning is not exposed to this app, so CourseTrack never infers,
            imports, or reconciles LMS version numbers. Wrike tasks provide work
            context only and never control the version number.
          </span>
        </div>
      </section>
      <MetricStrip
        metrics={[
          ["Version records", String(versions.length), "Historical records retained"],
          ["Current versions", String(versions.filter(({ version }) => version.isCurrent).length), "One app-controlled current version"],
          ["Wrike-referenced versions", String(referencedVersionCount), "Mock task context attached"],
          ["Unlinked versions", String(versions.length - referencedVersionCount), "No Wrike task required or selected"],
        ]}
      />
      <section className="panel">
        <div className="panel-heading">
          <div><h2>Recent version activity</h2><p>Newest CourseTrack-managed publication records</p></div>
          <StatusBadge tone="sample">Mock Wrike references</StatusBadge>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Course</th><th>Version</th><th>Type</th><th>Published</th><th>Wrike work</th><th>Maintained by</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {versions.slice(0, 14).map(({ course, version }) => (
                <tr key={version.id}>
                  <td><Link href={`/courses/${course.courseId}`} className="table-link">{course.courseTitle}</Link></td>
                  <td className="mono-cell">v{version.versionNumber}</td>
                  <td>{version.versionType}</td>
                  <td>{version.publicationDate}</td>
                  <td>
                    <VersionWrikeSummary
                      version={version}
                      sessionTaskIds={sessionTaskIds[version.id] ?? []}
                    />
                  </td>
                  <td><StatusBadge tone="success">{version.managedBy}</StatusBadge></td>
                  <td>{version.isCurrent ? <StatusBadge tone="success">Current</StatusBadge> : <StatusBadge>{version.versionStatus}</StatusBadge>}</td>
                  <td>
                    <button
                      className="version-link-button"
                      onClick={() => {
                        setSelectedVersion({ course, version });
                        setLinkMessage("");
                      }}
                    >
                      <Link2 size={14} /> Reference task
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel wrike-task-panel">
        <div className="panel-heading">
          <div>
            <h2>Available Wrike work</h2>
            <p>Read-only task discovery through the mock Wrike API boundary</p>
          </div>
          <StatusBadge tone="sample">Live link not configured</StatusBadge>
        </div>
        <div className="wrike-link-target">
          <ListTodo size={18} />
          {selectedVersion ? (
            <span>
              Referencing a task to <strong>{selectedVersion.course.courseCode} v{selectedVersion.version.versionNumber}</strong>
            </span>
          ) : (
            <span>Select <strong>Reference task</strong> on a version above.</span>
          )}
          <input
            type="search"
            value={taskSearch}
            onChange={(event) => setTaskSearch(event.target.value)}
            placeholder="Search sample Wrike work"
            aria-label="Search available Wrike tasks"
          />
        </div>
        {linkMessage && (
          <div className="inline-alert alert-success">
            <Link2 size={16} />
            <span><strong>Sample reference added</strong>{linkMessage}</span>
          </div>
        )}
        <div className="wrike-task-list">
          {visibleTasks.map((task) => {
            const existingIds = selectedVersion
              ? [
                  ...selectedVersion.version.wrikeTaskReferences.map((reference) => reference.wrikeTaskId),
                  ...(sessionTaskIds[selectedVersion.version.id] ?? []),
                ]
              : [];
            const alreadyLinked = existingIds.includes(task.externalTaskId);
            return (
              <article key={task.externalTaskId}>
                <div>
                  <span className="mono-cell">{task.externalTaskId}</span>
                  <StatusBadge>{task.status ?? "Status unavailable"}</StatusBadge>
                </div>
                <strong>{task.title}</strong>
                <p>{task.projectTitle ?? "No project supplied"}</p>
                <small>{task.assigneeNames.join(", ") || "Unassigned"} · Due {task.dueDate ?? "not supplied"}</small>
                <button
                  className="button button-secondary"
                  disabled={!selectedVersion || alreadyLinked}
                  onClick={() => referenceTask(task)}
                >
                  <Link2 size={14} /> {alreadyLinked ? "Referenced" : "Reference task"}
                </button>
              </article>
            );
          })}
        </div>
        <div className="readonly-callout">
          <ShieldCheck size={18} />
          <span>
            <strong>Read-only Wrike boundary</strong>
            CourseTrack may read and reference task details. It does not change Wrike tasks, and a task link never changes a CourseTrack version automatically. Sample links remain session-only until the production data link and database migration are authorized.
          </span>
        </div>
      </section>
    </WorkspaceFrame>
  );
}

function VersionWrikeSummary({
  version,
  sessionTaskIds,
}: {
  version: CourseVersion;
  sessionTaskIds: string[];
}) {
  const primary = version.wrikeTaskReferences[0];
  const total = version.wrikeTaskReferences.length + sessionTaskIds.length;
  if (!primary && total === 0) return <span className="wrike-empty">No task linked</span>;
  return (
    <span className="wrike-reference-summary">
      <strong>{primary?.taskTitle ?? sessionTaskIds[0]}</strong>
      <small>{primary?.projectTitle ?? "Sample session reference"}{total > 1 ? ` · +${total - 1} more` : ""}</small>
    </span>
  );
}

export function RevampWorkspace({ entries }: { entries: RevampBoardEntry[] }) {
  const proposals = entries;
  const columns = ["Submitted", "Under Review", "Approved", "In Progress"] as const;
  return (
    <WorkspaceFrame
      eyebrow="Portfolio planning"
      title="Revamp Planning"
      description="Prioritize modernization work without changing current LMS records."
      action={<button className="button button-primary"><Sparkles size={16} /> New proposal</button>}
    >
      <MetricStrip
        metrics={[
          ["Active proposals", String(proposals.length), "All proposal stages"],
          ["Awaiting review", String(proposals.filter(({ proposal }) => ["Submitted", "Under Review"].includes(proposal.status)).length), "Decision required"],
          ["Approved", String(proposals.filter(({ proposal }) => proposal.status === "Approved").length), "Ready for scheduling"],
          ["Average score", String(Math.round(proposals.reduce((sum, { proposal }) => sum + proposal.score, 0) / proposals.length)), "Weighted priority"],
        ]}
      />
      <section className="kanban-board" aria-label="Revamp proposal board">
        {columns.map((column) => {
          const items = proposals.filter(({ proposal }) => proposal.status === column);
          return (
            <div className="kanban-column" key={column}>
              <div className="kanban-heading"><strong>{column}</strong><span>{items.length}</span></div>
              {items.length === 0 ? (
                <div className="kanban-empty">No proposals in this stage.</div>
              ) : (
                items.map(({ course, proposal }) => (
                  <Link href={`/courses/${course.courseId}`} className="kanban-card" key={proposal.id}>
                    <div><StatusBadge tone={proposal.priority === "High" ? "warning" : "neutral"}>{proposal.priority}</StatusBadge><span>Score {proposal.score}</span></div>
                    <strong>{proposal.title}</strong>
                    <p>{course.primaryVertical}</p>
                    <small>Target {proposal.targetPublicationDate ?? "not scheduled"}</small>
                  </Link>
                ))
              )}
            </div>
          );
        })}
      </section>
    </WorkspaceFrame>
  );
}

export function FlagsWorkspace({ entries }: { entries: FlagBoardEntry[] }) {
  const [priority, setPriority] = useState("All priorities");
  const flags = entries;
  const filtered =
    priority === "All priorities"
      ? flags
      : flags.filter(({ flag }) => flag.priority === priority);
  return (
    <WorkspaceFrame
      eyebrow="Follow-up workspace"
      title="Flags & Follow-Up"
      description="Triage content, legal, accreditation, accessibility, and metadata issues."
      action={<button className="button button-primary"><Flag size={16} /> Create flag</button>}
    >
      <MetricStrip
        metrics={[
          ["Unresolved flags", String(flags.length), "Across sample courses"],
          ["Critical", String(flags.filter(({ flag }) => flag.priority === "Critical").length), "Owner required"],
          ["High priority", String(flags.filter(({ flag }) => flag.priority === "High").length), "Review this cycle"],
          ["Unassigned", String(flags.filter(({ flag }) => !flag.owner).length), "Ownership needed"],
        ]}
      />
      <section className="panel">
        <div className="panel-heading">
          <div><h2>Follow-up queue</h2><p>Open issues sorted for triage</p></div>
          <select className="select-control" value={priority} onChange={(event) => setPriority(event.target.value)}>
            <option>All priorities</option><option>Critical</option><option>High</option><option>Medium</option><option>Low</option>
          </select>
        </div>
        <div className="issue-list">
          {filtered.slice(0, 18).map(({ course, flag }) => (
            <Link href={`/courses/${course.courseId}`} key={flag.id}>
              <span className={`priority-dot priority-${flag.priority.toLowerCase()}`} />
              <div><strong>{flag.title}</strong><small>{course.courseTitle} · Due {flag.dueDate}</small></div>
              <span>{flag.owner ?? "Unassigned"}</span>
              <StatusBadge tone={flag.priority === "Critical" ? "danger" : flag.priority === "High" ? "warning" : "neutral"}>{flag.priority}</StatusBadge>
              <StatusBadge>{flag.status}</StatusBadge>
            </Link>
          ))}
        </div>
      </section>
    </WorkspaceFrame>
  );
}

function buildReportCatalog(metrics: PortfolioReportMetrics) {
  return [
    ["Complete Course Inventory", `${metrics.totalCourses.toLocaleString()} records`, "All course and source metadata"],
    ["Accreditation Expiration Report", `${metrics.coursesWithAccreditationExpiration.toLocaleString()} records`, "Courses with supplied accreditation expiration dates"],
    ["Courses Due for Review", `${metrics.coursesDueForReview.toLocaleString()} records`, "Upcoming and overdue review dates"],
    ["Revamp Proposal Pipeline", `${metrics.coursesWithRevampProposal.toLocaleString()} records`, "Status, score, priority, and schedule"],
    ["Open Flag Report", `${metrics.totalOpenFlags.toLocaleString()} records`, "Unresolved source conflicts and import issues"],
    ["Metadata Completeness", `${metrics.coursesBelowCompletenessThreshold.toLocaleString()} records`, "Courses below the 80% threshold"],
    ["LMS Retrieval Exceptions", `${metrics.coursesWithLmsRetrievalExceptions.toLocaleString()} records`, "Missing, warned, or unmapped LMS records"],
    ["Portfolio Health Report", `${metrics.totalCourses.toLocaleString()} records`, "Scores, factors, and recommended action"],
  ] as const;
}

export function ReportsWorkspace({ metrics }: { metrics: PortfolioReportMetrics }) {
  const reportCatalog = buildReportCatalog(metrics);
  const [message, setMessage] = useState("");
  const runReport = (name: string) => {
    setMessage(`${name} is ready in the sample workspace.`);
  };
  return (
    <WorkspaceFrame
      eyebrow="Reporting workspace"
      title="Reports"
      description="Run curated portfolio reports and export authorized results."
      action={<button className="button button-primary"><FileBarChart size={16} /> Build custom report</button>}
    >
      {message && <div className="inline-alert alert-success"><Check size={17} /><span><strong>Report ready</strong>{message}</span></div>}
      <section className="report-grid">
        {reportCatalog.map(([name, count, description], index) => (
          <article className="report-card" key={name}>
            <div className={`report-icon report-icon-${index % 4}`}><FileBarChart size={20} /></div>
            <div><strong>{name}</strong><p>{description}</p><small>{count}</small></div>
            <div className="report-actions">
              <button onClick={() => runReport(name)}>Run report <ArrowRight size={14} /></button>
              <button aria-label={`Download ${name}`}><Download size={15} /></button>
            </div>
          </article>
        ))}
      </section>
    </WorkspaceFrame>
  );
}

export function AdminWorkspace({
  sampleDataCounts,
  retrievalRuns,
  importPreview,
  wrikeConnection,
  wrikeSync,
}: {
  sampleDataCounts: SampleDataCounts;
  retrievalRuns: RetrievalRun[];
  importPreview: ImportPreviewSummary;
  wrikeConnection: WrikeConnectionSummary;
  wrikeSync: WrikeSyncStatus;
}) {
  const [activeTab, setActiveTab] = useState("LMS provider");
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(false);
  const tabs = ["LMS provider", "Wrike provider", "Sample data", "Import mapping", "Users & roles", "Retrieval history"];

  const runRetrieval = async (mode: "healthy" | "warnings" | "outage") => {
    setRunning(true);
    setStatus("");
    try {
      const response = await fetch("/api/lms/retrieve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const result = (await response.json()) as { message?: string };
      setStatus(result.message ?? "Retrieval run completed.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <WorkspaceFrame
      eyebrow="Configuration workspace"
      title="Administration"
      description="Manage providers, sample data, mappings, permissions, and system history."
    >
      {status && <div className="inline-alert alert-success"><ShieldCheck size={17} /><span><strong>Administration action complete</strong>{status}</span></div>}
      <div className="admin-layout">
        <nav className="admin-nav" aria-label="Administration sections">
          {tabs.map((tab) => <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab}</button>)}
        </nav>
        <section className="panel admin-panel">
          {activeTab === "LMS provider" && (
            <>
              <div className="panel-heading"><div><h2>Read-only LMS provider</h2><p>Provider configuration and health</p></div><StatusBadge tone="success">Mock LMS active</StatusBadge></div>
              <div className="provider-card">
                <div className="provider-mark">M</div>
                <div><strong>Mock LMS Provider</strong><span>Sample Data mode · Read-only contract</span></div>
                <StatusBadge tone="success">Available</StatusBadge>
              </div>
              <div className="readonly-callout"><ShieldCheck size={18} /><span><strong>Read-only enforcement</strong>No create, edit, publish, archive, assignment, enrollment, or deletion methods exist in the provider contract.</span></div>
              <div className="button-row">
                <button className="button button-primary" disabled={running} onClick={() => runRetrieval("healthy")}><RefreshCw size={16} className={running ? "spin" : ""} /> Retrieve sample data</button>
                <button className="button button-secondary" disabled={running} onClick={() => runRetrieval("warnings")}>Run with warnings</button>
                <button className="button button-danger-ghost" disabled={running} onClick={() => runRetrieval("outage")}>Simulate outage</button>
              </div>
              <div className="configuration-grid">
                <ConfigRow label="Live base URL" value="Not configured" />
                <ConfigRow label="Authentication" value="Awaiting documentation" />
                <ConfigRow label="Course endpoint" value="Not invented" />
                <ConfigRow label="Pagination" value="Awaiting documentation" />
              </div>
            </>
          )}
          {activeTab === "Wrike provider" && (
            <>
              <div className="panel-heading"><div><h2>Read-only Wrike provider</h2><p>Task discovery for CourseTrack-owned version records</p></div><StatusBadge tone="sample">Mock Wrike active</StatusBadge></div>
              <div className="provider-card">
                <div className="provider-mark">W</div>
                <div><strong>Mock Wrike Provider</strong><span>18 deterministic tasks · 5 sample projects · read-only contract</span></div>
                <StatusBadge tone="success">Available</StatusBadge>
              </div>
              <div className="readonly-callout"><ShieldCheck size={18} /><span><strong>Reference-only integration</strong>CourseTrack can discover task details and store an internal reference on a version. It cannot create, edit, complete, assign, or delete Wrike work.</span></div>
              <div className="configuration-grid">
                <ConfigRow label="Live base URL" value="Not configured" />
                <ConfigRow label="Authentication" value="Awaiting Wrike setup" />
                <ConfigRow label="Task and project fields" value="Awaiting documented payloads" />
                <ConfigRow label="Pagination and rate limits" value="Not assumed" />
              </div>
              <WrikeConnectionPanel initialConnection={wrikeConnection} initialSync={wrikeSync} />
            </>
          )}
          {activeTab === "Sample data" && (
            <>
              <div className="panel-heading"><div><h2>Sample data controls</h2><p>Generated from the supplied LMS, Content Metadata, and Topics workbooks</p></div><StatusBadge tone="sample">{sampleDataCounts.courses.toLocaleString()} sample courses</StatusBadge></div>
              <div className="sample-data-summary">
                <div><strong>{sampleDataCounts.courses.toLocaleString()}</strong><span>Courses</span></div><div><strong>{sampleDataCounts.versions.toLocaleString()}</strong><span>Versions</span></div><div><strong>{sampleDataCounts.accreditations.toLocaleString()}</strong><span>Accreditations</span></div><div><strong>{sampleDataCounts.flags.toLocaleString()}</strong><span>Flags</span></div>
              </div>
              <div className="readonly-callout"><AlertTriangle size={18} /><span><strong>Safe reset boundary</strong>Reset removes only records marked <code>is_sample</code>. Users, configuration, imports, audit records, and non-sample data are preserved.</span></div>
              <div className="button-row"><button className="button button-primary" onClick={() => setStatus("Sample data was regenerated from the deterministic seed.")}>Regenerate sample data</button><button className="button button-secondary" onClick={() => setStatus("Sample reset preview completed; no non-sample data would be removed.")}>Preview reset</button></div>
            </>
          )}
          {activeTab === "Import mapping" && (
            <ImportPreview importPreview={importPreview} />
          )}
          {activeTab === "Users & roles" && (
            <>
              <div className="panel-heading"><div><h2>Users and roles</h2><p>Server-enforced permission assignments</p></div><button className="button button-primary"><Users size={16} /> Invite user</button></div>
              <div className="profile-role-card"><span className="avatar">{demoUser.initials}</span><div><strong>{demoUser.name}</strong><small>{demoUser.email}</small></div><StatusBadge tone="info">{demoUser.role}</StatusBadge><span>{rolePermissions[demoUser.role].length} permissions</span></div>
            </>
          )}
          {activeTab === "Retrieval history" && (
            <>
              <div className="panel-heading"><div><h2>Retrieval history</h2><p>Immutable record of read-only LMS retrieval attempts</p></div></div>
              <div className="table-scroll"><table className="data-table"><thead><tr><th>Run</th><th>Status</th><th>Requested</th><th>Received</th><th>Failed</th><th>Message</th></tr></thead><tbody>{retrievalRuns.map((run) => <tr key={run.id}><td className="mono-cell">{run.id}</td><td><StatusBadge>{run.status}</StatusBadge></td><td>{run.recordsRequested}</td><td>{run.recordsReceived}</td><td>{run.recordsFailed}</td><td>{run.message}</td></tr>)}</tbody></table></div>
            </>
          )}
        </section>
      </div>
    </WorkspaceFrame>
  );
}

function WrikeConnectionPanel({
  initialConnection,
  initialSync,
}: {
  initialConnection: WrikeConnectionSummary;
  initialSync: WrikeSyncStatus;
}) {
  const [connection, setConnection] = useState(initialConnection);
  const [sync, setSync] = useState(initialSync);
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  const runAction = async (action: () => Promise<void>) => {
    setPending(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The Wrike request failed.");
    } finally {
      setPending(false);
    }
  };

  const handleConnect = () =>
    runAction(async () => {
      const response = await fetch("/api/wrike/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(token.trim() ? { token: token.trim() } : {}),
      });
      const result = (await response.json()) as { connection?: WrikeConnectionSummary; message?: string };
      if (!response.ok || !result.connection) throw new Error(result.message ?? "Could not connect to Wrike.");
      setConnection(result.connection);
      setToken("");
      setMessage(result.message ?? "Wrike connected.");
    });

  const handleDisconnect = () =>
    runAction(async () => {
      const response = await fetch("/api/wrike/disconnect", { method: "POST" });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "Could not disconnect Wrike.");
      setConnection({
        connected: false,
        apiHost: null,
        accountId: null,
        accountName: null,
        status: null,
        lastError: null,
        connectedByEmail: null,
        updatedAt: null,
      });
      setMessage(result.message ?? "Wrike disconnected.");
    });

  const handleHealthCheck = () =>
    runAction(async () => {
      const response = await fetch("/api/wrike/health");
      const result = (await response.json()) as { connection?: WrikeConnectionSummary; message?: string };
      if (!response.ok || !result.connection) throw new Error(result.message ?? "Health check failed.");
      setConnection(result.connection);
      setMessage(
        result.connection.status === "connected" ? "Wrike connection is healthy." : "Wrike connection reported an error.",
      );
    });

  const handleSyncNow = () =>
    runAction(async () => {
      const response = await fetch("/api/wrike/sync", { method: "POST" });
      const result = (await response.json()) as { run?: WrikeSyncStatus["lastRun"]; message?: string };
      if (!response.ok || !result.run) throw new Error(result.message ?? "The Wrike sync could not run.");
      const statusResponse = await fetch("/api/wrike/sync/status");
      if (statusResponse.ok) {
        setSync((await statusResponse.json()) as WrikeSyncStatus);
      }
      setMessage(`Sync ${result.run.status}: ${result.run.tasksUpserted} task(s) synchronized.`);
    });

  return (
    <div className="wrike-connection-panel">
      <div className="panel-heading">
        <div>
          <h2>Live Wrike connection</h2>
          <p>Permanent-token connection used to synchronize approved-folder tasks</p>
        </div>
        <StatusBadge tone={connection.connected ? "success" : "neutral"}>
          {connection.connected ? "Connected" : "Disconnected"}
        </StatusBadge>
      </div>
      {connection.connected ? (
        <div className="configuration-grid">
          <ConfigRow label="Account" value={connection.accountName ?? "Unknown"} />
          <ConfigRow label="API host" value={connection.apiHost ?? "Unknown"} />
          <ConfigRow label="Connected by" value={connection.connectedByEmail ?? "Unknown"} />
          <ConfigRow label="Status" value={connection.lastError ?? connection.status ?? "connected"} />
        </div>
      ) : (
        <div className="taxonomy-add-form">
          <input
            type="password"
            placeholder="Paste Wrike permanent access token…"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            disabled={pending}
          />
          <button type="button" className="button button-primary" disabled={pending} onClick={handleConnect}>
            Connect
          </button>
        </div>
      )}
      <div className="button-row">
        {connection.connected && (
          <>
            <button type="button" className="button button-secondary" disabled={pending} onClick={handleHealthCheck}>
              Check health
            </button>
            <button type="button" className="button button-secondary" disabled={pending} onClick={handleSyncNow}>
              Run sync now
            </button>
            <button type="button" className="button button-danger-ghost" disabled={pending} onClick={handleDisconnect}>
              Disconnect
            </button>
          </>
        )}
      </div>
      {message && <p className="taxonomy-editor-error">{message}</p>}

      <div className="panel-heading">
        <div>
          <h2>Sync status</h2>
          <p>{sync.isRunning ? "A sync is currently running." : "Approved-folder synchronization history"}</p>
        </div>
        {sync.lastRun && <StatusBadge>{sync.lastRun.status}</StatusBadge>}
      </div>
      {sync.lastRun ? (
        <div className="configuration-grid">
          <ConfigRow label="Last run" value={new Date(sync.lastRun.startedAt).toLocaleString()} />
          <ConfigRow label="Tasks synchronized" value={String(sync.lastRun.tasksUpserted)} />
          <ConfigRow
            label="Folders"
            value={`${sync.lastRun.foldersSucceeded}/${sync.lastRun.foldersAttempted} succeeded`}
          />
          <ConfigRow label="Marked inactive" value={String(sync.lastRun.tasksMarkedInactive)} />
        </div>
      ) : (
        <p className="empty-hint">No sync has run yet.</p>
      )}
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Folder</th>
              <th>Enabled</th>
              <th>Last sync</th>
              <th>Tasks</th>
              <th>Last error</th>
            </tr>
          </thead>
          <tbody>
            {sync.folders.map((folder) => (
              <tr key={folder.folderId}>
                <td>{folder.name}</td>
                <td>{folder.enabled ? "Yes" : "No"}</td>
                <td>{folder.lastSyncAt ? new Date(folder.lastSyncAt).toLocaleString() : "Never"}</td>
                <td>{folder.lastSyncTaskCount ?? "—"}</td>
                <td>{folder.lastSyncError ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ProfileWorkspace() {
  const [notifications, setNotifications] = useState({
    accreditation: true,
    review: true,
    assignments: true,
    retrieval: false,
  });
  return (
    <WorkspaceFrame
      eyebrow="Personal workspace"
      title="User Profile"
      description="Review your profile, access, and notification preferences."
    >
      <div className="profile-layout">
        <section className="panel profile-card-large">
          <span className="profile-avatar-large">{demoUser.initials}</span>
          <div><h2>{demoUser.name}</h2><p>{demoUser.email}</p><StatusBadge tone="info">{demoUser.role}</StatusBadge></div>
          <div className="profile-facts"><span><small>Department</small><strong>Learning Operations</strong></span><span><small>Vertical specialization</small><strong>Lexipol</strong></span><span><small>Last login</small><strong>Today at 1:42 PM</strong></span></div>
        </section>
        <section className="panel">
          <div className="panel-heading"><div><h2>Notification preferences</h2><p>Choose which events appear in your notification center</p></div></div>
          <div className="preference-list">
            {[
              ["accreditation", "Accreditation deadlines", "Renewal and expiration reminders"],
              ["review", "Course review dates", "Due and overdue review alerts"],
              ["assignments", "Assignments and mentions", "Flags, notes, and planning work"],
              ["retrieval", "LMS retrieval activity", "Warnings, failures, and mapping changes"],
            ].map(([key, label, description]) => (
              <label key={key}><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" checked={notifications[key as keyof typeof notifications]} onChange={(event) => setNotifications((current) => ({ ...current, [key]: event.target.checked }))} /></label>
            ))}
          </div>
        </section>
      </div>
    </WorkspaceFrame>
  );
}

export function TopicsTagsWorkspace({
  topics,
  tags,
  courseIndex,
}: {
  topics: TaxonomySummary[];
  tags: TaxonomySummary[];
  courseIndex: CourseIndexEntry[];
}) {
  const [kind, setKind] = useState<"topic" | "tag">("topic");
  const [topicItems, setTopicItems] = useState(topics);
  const [tagItems, setTagItems] = useState(tags);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [labelInput, setLabelInput] = useState("");
  const [assignedCourses, setAssignedCourses] = useState<TaxonomyCourseEntry[]>([]);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [courseSearch, setCourseSearch] = useState("");
  const [checkedCourseIds, setCheckedCourseIds] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  const items = kind === "topic" ? topicItems : tagItems;
  const endpoint = kind === "topic" ? "topics" : "tags";
  const filteredItems = items.filter(
    (item) => !search || item.label.toLowerCase().includes(search.toLowerCase()),
  );

  const resetSelection = () => {
    setSelectedId(null);
    setLabelInput("");
    setAssignedCourses([]);
    setCheckedCourseIds(new Set());
    setMessage("");
  };

  const loadCourses = async (id: string) => {
    setLoadingCourses(true);
    try {
      const response = await fetch(`/api/${endpoint}/${id}/courses`);
      const result = (await response.json()) as { courses?: TaxonomyCourseEntry[] };
      setAssignedCourses(result.courses ?? []);
    } finally {
      setLoadingCourses(false);
    }
  };

  const selectItem = (item: TaxonomySummary) => {
    setSelectedId(item.id);
    setLabelInput(item.label);
    setCheckedCourseIds(new Set());
    setMessage("");
    void loadCourses(item.id);
  };

  const assignedCourseIds = new Set(assignedCourses.map((entry) => entry.courseId));
  const pickerCourses = courseIndex
    .filter((course) => !assignedCourseIds.has(course.id))
    .filter(
      (course) =>
        !courseSearch ||
        `${course.title} ${course.courseCode}`.toLowerCase().includes(courseSearch.toLowerCase()),
    )
    .slice(0, 50);

  const toggleCourse = (id: string) => {
    setCheckedCourseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAssign = async () => {
    const label = labelInput.trim();
    if (!label || checkedCourseIds.size === 0) return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/${endpoint}/${selectedId ?? "new"}/courses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label, courseIds: Array.from(checkedCourseIds) }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "Could not assign courses.");
      setMessage(result.message ?? "Courses assigned.");
      setCheckedCourseIds(new Set());

      const refreshed = (await fetch(`/api/${endpoint}`).then((r) => r.json())) as {
        topics?: TaxonomySummary[];
        tags?: TaxonomySummary[];
      };
      const refreshedList = (kind === "topic" ? refreshed.topics : refreshed.tags) ?? [];
      if (kind === "topic") setTopicItems(refreshedList);
      else setTagItems(refreshedList);

      const match = refreshedList.find((item) => item.label.toLowerCase() === label.toLowerCase());
      if (match) {
        setSelectedId(match.id);
        await loadCourses(match.id);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not assign courses.");
    } finally {
      setPending(false);
    }
  };

  const handleRemove = async (assignmentId: string) => {
    if (!selectedId) return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/${endpoint}/${selectedId}/courses`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignmentIds: [assignmentId] }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "Could not remove this course.");
      setAssignedCourses((prev) => prev.filter((entry) => entry.assignmentId !== assignmentId));
      setMessage(result.message ?? "Course removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove this course.");
    } finally {
      setPending(false);
    }
  };

  return (
    <WorkspaceFrame
      eyebrow="Taxonomy workspace"
      title="Topics & Tags"
      description="Manually associate courses with topics and tags — this data is CourseTrack-owned since the LMS does not report it."
    >
      <MetricStrip
        metrics={[
          ["Topics", String(topicItems.length), "Distinct topic labels"],
          ["Tags", String(tagItems.length), "Distinct tag labels"],
          ["In focus", selectedId ? labelInput : "None", kind === "topic" ? "Topic selected" : "Tag selected"],
        ]}
      />
      <section className="panel taxonomy-workspace-grid">
        <div className="taxonomy-list-pane">
          <div className="taxonomy-kind-toggle">
            <button
              type="button"
              className={kind === "topic" ? "button button-secondary active" : "button button-secondary"}
              onClick={() => {
                setKind("topic");
                resetSelection();
              }}
            >
              Topics
            </button>
            <button
              type="button"
              className={kind === "tag" ? "button button-secondary active" : "button button-secondary"}
              onClick={() => {
                setKind("tag");
                resetSelection();
              }}
            >
              Tags
            </button>
          </div>
          <input
            type="text"
            className="taxonomy-search"
            placeholder={`Search ${kind}s…`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <ul className="taxonomy-item-list">
            {filteredItems.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={item.id === selectedId ? "taxonomy-item active" : "taxonomy-item"}
                  onClick={() => selectItem(item)}
                >
                  <span>{item.label}</span>
                  <StatusBadge tone="neutral">{item.courseCount}</StatusBadge>
                </button>
              </li>
            ))}
            {filteredItems.length === 0 && <li className="empty-hint">No {kind}s match this search.</li>}
          </ul>
        </div>
        <div className="taxonomy-detail-pane">
          <label className="taxonomy-label-field">
            <span>{selectedId ? "Editing" : "New topic / tag label"}</span>
            <input
              type="text"
              value={labelInput}
              onChange={(event) => setLabelInput(event.target.value)}
              placeholder={`Type a ${kind} label to create or edit…`}
            />
          </label>

          {selectedId && (
            <div className="taxonomy-assigned-courses">
              <h3>Assigned courses</h3>
              {loadingCourses ? (
                <p>Loading…</p>
              ) : assignedCourses.length === 0 ? (
                <p className="empty-hint">No courses assigned yet.</p>
              ) : (
                <ul>
                  {assignedCourses.map((entry) => (
                    <li key={entry.assignmentId}>
                      <Link href={`/courses/${entry.courseId}`} className="table-link">
                        {entry.title}
                      </Link>
                      <span className="mono-cell">{entry.courseCode}</span>
                      <button type="button" onClick={() => handleRemove(entry.assignmentId)} disabled={pending}>
                        <X size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="taxonomy-course-picker">
            <h3>Add courses</h3>
            <input
              type="text"
              placeholder="Search courses by title or code…"
              value={courseSearch}
              onChange={(event) => setCourseSearch(event.target.value)}
            />
            <ul className="taxonomy-course-picker-list">
              {pickerCourses.map((course) => (
                <li key={course.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={checkedCourseIds.has(course.id)}
                      onChange={() => toggleCourse(course.id)}
                    />
                    {course.title} <span className="mono-cell">{course.courseCode}</span>
                  </label>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="button button-primary"
              disabled={pending || !labelInput.trim() || checkedCourseIds.size === 0}
              onClick={handleAssign}
            >
              Add {checkedCourseIds.size || ""} course{checkedCourseIds.size === 1 ? "" : "s"} to &ldquo;
              {labelInput.trim() || "…"}
              &rdquo;
            </button>
            {message && <p className="taxonomy-editor-error">{message}</p>}
          </div>
        </div>
      </section>
    </WorkspaceFrame>
  );
}

function WorkspaceFrame({
  eyebrow,
  title,
  description,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="page-stack">
      <section className="page-heading">
        <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
        {action && <div className="heading-actions">{action}</div>}
      </section>
      {children}
    </div>
  );
}

function MetricStrip({ metrics }: { metrics: [string, string, string][] }) {
  return (
    <section className="metric-strip">
      {metrics.map(([label, value, detail]) => (
        <article key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>
      ))}
    </section>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}
