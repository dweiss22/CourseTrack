"use client";

import {
  AlertTriangle,
  ArrowRight,
  Award,
  Check,
  Download,
  FileBarChart,
  Flag,
  History,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  sampleCourses,
  sampleRetrievalRuns,
} from "@/lib/sample-data";
import { demoUser, rolePermissions } from "@/lib/permissions";
import { StatusBadge } from "./status-badge";

export function AccreditationWorkspace() {
  const records = sampleCourses.flatMap((course) =>
    course.accreditations.map((record) => ({ course, record })),
  );
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
                    <td><Link href={`/courses/${course.id}`} className="table-link">{course.title}</Link></td>
                    <td>{record.organization}</td>
                    <td>{record.jurisdiction}</td>
                    <td><StatusBadge>{record.status}</StatusBadge></td>
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

export function VersionsWorkspace() {
  const versions = sampleCourses
    .flatMap((course) =>
      course.versions.map((version) => ({ course, version })),
    )
    .sort((a, b) =>
      b.version.publicationDate.localeCompare(a.version.publicationDate),
    );
  return (
    <WorkspaceFrame
      eyebrow="Lifecycle workspace"
      title="Versions"
      description="Review current releases, historical versions, and major-revision activity."
      action={<button className="button button-secondary"><History size={16} /> Compare versions</button>}
    >
      <MetricStrip
        metrics={[
          ["Version records", String(versions.length), "Historical records retained"],
          ["Current versions", "64", "One per sample course"],
          ["Major revisions", String(versions.filter(({ version }) => version.versionType === "Major Revision").length), "Across all years"],
          ["Accreditation review", "8", "Version changed after approval"],
        ]}
      />
      <section className="panel">
        <div className="panel-heading">
          <div><h2>Recent version activity</h2><p>Newest publication records across the portfolio</p></div>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Course</th><th>Version</th><th>Type</th><th>Published</th><th>Authoring tool</th><th>Source</th><th>Current</th></tr></thead>
            <tbody>
              {versions.slice(0, 14).map(({ course, version }) => (
                <tr key={version.id}>
                  <td><Link href={`/courses/${course.id}`} className="table-link">{course.title}</Link></td>
                  <td className="mono-cell">v{version.versionNumber}</td>
                  <td>{version.versionType}</td>
                  <td>{version.publicationDate}</td>
                  <td>{version.authoringTool}</td>
                  <td><StatusBadge tone={version.source === "lms" ? "info" : "neutral"}>{version.source.toUpperCase()}</StatusBadge></td>
                  <td>{version.isCurrent ? <StatusBadge tone="success">Current</StatusBadge> : "Historical"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </WorkspaceFrame>
  );
}

export function RevampWorkspace() {
  const proposals = sampleCourses
    .filter((course) => course.revampProposal)
    .map((course) => ({ course, proposal: course.revampProposal! }));
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
                  <Link href={`/courses/${course.id}`} className="kanban-card" key={proposal.id}>
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

export function FlagsWorkspace() {
  const [priority, setPriority] = useState("All priorities");
  const flags = sampleCourses.flatMap((course) =>
    course.flags.map((flag) => ({ course, flag })),
  );
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
            <Link href={`/courses/${course.id}`} key={flag.id}>
              <span className={`priority-dot priority-${flag.priority.toLowerCase()}`} />
              <div><strong>{flag.title}</strong><small>{course.title} · Due {flag.dueDate}</small></div>
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

const reportCatalog = [
  ["Complete Course Inventory", "64 records", "All course and source metadata"],
  ["Accreditation Expiration Report", "16 records", "Approvals expiring within 180 days"],
  ["Courses Due for Review", "24 records", "Upcoming and overdue review dates"],
  ["Revamp Proposal Pipeline", "22 records", "Status, score, priority, and schedule"],
  ["Critical Flag Report", "6 records", "Critical unresolved follow-up items"],
  ["Metadata Completeness", "16 records", "Courses below the 80% threshold"],
  ["LMS Retrieval Exceptions", "16 records", "Stale, failed, or unmapped records"],
  ["Portfolio Health Report", "64 records", "Scores, factors, and recommended action"],
];

export function ReportsWorkspace() {
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

export function AdminWorkspace() {
  const [activeTab, setActiveTab] = useState("LMS provider");
  const [status, setStatus] = useState("");
  const [running, setRunning] = useState(false);
  const tabs = ["LMS provider", "Sample data", "Import mapping", "Users & roles", "Retrieval history"];

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
          {activeTab === "Sample data" && (
            <>
              <div className="panel-heading"><div><h2>Sample data controls</h2><p>Deterministic seed: COURsetrack-2026-01</p></div><StatusBadge tone="sample">64 sample courses</StatusBadge></div>
              <div className="sample-data-summary">
                <div><strong>64</strong><span>Courses</span></div><div><strong>160</strong><span>Versions</span></div><div><strong>48</strong><span>Accreditations</span></div><div><strong>120</strong><span>Flags</span></div>
              </div>
              <div className="readonly-callout"><AlertTriangle size={18} /><span><strong>Safe reset boundary</strong>Reset removes only records marked <code>is_sample</code>. Users, configuration, imports, audit records, and non-sample data are preserved.</span></div>
              <div className="button-row"><button className="button button-primary" onClick={() => setStatus("Sample data was regenerated from the deterministic seed.")}>Regenerate sample data</button><button className="button button-secondary" onClick={() => setStatus("Sample reset preview completed; no non-sample data would be removed.")}>Preview reset</button></div>
            </>
          )}
          {activeTab === "Import mapping" && (
            <>
              <div className="panel-heading"><div><h2>Existing Excel export mapping</h2><p>Source: all_courses_20260715073414 (1).xlsx</p></div><StatusBadge tone="info">16,545 source rows</StatusBadge></div>
              <div className="mapping-table">
                {[
                  ["Course ID", "lms_course_id", "LMS", "Direct"],
                  ["Course Name", "title", "LMS", "Direct"],
                  ["Course Description", "description", "LMS", "Direct"],
                  ["Duration", "duration_minutes", "LMS", "Convert hours"],
                  ["Public Topics", "course_topics", "Import", "Split / map"],
                  ["Sites", "lms_availability", "LMS", "Split values"],
                  ["Last Revision Date", "last_major_revision_date", "LMS", "Parse date"],
                  ["Accreditation End Date", "expiration_date", "LMS", "Parse date"],
                ].map(([source, target, provenance, transform]) => (
                  <div key={source}><span>{source}</span><ArrowRight size={14} /><strong>{target}</strong><StatusBadge tone={provenance === "LMS" ? "info" : "neutral"}>{provenance}</StatusBadge><small>{transform}</small></div>
                ))}
              </div>
              <button className="button button-primary"><Upload size={16} /> Start import preview</button>
            </>
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
              <div className="table-scroll"><table className="data-table"><thead><tr><th>Run</th><th>Status</th><th>Requested</th><th>Received</th><th>Failed</th><th>Message</th></tr></thead><tbody>{sampleRetrievalRuns.map((run) => <tr key={run.id}><td className="mono-cell">{run.id}</td><td><StatusBadge>{run.status}</StatusBadge></td><td>{run.recordsRequested}</td><td>{run.recordsReceived}</td><td>{run.recordsFailed}</td><td>{run.message}</td></tr>)}</tbody></table></div>
            </>
          )}
        </section>
      </div>
    </WorkspaceFrame>
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
          <div className="profile-facts"><span><small>Department</small><strong>Learning Operations</strong></span><span><small>Vertical specialization</small><strong>Cross-Vertical</strong></span><span><small>Last login</small><strong>Today at 1:42 PM</strong></span></div>
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
