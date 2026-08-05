"use client";

import {
  AlertTriangle,
  ArrowRight,
  Award,
  BookOpen,
  Check,
  Download,
  FileBarChart,
  Flag,
  GripVertical,
  Link2,
  ListTodo,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { AuthContext } from "@/lib/auth";
import { APPLICATION_ROLES, type ApplicationRole } from "@/lib/roles";
import { accreditationRiskLabels, assessAccreditationHistory } from "@/lib/accreditation-grouping";
import type {
  AccreditationBoardEntry,
  ApplicationUserSummary,
  CourseIndexEntry,
  FlagBoardEntry,
  PortfolioReportMetrics,
  RevampBoardEntry,
  TaxonomyCourseEntry,
  TaxonomySummary,
  VersionBoardEntry,
  WrikeConnectionSummary,
  WrikeSyncStatus,
} from "@/db";
import { StatusBadge } from "./status-badge";
import type { IntegrationMappingSummary } from "@/types/integrations";
import type { CourseVersion, RetrievalRun } from "@/types/course";
import { accreditationOptionalColumns, DEFAULT_ACCREDITATION_TABLE_PREFERENCES, DEFAULT_VERSIONS_TABLE_PREFERENCES, versionsOptionalColumns, type AccreditationTablePreferences, type VersionsTablePreferences } from "@/types/preferences";
import type { WrikeTask } from "@/providers/wrike";
import { AsyncCourseSelect } from "./async-course-select";

function initialsFor(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function AccreditationWorkspaceLegacy({ entries, courseOptions }: { entries: AccreditationBoardEntry[]; courseOptions: CourseIndexEntry[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [risk, setRisk] = useState(searchParams.get("risk") ?? "");
  const [organization, setOrganization] = useState(searchParams.get("organization") ?? "");
  const [jurisdiction, setJurisdiction] = useState(searchParams.get("jurisdiction") ?? "");
  const [query, setQuery] = useState(searchParams.get("course") ?? "");
  const [sort, setSort] = useState(searchParams.get("sort") ?? "urgency");
  const [editing, setEditing] = useState<AccreditationBoardEntry | "new" | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (risk) params.set("risk", risk); if (organization) params.set("organization", organization);
    if (jurisdiction) params.set("jurisdiction", jurisdiction); if (query) params.set("course", query);
    if (sort !== "urgency") params.set("sort", sort);
    router.replace(params.size ? `/accreditation?${params}` : "/accreditation", { scroll: false });
  }, [jurisdiction, organization, query, risk, router, sort]);

  const assessed = useMemo(() => {
    const byCourse = new Map<string, AccreditationBoardEntry[]>();
    for (const entry of entries) byCourse.set(entry.course.courseId, [...(byCourse.get(entry.course.courseId) ?? []), entry]);
    return Array.from(byCourse).flatMap(([courseId, courseEntries]) => assessAccreditationHistory(courseEntries.map(({ record }) => record), { courseKey: courseId }).flatMap((group) => [group.summary, ...group.history].map((item) => ({
      assessed: item, group, entry: courseEntries.find(({ record }) => record.id === item.record.id)!,
    }))));
  }, [entries]);
  const organizations = Array.from(new Set(entries.map(({ record }) => record.organization))).sort();
  const jurisdictions = Array.from(new Set(entries.map(({ record }) => record.jurisdiction))).sort();
  const urgency: Record<string, number> = { expired: 0, renewal_due: 1, conditional: 2, expiring_soon: 3, renewal_submitted: 4, undated: 5, active: 6, future: 7, not_required: 8 };
  const visible = assessed.filter(({ assessed: item, entry }) => (!risk || item.riskState === risk) && (!organization || entry.record.organization === organization) && (!jurisdiction || entry.record.jurisdiction === jurisdiction) && (!query || `${entry.course.courseCode} ${entry.course.courseTitle}`.toLowerCase().includes(query.toLowerCase()))).sort((a, b) => sort === "expiration" ? (a.entry.record.expirationDate ?? "9999").localeCompare(b.entry.record.expirationDate ?? "9999") : urgency[a.assessed.riskState] - urgency[b.assessed.riskState] || (a.entry.record.expirationDate ?? "9999").localeCompare(b.entry.record.expirationDate ?? "9999"));

  const saveRecord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const current = editing === "new" ? null : editing;
    const courseId = String(form.get("courseId"));
    const payload = { organization: String(form.get("organization")), jurisdiction: String(form.get("jurisdiction")), status: String(form.get("status")), approvalNumber: String(form.get("approvalNumber")) || null, creditHours: Number(form.get("creditHours")), effectiveDate: String(form.get("effectiveDate")) || null, expirationDate: String(form.get("expirationDate")) || null, expectedUpdatedAt: current?.record.updatedAt };
    setPending(true); setMessage("");
    try {
      const response = await fetch(current ? `/api/accreditations/${current.record.id}` : `/api/courses/${courseId}/accreditations`, { method: current ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = (await response.json()) as { message?: string }; if (!response.ok) throw new Error(result.message);
      setMessage(result.message ?? "Accreditation record saved."); setEditing(null); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Record could not be saved."); }
    finally { setPending(false); }
  };
  const archiveRecord = async (entry: AccreditationBoardEntry) => {
    if (!window.confirm(`Archive ${entry.record.organization} accreditation record?`)) return;
    setPending(true); try { const response = await fetch(`/api/accreditations/${entry.record.id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: entry.record.updatedAt }) }); const result = (await response.json()) as { message?: string }; if (!response.ok) throw new Error(result.message); setMessage(result.message ?? "Record archived."); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Record could not be archived."); } finally { setPending(false); }
  };
  const clearFilters = () => { setRisk(""); setOrganization(""); setJurisdiction(""); setQuery(""); setSort("urgency"); };
  const activeFilters = [["Risk", risk], ["Organization", organization], ["Jurisdiction", jurisdiction], ["Course", query]].filter(([, value]) => value);

  return <WorkspaceFrame eyebrow="Compliance workspace" title="Accreditation" description="One deterministic risk assessment powers every accreditation view." action={<button className="button button-primary" disabled={courseOptions.length === 0} onClick={() => setEditing("new")}><Award size={16} /> Add record</button>}>
    <MetricStrip metrics={[["History records", String(entries.length), "Active application records"], ["Current risks", String(assessed.filter(({ assessed: item }) => item.historyRole === "current" && item.isAtRisk).length), "Current records requiring action"], ["Future", String(assessed.filter(({ assessed: item }) => item.historyRole === "future").length), "Not currently authoritative"], ["Duplicates", String(assessed.filter(({ assessed: item }) => item.historyRole === "duplicate").length), "Equivalent history rows"]]} />
    {message && <div className="inline-alert" role="status"><ShieldCheck size={17} /><span>{message}</span></div>}
    {editing && <form className="panel workflow-form" onSubmit={saveRecord}><div className="panel-heading"><div><h2>{editing === "new" ? "Add accreditation record" : "Edit accreditation record"}</h2><p>Equivalent rows are retained and labeled as duplicates.</p></div><button type="button" className="icon-action" aria-label="Cancel accreditation editing" onClick={() => setEditing(null)}><X size={18} /></button></div><div className="form-grid"><label>Course<select name="courseId" disabled={editing !== "new"} defaultValue={editing === "new" ? courseOptions[0]?.id : editing.course.courseId}>{courseOptions.map((course) => <option key={course.id} value={course.id}>{course.courseCode} — {course.title}</option>)}</select></label><label>Organization<input name="organization" required minLength={2} defaultValue={editing === "new" ? "" : editing.record.organization} /></label><label>Jurisdiction<input name="jurisdiction" required defaultValue={editing === "new" ? "National" : editing.record.jurisdiction} /></label><label>Status<select name="status" defaultValue={editing === "new" ? "Approved" : editing.record.status}>{["Approved", "Approved with Conditions", "Renewal Due", "Renewal Submitted", "Expiring Soon", "Expired", "Not Required"].map((value) => <option key={value}>{value}</option>)}</select></label><label>Approval number<input name="approvalNumber" defaultValue={editing === "new" ? "" : editing.record.approvalNumber ?? ""} /></label><label>Credit hours<input name="creditHours" type="number" min={0} step="0.25" defaultValue={editing === "new" ? 0 : editing.record.creditHours} /></label><label>Effective date<input name="effectiveDate" type="date" defaultValue={editing === "new" ? "" : editing.record.effectiveDate ?? ""} /></label><label>Expiration date<input name="expirationDate" type="date" defaultValue={editing === "new" ? "" : editing.record.expirationDate ?? ""} /></label></div><div className="button-row"><button type="button" className="button button-secondary" onClick={() => setEditing(null)}>Cancel</button><button className="button button-primary" disabled={pending}>{pending ? "Saving…" : "Save record"}</button></div></form>}
    <section className="panel"><div className="panel-heading"><div><h2>Accreditation risk queue</h2><p>Current, future, superseded, and duplicate history are explicitly labeled.</p></div><StatusBadge tone="warning">{visible.filter(({ assessed: item }) => item.isAtRisk).length} at risk</StatusBadge></div>
      <div className="filter-grid"><label>Course<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Code or title" /></label><label>Risk<select value={risk} onChange={(event) => setRisk(event.target.value)}><option value="">All risk states</option>{Object.entries(accreditationRiskLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Organization<select value={organization} onChange={(event) => setOrganization(event.target.value)}><option value="">All organizations</option>{organizations.map((value) => <option key={value}>{value}</option>)}</select></label><label>Jurisdiction<select value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)}><option value="">All jurisdictions</option>{jurisdictions.map((value) => <option key={value}>{value}</option>)}</select></label><label>Sort<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="urgency">Urgency</option><option value="expiration">Expiration date</option></select></label></div>
      {activeFilters.length > 0 && <div className="filter-chips" aria-label="Active filters">{activeFilters.map(([label, value]) => <span key={label}>{label}: {value}</span>)}<button onClick={clearFilters}>Clear all</button></div>}
      {visible.length === 0 ? <div className="empty-state"><Award size={24} /><h3>No matching accreditation records</h3><p>Clear filters or add an application-owned record.</p></div> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Course</th><th>Organization</th><th>Jurisdiction</th><th>Risk</th><th>History role</th><th>Effective</th><th>Expiration</th><th>Actions</th></tr></thead><tbody>{visible.map(({ entry, assessed: item }) => <tr key={entry.record.id}><td><Link className="table-link" href={`/courses/${entry.course.courseId}`}>{entry.course.courseTitle}</Link></td><td>{entry.record.organization}</td><td>{entry.record.jurisdiction}</td><td><StatusBadge>{accreditationRiskLabels[item.riskState]}</StatusBadge></td><td><StatusBadge tone={item.historyRole === "current" ? "success" : item.historyRole === "future" ? "info" : "neutral"}>{item.historyRole[0].toUpperCase() + item.historyRole.slice(1)}</StatusBadge></td><td>{entry.record.effectiveDate ?? "Undated"}</td><td>{entry.record.expirationDate ?? "Undated"}</td><td><div className="table-actions"><button onClick={() => setEditing(entry)}>Edit</button><button disabled={pending} onClick={() => archiveRecord(entry)}>Archive</button></div></td></tr>)}</tbody></table></div>}
    </section>
  </WorkspaceFrame>;
}

void AccreditationWorkspaceLegacy;

const accreditationColumnLabels: Record<(typeof accreditationOptionalColumns)[number], string> = {
  organization: "Organization", jurisdiction: "Jurisdiction", status: "Status", historyRole: "History Role",
  effective: "Effective", expiration: "Expiration", source: "Source",
};

export function AccreditationWorkspace({ entries, initialPreferences }: { entries: AccreditationBoardEntry[]; initialPreferences: AccreditationTablePreferences }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [risk, setRisk] = useState(searchParams.get("risk") ?? "");
  const [organization, setOrganization] = useState(searchParams.get("organization") ?? "");
  const [jurisdiction, setJurisdiction] = useState(searchParams.get("jurisdiction") ?? "");
  const [query, setQuery] = useState(searchParams.get("course") ?? "");
  const [sort, setSort] = useState(searchParams.get("sort") ?? "urgency");
  const [editing, setEditing] = useState<AccreditationBoardEntry | "new" | null>(null);
  const [expandedCourse, setExpandedCourse] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState(initialPreferences.visibleColumns);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (risk) params.set("risk", risk); if (organization) params.set("organization", organization); if (jurisdiction) params.set("jurisdiction", jurisdiction); if (query) params.set("course", query); if (sort !== "urgency") params.set("sort", sort);
    router.replace(params.size ? `/accreditation?${params}` : "/accreditation", { scroll: false });
  }, [jurisdiction, organization, query, risk, router, sort]);

  const assessedCourses = useMemo(() => {
    const byCourse = new Map<string, AccreditationBoardEntry[]>();
    for (const entry of entries) byCourse.set(entry.course.courseId, [...(byCourse.get(entry.course.courseId) ?? []), entry]);
    return Array.from(byCourse.entries()).map(([courseId, courseEntries]) => {
      const groups = assessAccreditationHistory(courseEntries.map(({ record }) => record), { courseKey: courseId });
      const currentRecords = groups.flatMap((group) => group.current ? [group.current] : []);
      const isAtRisk = groups.some((group) => group.isAtRisk);
      const riskState = groups.find((group) => group.isAtRisk)?.riskState ?? groups[0]?.riskState ?? "future";
      const expiration = currentRecords.map((item) => item.record.expirationDate).filter((value): value is string => Boolean(value)).sort()[0] ?? null;
      return { course: courseEntries[0].course, entries: courseEntries, groups, currentRecords, isAtRisk, riskState, expiration };
    });
  }, [entries]);

  const organizations = Array.from(new Set(entries.map(({ record }) => record.organization))).sort();
  const jurisdictions = Array.from(new Set(entries.map(({ record }) => record.jurisdiction))).sort();
  const urgency: Record<string, number> = { expired: 0, expiring_soon: 1, active: 2, renewal_due: 3, conditional: 4, renewal_submitted: 5, undated: 6, future: 7, not_required: 8 };
  const visible = assessedCourses.filter((item) =>
    (!risk || item.groups.some((group) => group.riskState === risk))
    && (!organization || item.groups.some((group) => group.organization === organization))
    && (!jurisdiction || item.groups.some((group) => group.jurisdiction === jurisdiction))
    && (!query || `${item.course.courseCode} ${item.course.courseTitle}`.toLowerCase().includes(query.toLowerCase())),
  ).sort((a, b) => sort === "expiration" ? (a.expiration ?? "9999").localeCompare(b.expiration ?? "9999") : urgency[a.riskState] - urgency[b.riskState] || (a.expiration ?? "9999").localeCompare(b.expiration ?? "9999"));

  const saveColumns = async (next: AccreditationTablePreferences["visibleColumns"]) => {
    setVisibleColumns(next);
    const response = await fetch("/api/preferences/accreditation", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ visibleColumns: next }) });
    if (!response.ok) setMessage("Column preferences could not be saved.");
  };
  const show = (column: (typeof accreditationOptionalColumns)[number]) => visibleColumns.includes(column);
  const clearFilters = () => { setRisk(""); setOrganization(""); setJurisdiction(""); setQuery(""); setSort("urgency"); };
  const activeFilters = [["Risk", risk], ["Organization", organization], ["Jurisdiction", jurisdiction], ["Course", query]].filter(([, value]) => value);

  const saveRecord = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const current = editing === "new" ? null : editing; const courseId = String(form.get("courseId"));
    const payload = { organization: String(form.get("organization")), jurisdiction: String(form.get("jurisdiction")), status: String(form.get("status")), approvalNumber: String(form.get("approvalNumber")) || null, creditHours: Number(form.get("creditHours")), effectiveDate: String(form.get("effectiveDate")) || null, expirationDate: String(form.get("expirationDate")) || null, expectedUpdatedAt: current?.record.updatedAt };
    setPending(true); setMessage("");
    try { const response = await fetch(current ? `/api/accreditations/${current.record.id}` : `/api/courses/${courseId}/accreditations`, { method: current ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); const result = await response.json() as { message?: string }; if (!response.ok) throw new Error(result.message); setMessage(result.message ?? "Accreditation record saved."); setEditing(null); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Record could not be saved."); } finally { setPending(false); }
  };
  const archiveRecord = async (entry: AccreditationBoardEntry) => {
    if (!window.confirm(`Archive ${entry.record.organization} accreditation record?`)) return; setPending(true);
    try { const response = await fetch(`/api/accreditations/${entry.record.id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: entry.record.updatedAt }) }); const result = await response.json() as { message?: string }; if (!response.ok) throw new Error(result.message); setMessage(result.message ?? "Record archived."); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Record could not be archived."); } finally { setPending(false); }
  };

  return <WorkspaceFrame eyebrow="Compliance workspace" title="Accreditation" description="One parent row per course with organization and jurisdiction history underneath." action={<button className="button button-primary" onClick={() => setEditing("new")}><Award size={16} /> Add record</button>}>
    <MetricStrip metrics={[["History records", String(entries.length), "Current and historical rows"], ["At-risk courses", String(assessedCourses.filter((item) => item.isAtRisk).length), "Distinct courses requiring action"], ["Future records", String(assessedCourses.flatMap((item) => item.groups).filter((group) => group.summary.historyRole === "future").length), "Not yet effective"], ["Duplicate records", String(assessedCourses.flatMap((item) => item.groups).flatMap((group) => [group.summary, ...group.history]).filter((item) => item.historyRole === "duplicate").length), "Visible but excluded from risk"]]} />
    {message && <div className="inline-alert" role="status"><ShieldCheck size={17} /><span>{message}</span></div>}
    {editing && <form className="panel workflow-form" onSubmit={saveRecord}><div className="panel-heading"><div><h2>{editing === "new" ? "Add accreditation record" : "Edit accreditation record"}</h2><p>LMS imports are read-only; CourseTrack records remain editable.</p></div><button type="button" className="icon-action" aria-label="Cancel accreditation editing" onClick={() => setEditing(null)}><X size={18} /></button></div><div className="form-grid">{editing === "new" ? <AsyncCourseSelect /> : <label>Course<input disabled value={`${editing.course.courseCode} — ${editing.course.courseTitle}`} /><input type="hidden" name="courseId" value={editing.course.courseId} /></label>}<label>Organization<input name="organization" required minLength={2} defaultValue={editing === "new" ? "" : editing.record.organization} /></label><label>Jurisdiction<input name="jurisdiction" required defaultValue={editing === "new" ? "National" : editing.record.jurisdiction} /></label><label>Status<select name="status" defaultValue={editing === "new" ? "Approved" : editing.record.status}>{["Approved", "Approved with Conditions", "Renewal Due", "Renewal Submitted", "Expiring Soon", "Expired", "Not Required"].map((value) => <option key={value}>{value}</option>)}</select></label><label>Approval number<input name="approvalNumber" defaultValue={editing === "new" ? "" : editing.record.approvalNumber ?? ""} /></label><label>Credit hours<input name="creditHours" type="number" min={0} step="0.25" defaultValue={editing === "new" ? 0 : editing.record.creditHours} /></label><label>Effective date<input name="effectiveDate" type="date" defaultValue={editing === "new" ? "" : editing.record.effectiveDate ?? ""} /></label><label>Expiration date<input name="expirationDate" type="date" defaultValue={editing === "new" ? "" : editing.record.expirationDate ?? ""} /></label></div><div className="button-row"><button type="button" className="button button-secondary" onClick={() => setEditing(null)}>Cancel</button><button className="button button-primary" disabled={pending}>{pending ? "Saving…" : "Save record"}</button></div></form>}
    <section className="panel accreditation-queue"><div className="panel-heading"><div><h2>Accreditation risk queue</h2><p>Only expired or expiring current groups without an effective replacement count as risk.</p></div><div className="column-chooser"><details><summary>Columns</summary><div>{accreditationOptionalColumns.map((column) => <label key={column}><input type="checkbox" checked={show(column)} onChange={() => void saveColumns(show(column) ? visibleColumns.filter((item) => item !== column) : [...visibleColumns, column])} />{accreditationColumnLabels[column]}</label>)}<div className="button-row"><button onClick={() => void saveColumns([...accreditationOptionalColumns])}>Show all</button><button onClick={() => void saveColumns([...DEFAULT_ACCREDITATION_TABLE_PREFERENCES.visibleColumns])}>Reset</button></div></div></details><StatusBadge tone="warning">{visible.filter((item) => item.isAtRisk).length} at-risk courses</StatusBadge></div></div>
      <div className="filter-grid"><label>Course<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Code or title" /></label><label>Risk<select value={risk} onChange={(event) => setRisk(event.target.value)}><option value="">All risk states</option>{Object.entries(accreditationRiskLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Organization<select value={organization} onChange={(event) => setOrganization(event.target.value)}><option value="">All organizations</option>{organizations.map((value) => <option key={value}>{value}</option>)}</select></label><label>Jurisdiction<select value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)}><option value="">All jurisdictions</option>{jurisdictions.map((value) => <option key={value}>{value}</option>)}</select></label><label>Sort<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="urgency">Urgency</option><option value="expiration">Expiration date</option></select></label></div>
      {activeFilters.length > 0 && <div className="filter-chips" aria-label="Active filters">{activeFilters.map(([label, value]) => <span key={label}>{label}: {value}</span>)}<button onClick={clearFilters}>Clear all</button></div>}
      {visible.length === 0 ? <div className="empty-state"><Award size={24} /><h3>No matching courses</h3><p>Clear filters or add a record.</p></div> : <div className="table-scroll"><table className="data-table accreditation-table"><thead><tr><th>Course</th><th>Risk</th>{show("organization") && <th>Organization</th>}{show("jurisdiction") && <th>Jurisdiction</th>}{show("status") && <th>Status</th>}{show("historyRole") && <th>History Role</th>}{show("effective") && <th>Effective</th>}{show("expiration") && <th>Expiration</th>}{show("source") && <th>Source</th>}<th className="actions-column">Actions</th></tr></thead><tbody>{visible.flatMap((item) => { const open = expandedCourse === item.course.courseId; const current = item.currentRecords; const colSpan = 3 + visibleColumns.length; return [<tr key={item.course.courseId}><td><Link className="table-link" href={`/courses/${item.course.courseId}`}>{item.course.courseTitle}</Link></td><td><StatusBadge tone={item.isAtRisk ? "danger" : "success"}>{item.isAtRisk ? accreditationRiskLabels[item.riskState] : "Current"}</StatusBadge></td>{show("organization") && <td>{item.groups.map((group) => group.organization).join(", ")}</td>}{show("jurisdiction") && <td>{item.groups.map((group) => group.jurisdiction).join(", ")}</td>}{show("status") && <td>{current.map((record) => record.record.status).join(", ") || "Future only"}</td>}{show("historyRole") && <td>{item.groups.length} group{item.groups.length === 1 ? "" : "s"}</td>}{show("effective") && <td>{current.map((record) => record.record.effectiveDate ?? "Undated").join(", ") || "Not effective"}</td>}{show("expiration") && <td>{item.expiration ?? "Undated"}</td>}{show("source") && <td>{Array.from(new Set(item.entries.map((entry) => entry.record.source))).join(", ")}</td>}<td><button aria-expanded={open} onClick={() => setExpandedCourse(open ? null : item.course.courseId)}>{open ? "Hide" : "Review"}</button></td></tr>, <tr key={`${item.course.courseId}-details`} className={`accreditation-details-row ${open ? "is-open" : ""}`}><td colSpan={colSpan}>{open && <div className="accreditation-inline-history">{item.groups.map((group) => <section key={group.key}><h3>{group.organization} · {group.jurisdiction}</h3><table><thead><tr><th>Status</th><th>History role</th><th>Effective</th><th>Expiration</th><th>Source</th><th>Actions</th></tr></thead><tbody>{[group.summary, ...group.history].map((assessed) => { const entry = item.entries.find(({ record }) => record.id === assessed.record.id)!; return <tr key={assessed.record.id}><td>{assessed.record.status}</td><td>{assessed.historyRole}</td><td>{assessed.record.effectiveDate ?? "Undated"}</td><td>{assessed.record.expirationDate ?? "Undated"}</td><td>{assessed.record.source}</td><td>{assessed.record.source !== "lms_api" ? <div className="table-actions"><button onClick={() => setEditing(entry)}>Edit</button><button disabled={pending} onClick={() => archiveRecord(entry)}>Archive</button></div> : <StatusBadge tone="neutral">Read-only</StatusBadge>}</td></tr>; })}</tbody></table></section>)}</div>}</td></tr>]; })}</tbody></table></div>}
    </section>
  </WorkspaceFrame>;
}

function VersionsWorkspaceLegacy({
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
    fetch("/api/wrike/synced-tasks?pageSize=12")
      .then(async (response) => {
        if (!response.ok) return null;
        return (await response.json()) as { items?: WrikeTask[] };
      })
      .then((result) => {
        if (!cancelled && result?.items?.length) setAvailableTasks(result.items);
      })
      .catch(() => {
        // Existing synchronized rows remain visible when a refresh fails.
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
      `${task.externalTaskId} is referenced by ${selectedVersion.course.courseCode} v${selectedVersion.version.versionNumber} in this session.`,
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
          ["Wrike-referenced versions", String(referencedVersionCount), "External task context attached"],
          ["Unlinked versions", String(versions.length - referencedVersionCount), "No Wrike task required or selected"],
        ]}
      />
      <section className="panel">
        <div className="panel-heading">
          <div><h2>Recent version activity</h2><p>Newest CourseTrack-managed publication records</p></div>
          <StatusBadge tone="neutral">Wrike Task Links unavailable</StatusBadge>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Course</th><th>Version</th><th>Type</th><th>Published</th><th>Wrike Task Link</th><th>Maintained by</th><th>Status</th><th>Action</th></tr></thead>
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
            <h2>Available Wrike tasks</h2>
            <p>Read-only task discovery through the Wrike API boundary</p>
          </div>
          <StatusBadge tone="neutral">Connector not configured</StatusBadge>
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
            placeholder="Search available Wrike tasks"
            aria-label="Search available Wrike tasks"
          />
        </div>
        {linkMessage && (
          <div className="inline-alert alert-success">
            <Link2 size={16} />
            <span><strong>Reference added</strong>{linkMessage}</span>
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
            CourseTrack may read and reference task details. It does not change Wrike tasks, and a task link never changes a CourseTrack version automatically. Session links remain temporary until the connector is configured.
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
      <small>{primary?.projectTitle ?? "Session reference"}{total > 1 ? ` · +${total - 1} more` : ""}</small>
    </span>
  );
}

void VersionsWorkspaceLegacy;

const versionsColumnLabels: Record<(typeof versionsOptionalColumns)[number], string> = { status: "Status", published: "Published", type: "Type", authoring: "Authoring", standard: "Standard" };

export function VersionsWorkspace({ entries, initialPreferences }: { entries: VersionBoardEntry[]; initialPreferences: VersionsTablePreferences }) {
  const router = useRouter();
  const versions = [...entries].sort((a, b) =>
    b.version.publicationDate.localeCompare(a.version.publicationDate) || b.version.id.localeCompare(a.version.id),
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<VersionBoardEntry | "new" | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [visibleColumns, setVisibleColumns] = useState(initialPreferences.visibleColumns);
  const show = (column: (typeof versionsOptionalColumns)[number]) => visibleColumns.includes(column);
  const saveColumns = async (next: VersionsTablePreferences["visibleColumns"]) => {
    setVisibleColumns(next);
    const response = await fetch("/api/preferences/versions", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ visibleColumns: next }) });
    if (!response.ok) setMessage("Column preferences could not be saved.");
  };

  const saveVersion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const current = editing === "new" ? null : editing;
    const courseId = String(form.get("courseId"));
    const payload = {
      versionNumber: String(form.get("versionNumber")),
      versionType: String(form.get("versionType")),
      publicationDate: String(form.get("publicationDate")),
      versionStatus: String(form.get("versionStatus")),
      isCurrent: form.get("isCurrent") === "on",
      releaseNotes: String(form.get("releaseNotes") ?? ""),
      authoringTool: String(form.get("authoringTool") ?? ""),
      packageStandard: String(form.get("packageStandard") ?? ""),
      expectedUpdatedAt: current?.version.updatedAt,
    };
    setPending(true); setMessage("");
    try {
      const response = await fetch(current ? `/api/course-versions/${current.version.id}` : `/api/courses/${courseId}/versions`, {
        method: current ? "PATCH" : "POST",
        headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message);
      setMessage(result.message ?? "Version saved."); setEditing(null); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Version could not be saved."); }
    finally { setPending(false); }
  };

  const archiveVersion = async (entry: VersionBoardEntry) => {
    if (!window.confirm(`Archive version ${entry.version.versionNumber}?`)) return;
    setPending(true); setMessage("");
    try {
      const response = await fetch(`/api/course-versions/${entry.version.id}`, {
        method: "DELETE", headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedUpdatedAt: entry.version.updatedAt }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message);
      setMessage(result.message ?? "Version archived."); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Version could not be archived."); }
    finally { setPending(false); }
  };

  const editor = editing && (
    <form className="panel workflow-form" onSubmit={saveVersion}>
      <div className="panel-heading"><div><h2>{editing === "new" ? "Create version" : "Edit version"}</h2><p>CourseTrack validates every required field.</p></div><button type="button" className="icon-action" aria-label="Cancel version editing" onClick={() => setEditing(null)}><X size={18} /></button></div>
      <div className="form-grid">
        {editing === "new" ? <AsyncCourseSelect /> : <label>Course<input disabled value={`${editing.course.courseCode} — ${editing.course.courseTitle}`} /><input type="hidden" name="courseId" value={editing.course.courseId} /></label>}
        <label>Version<input name="versionNumber" required defaultValue={editing === "new" ? "" : editing.version.versionNumber} /></label>
        <label>Type<select name="versionType" defaultValue={editing === "new" ? "Minor Revision" : editing.version.versionType}>{["Initial Release", "Minor Revision", "Major Revision", "Technical Update", "Accessibility Update", "Legal Update", "Accreditation Update"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Publication date<input name="publicationDate" type="date" required defaultValue={editing === "new" ? "" : editing.version.publicationDate} /></label>
        <label>Status<select name="versionStatus" defaultValue={editing === "new" ? "Draft" : editing.version.versionStatus}>{["Draft", "In Review", "Scheduled", "Published", "Superseded"].map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Authoring tool<input name="authoringTool" defaultValue={editing === "new" ? "" : editing.version.authoringTool} /></label>
        <label>Package standard<input name="packageStandard" defaultValue={editing === "new" ? "" : editing.version.packageStandard} /></label>
        <label className="checkbox-field"><input name="isCurrent" type="checkbox" defaultChecked={editing !== "new" && editing.version.isCurrent} /> Current version</label>
        <label className="form-span">Release notes<textarea name="releaseNotes" defaultValue={editing === "new" ? "" : editing.version.releaseNotes} /></label>
      </div>
      <div className="button-row"><button type="button" className="button button-secondary" onClick={() => setEditing(null)}>Cancel</button><button className="button button-primary" disabled={pending}>{pending ? "Saving…" : "Save version"}</button></div>
    </form>
  );

  return (
    <WorkspaceFrame eyebrow="Lifecycle workspace" title="Versions" description="Create and maintain authoritative course-version history inside CourseTrack."
      action={<button className="button button-primary" onClick={() => setEditing("new")}>New version</button>}>
      <section className="version-governance-banner"><ShieldCheck size={22} /><div><strong>One current version per course</strong><span>Changing the current version supersedes the previous current record. History is archived, never deleted.</span></div></section>
      <MetricStrip metrics={[["Version records", String(versions.length), "Active historical records"], ["Current versions", String(versions.filter(({ version }) => version.isCurrent).length), "One per course"], ["Drafts", String(versions.filter(({ version }) => version.versionStatus === "Draft").length), "Not published"], ["Published", String(versions.filter(({ version }) => version.versionStatus === "Published").length), "Published records"]]} />
      {message && <div className="inline-alert" role="status"><ShieldCheck size={17} /><span>{message}</span></div>}
      {editor}
      <section className="panel versions-panel">
        <div className="panel-heading"><div><h2>Version history</h2><p>Newest publication records first</p></div><details className="column-chooser"><summary>Columns</summary><div>{versionsOptionalColumns.map((column) => <label key={column}><input type="checkbox" checked={show(column)} onChange={() => void saveColumns(show(column) ? visibleColumns.filter((item) => item !== column) : [...visibleColumns, column])} />{versionsColumnLabels[column]}</label>)}<div className="button-row"><button onClick={() => void saveColumns([...versionsOptionalColumns])}>Show all</button><button onClick={() => void saveColumns([...DEFAULT_VERSIONS_TABLE_PREFERENCES.visibleColumns])}>Reset</button></div></div></details></div>
        {versions.length === 0 ? <div className="empty-state"><BookOpen size={26} /><h3>No version records</h3><p>Create the first version for a course.</p></div> : <>
          <div className="table-scroll versions-table-scroll"><table className="data-table versions-table"><thead><tr><th>Course</th><th>Version</th>{show("status") && <th>Status</th>}{show("published") && <th>Published</th>}{show("type") && <th>Type</th>}{show("authoring") && <th>Authoring</th>}{show("standard") && <th>Standard</th>}<th className="actions-column">Actions</th></tr></thead><tbody>{versions.map((entry) => { const { course, version } = entry; const open = expandedId === version.id; return [
            <tr key={`${version.id}-main`}><td><Link href={`/courses/${course.courseId}`} className="table-link">{course.courseTitle}</Link></td><td className="mono-cell">v{version.versionNumber}</td>{show("status") && <td>{version.isCurrent ? <StatusBadge tone="success">Current</StatusBadge> : <StatusBadge>{version.versionStatus}</StatusBadge>}</td>}{show("published") && <td>{version.publicationDate}</td>}{show("type") && <td>{version.versionType}</td>}{show("authoring") && <td>{version.authoringTool || "Not set"}</td>}{show("standard") && <td>{version.packageStandard || "Not set"}</td>}<td><div className="table-actions"><button aria-expanded={open} aria-controls={`version-details-${version.id}`} onClick={() => setExpandedId(open ? null : version.id)}>Details</button><button onClick={() => setEditing(entry)}>Edit</button><button disabled={pending || version.isCurrent} onClick={() => archiveVersion(entry)}>Archive</button></div></td></tr>,
            <tr key={`${version.id}-details`} id={`version-details-${version.id}`} className={`version-details-row ${open ? "is-open" : ""}`}><td colSpan={3 + visibleColumns.length}><dl><div><dt>Type</dt><dd>{version.versionType}</dd></div><div><dt>Authoring tool</dt><dd>{version.authoringTool || "Not set"}</dd></div><div><dt>Package standard</dt><dd>{version.packageStandard || "Not set"}</dd></div><div><dt>Release notes</dt><dd>{version.releaseNotes || "None"}</dd></div></dl></td></tr>,
          ]; })}</tbody></table></div>
          <div className="version-card-list">{versions.map((entry) => <article className="version-card" key={entry.version.id}><div><Link href={`/courses/${entry.course.courseId}`}>{entry.course.courseTitle}</Link>{entry.version.isCurrent ? <StatusBadge tone="success">Current</StatusBadge> : <StatusBadge>{entry.version.versionStatus}</StatusBadge>}</div><strong>v{entry.version.versionNumber}</strong><span>{entry.version.publicationDate}</span><dl><div><dt>Type</dt><dd>{entry.version.versionType}</dd></div><div><dt>Authoring</dt><dd>{entry.version.authoringTool || "Not set"}</dd></div><div><dt>Standard</dt><dd>{entry.version.packageStandard || "Not set"}</dd></div><div><dt>Release notes</dt><dd>{entry.version.releaseNotes || "None"}</dd></div></dl><div className="table-actions"><button onClick={() => setEditing(entry)}>Edit</button><button disabled={pending || entry.version.isCurrent} onClick={() => archiveVersion(entry)}>Archive</button></div></article>)}</div>
        </>}
      </section>
    </WorkspaceFrame>
  );
}

function RevampWorkspaceLegacy({ entries }: { entries: RevampBoardEntry[] }) {
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

void RevampWorkspaceLegacy;

const revampColumns = ["Submitted", "Under Review", "Approved", "In Progress"] as const;

export function RevampWorkspace({
  entries,
  canApprove,
}: {
  entries: RevampBoardEntry[];
  canApprove: boolean;
}) {
  const [tasks, setTasks] = useState(entries);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [keyboardGrabbedId, setKeyboardGrabbedId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<RevampBoardEntry | null>(null);

  const ordered = (bucket: (typeof revampColumns)[number]) => tasks
    .filter(({ proposal }) => proposal.bucket === bucket && !proposal.archivedAt)
    .sort((a, b) => (a.proposal.sortOrder ?? 0) - (b.proposal.sortOrder ?? 0) || a.proposal.id.localeCompare(b.proposal.id));

  const moveTask = async (taskId: string, bucket: (typeof revampColumns)[number], targetIndex: number) => {
    if (bucket === "Approved" && !canApprove) { setMessage("Only an administrator can move work into Approved."); return; }
    const original = tasks;
    const moving = tasks.find(({ proposal }) => proposal.id === taskId);
    if (!moving?.proposal.updatedAt) { setMessage("This task is missing a concurrency token. Refresh and try again."); return; }
    const without = tasks.filter(({ proposal }) => proposal.id !== taskId);
    const destination = without.filter(({ proposal }) => proposal.bucket === bucket && !proposal.archivedAt);
    const bounded = Math.max(0, Math.min(targetIndex, destination.length));
    destination.splice(bounded, 0, { ...moving, proposal: { ...moving.proposal, bucket, status: bucket, sortOrder: bounded } });
    const destinationIds = new Set(destination.map(({ proposal }) => proposal.id));
    setTasks([...without.filter(({ proposal }) => !destinationIds.has(proposal.id)), ...destination.map((entry, index) => ({ ...entry, proposal: { ...entry.proposal, sortOrder: index } }))]);
    setPendingId(taskId); setMessage("");
    try {
      const response = await fetch(`/api/revamp-tasks/${taskId}/move`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ bucket, targetIndex: bounded, expectedUpdatedAt: moving.proposal.updatedAt }),
      });
      const result = (await response.json()) as { message?: string; task?: RevampBoardEntry["proposal"]; affectedColumns?: Record<(typeof revampColumns)[number], string[]> };
      if (!response.ok || !result.task || !result.affectedColumns) throw new Error(result.message || "The server did not return authoritative board ordering.");
      setTasks((current) => {
        const byId = new Map(current.map((entry) => [entry.proposal.id, entry]));
        const movedEntry = byId.get(taskId);
        if (movedEntry) byId.set(taskId, { ...movedEntry, proposal: result.task! });
        const orderedEntries = revampColumns.flatMap((column) => result.affectedColumns![column].flatMap((id, index) => {
          const entry = byId.get(id);
          return entry ? [{ ...entry, proposal: { ...entry.proposal, bucket: column, status: column, sortOrder: index } }] : [];
        }));
        const activeIds = new Set(orderedEntries.map((entry) => entry.proposal.id));
        return [...current.filter((entry) => !activeIds.has(entry.proposal.id) && (entry.proposal.archivedAt || !entry.proposal.bucket)), ...orderedEntries];
      });
      setMessage(result.message ?? `Task moved to ${bucket}.`);
    } catch (error) {
      setTasks(original);
      setMessage(`${error instanceof Error ? error.message : "Move failed."} The original board was restored.`);
    } finally { setPendingId(null); }
  };

  const saveTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const courseId = String(form.get("courseId")); const bucket = String(form.get("bucket"));
    const payload = { title: String(form.get("title")), bucket, priority: String(form.get("priority")), score: Number(form.get("score")), targetPublicationDate: String(form.get("targetPublicationDate")) || null, businessJustification: String(form.get("businessJustification")) };
    setPendingId("new"); setMessage("");
    try {
      const response = await fetch(`/api/courses/${courseId}/revamp-tasks`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message);
      setMessage(result.message ?? "Revamp task created."); setEditorOpen(false); window.location.reload();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Task could not be created."); }
    finally { setPendingId(null); }
  };

  const updateTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!editingTask?.proposal.updatedAt) return;
    const form = new FormData(event.currentTarget); const proposal = editingTask.proposal;
    const payload = { title: String(form.get("title")), bucket: proposal.bucket, priority: String(form.get("priority")), score: Number(form.get("score")), targetPublicationDate: String(form.get("targetPublicationDate")) || null, businessJustification: String(form.get("businessJustification")), expectedUpdatedAt: proposal.updatedAt };
    setPendingId(proposal.id); setMessage("");
    try { const response = await fetch(`/api/revamp-tasks/${proposal.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) }); const result = (await response.json()) as { task?: RevampBoardEntry["proposal"]; message?: string }; if (!response.ok || !result.task) throw new Error(result.message); setTasks((current) => current.map((entry) => entry.proposal.id === proposal.id ? { ...entry, proposal: result.task! } : entry)); setEditingTask(null); setMessage(result.message ?? "Revamp task updated."); } catch (error) { setMessage(error instanceof Error ? error.message : "Task could not be updated."); } finally { setPendingId(null); }
  };

  const deleteTask = async (entry: RevampBoardEntry) => {
    if (!window.confirm(`Permanently delete “${entry.proposal.title}”? This cannot be undone.`)) return; setPendingId(entry.proposal.id); setMessage("");
    try { const response = await fetch(`/api/revamp-tasks/${entry.proposal.id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: entry.proposal.updatedAt }) }); const result = (await response.json()) as { message?: string }; if (!response.ok) throw new Error(result.message); setTasks((current) => current.filter((item) => item.proposal.id !== entry.proposal.id)); setEditingTask(null); setMessage(result.message ?? "Revamp task permanently deleted."); } catch (error) { setMessage(error instanceof Error ? error.message : "Task could not be deleted."); } finally { setPendingId(null); }
  };

  const handleKeyboardMove = (event: React.KeyboardEvent<HTMLButtonElement>, entry: RevampBoardEntry, column: (typeof revampColumns)[number], index: number) => {
    if (event.key === " " || event.key === "Enter") { event.preventDefault(); setKeyboardGrabbedId((value) => value === entry.proposal.id ? null : entry.proposal.id); return; }
    if (keyboardGrabbedId !== entry.proposal.id) return;
    const columnIndex = revampColumns.indexOf(column);
    if (event.key === "Escape") { event.preventDefault(); setKeyboardGrabbedId(null); return; }
    if (event.key === "ArrowUp" && index > 0) { event.preventDefault(); void moveTask(entry.proposal.id, column, index - 1); }
    if (event.key === "ArrowDown") { event.preventDefault(); void moveTask(entry.proposal.id, column, index + 1); }
    if (event.key === "ArrowLeft" && columnIndex > 0) { event.preventDefault(); const target = revampColumns[columnIndex - 1]; void moveTask(entry.proposal.id, target, ordered(target).length); }
    if (event.key === "ArrowRight" && columnIndex < revampColumns.length - 1) { event.preventDefault(); const target = revampColumns[columnIndex + 1]; void moveTask(entry.proposal.id, target, ordered(target).length); }
  };

  const active = tasks.filter(({ proposal }) => proposal.bucket && !proposal.archivedAt);
  const average = active.length ? Math.round(active.reduce((sum, { proposal }) => sum + proposal.score, 0) / active.length) : 0;
  return (
    <WorkspaceFrame eyebrow="Portfolio planning" title="Revamp Planning" description="Prioritize modernization work without changing source records."
      action={<button className="button button-primary" onClick={() => setEditorOpen(true)}><Sparkles size={16} /> New task</button>}>
      <MetricStrip metrics={[["Active tasks", String(active.length), "Across four workflow buckets"], ["Awaiting review", String(active.filter(({ proposal }) => ["Submitted", "Under Review"].includes(proposal.bucket ?? "")).length), "Decision required"], ["Approved", String(active.filter(({ proposal }) => proposal.bucket === "Approved").length), "Administrator-approved"], ["Average score", String(average), active.length ? "Weighted priority" : "No active tasks"]]} />
      {message && <div className="inline-alert" role="status" aria-live="assertive"><ShieldCheck size={17} /><span>{message}</span></div>}
      {editorOpen && <form className="panel workflow-form" onSubmit={saveTask}><div className="panel-heading"><div><h2>Create Revamp task</h2><p>Drafts are intentionally kept off the active board.</p></div><button type="button" className="icon-action" aria-label="Cancel task creation" onClick={() => setEditorOpen(false)}><X size={18} /></button></div><div className="form-grid">
        <AsyncCourseSelect /><label>Title<input name="title" minLength={3} maxLength={180} required /></label><input name="bucket" type="hidden" value="Submitted" /><label>Priority<select name="priority">{["Critical", "High", "Medium", "Low", "Monitor Only"].map((value) => <option key={value}>{value}</option>)}</select></label><label>Score<input name="score" type="number" min={0} max={100} defaultValue={50} required /></label><label>Target publication<input name="targetPublicationDate" type="date" /></label><label className="form-span">Business justification<textarea name="businessJustification" minLength={10} maxLength={2000} required /></label>
      </div><div className="button-row"><button type="button" className="button button-secondary" onClick={() => setEditorOpen(false)}>Cancel</button><button className="button button-primary" disabled={pendingId === "new"}>{pendingId === "new" ? "Saving…" : "Create task"}</button></div></form>}
      {editingTask && <form className="panel workflow-form" onSubmit={updateTask}><div className="panel-heading"><div><h2>Edit Revamp task</h2><p>Use the card drag handle to change board position.</p></div><button type="button" className="icon-action" aria-label="Cancel task editing" onClick={() => setEditingTask(null)}><X size={18} /></button></div><div className="form-grid"><label>Title<input name="title" required minLength={3} defaultValue={editingTask.proposal.title} /></label><label>Priority<select name="priority" defaultValue={editingTask.proposal.priority}>{["Critical", "High", "Medium", "Low", "Monitor Only"].map((value) => <option key={value}>{value}</option>)}</select></label><label>Score<input name="score" type="number" min={0} max={100} defaultValue={editingTask.proposal.score} /></label><label>Target publication<input name="targetPublicationDate" type="date" defaultValue={editingTask.proposal.targetPublicationDate ?? ""} /></label><label className="form-span">Business justification<textarea name="businessJustification" required minLength={10} defaultValue={editingTask.proposal.businessJustification} /></label></div><div className="button-row"><button type="button" className="button button-secondary" onClick={() => setEditingTask(null)}>Cancel</button><button className="button button-primary" disabled={pendingId === editingTask.proposal.id}>{pendingId === editingTask.proposal.id ? "Saving…" : "Save task"}</button></div></form>}
      <section className="kanban-board" aria-label="Revamp task board">{revampColumns.map((column) => { const items = ordered(column); return <div className="kanban-column" key={column} onDragOver={(event) => event.preventDefault()} onDrop={() => draggedId && moveTask(draggedId, column, items.length)}><div className="kanban-heading"><strong>{column}</strong><span>{items.length}</span></div>{items.length === 0 ? <div className="kanban-empty">No tasks in this stage.</div> : items.map((entry, index) => { const { course, proposal } = entry; return <article className="kanban-card" key={proposal.id} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); if (draggedId) void moveTask(draggedId, column, index); }} aria-busy={pendingId === proposal.id}><div className="kanban-card-heading"><button type="button" className={`drag-handle ${keyboardGrabbedId === proposal.id ? "is-grabbed" : ""}`} draggable onDragStart={() => setDraggedId(proposal.id)} onDragEnd={() => setDraggedId(null)} onKeyDown={(event) => handleKeyboardMove(event, entry, column, index)} aria-label={`Move ${proposal.title}. Press Space, then arrow keys.`} aria-pressed={keyboardGrabbedId === proposal.id}><GripVertical size={16} /></button><StatusBadge tone={["Critical", "High"].includes(proposal.priority) ? "warning" : "neutral"}>{proposal.priority}</StatusBadge><span>Score {proposal.score}</span></div><Link href={`/courses/${course.courseId}`}><strong>{proposal.title}</strong></Link><p>{course.courseTitle}</p><small>Target {proposal.targetPublicationDate ?? "not scheduled"}</small><div className="table-actions"><button onClick={() => setEditingTask(entry)}>Edit</button><button disabled={pendingId === proposal.id} onClick={() => deleteTask(entry)}>Delete</button></div></article>; })}</div>; })}</section>
    </WorkspaceFrame>
  );
}

export function FlagsWorkspace({ entries, courseOptions }: { entries: FlagBoardEntry[]; courseOptions: CourseIndexEntry[] }) {
  const router = useRouter();
  const [priority, setPriority] = useState("All priorities");
  const [creating, setCreating] = useState(false); const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
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
      action={<button className="button button-primary" disabled={courseOptions.length === 0} onClick={() => setCreating(true)}><Flag size={16} /> Create flag</button>}
    >
      <MetricStrip
        metrics={[
          ["Unresolved flags", String(flags.length), "Across current courses"],
          ["Critical", String(flags.filter(({ flag }) => flag.priority === "Critical").length), "Owner required"],
          ["High priority", String(flags.filter(({ flag }) => flag.priority === "High").length), "Review this cycle"],
          ["Unassigned", String(flags.filter(({ flag }) => !flag.assigneeId).length), "Ownership needed"],
        ]}
      />
      {message && <div className="inline-alert" role="status">{message}</div>}
      {creating && <form className="panel workflow-form" onSubmit={async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); setPending(true); setMessage(""); try { const courseId = String(form.get("courseId")); const response = await fetch(`/api/courses/${courseId}/flags`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ type: String(form.get("type")), title: String(form.get("title")), priority: String(form.get("priority")), status: "Open", dueDate: String(form.get("dueDate")) || null }) }); const result = (await response.json()) as { message?: string }; if (!response.ok) throw new Error(result.message); setMessage(result.message ?? "Flag created."); setCreating(false); router.refresh(); } catch (error) { setMessage(error instanceof Error ? error.message : "Flag could not be created."); } finally { setPending(false); } }}><div className="panel-heading"><div><h2>Create flag</h2><p>Flags are application-owned and audited.</p></div><button type="button" className="icon-action" aria-label="Cancel flag creation" onClick={() => setCreating(false)}><X size={18} /></button></div><div className="form-grid"><label>Course<select name="courseId">{courseOptions.map((course) => <option key={course.id} value={course.id}>{course.courseCode} — {course.title}</option>)}</select></label><label>Type<input name="type" required defaultValue="Content" /></label><label>Title<input name="title" required minLength={3} /></label><label>Priority<select name="priority" defaultValue="Medium">{["Low", "Medium", "High", "Critical"].map((value) => <option key={value}>{value}</option>)}</select></label><label>Due date<input name="dueDate" type="date" /></label></div><div className="button-row"><button type="button" className="button button-secondary" onClick={() => setCreating(false)}>Cancel</button><button className="button button-primary" disabled={pending}>{pending ? "Saving…" : "Create flag"}</button></div></form>}
      <section className="panel">
        <div className="panel-heading">
          <div><h2>Follow-up queue</h2><p>Open issues sorted for triage</p></div>
          <select className="select-control" value={priority} onChange={(event) => setPriority(event.target.value)}>
            <option>All priorities</option><option>Critical</option><option>High</option><option>Medium</option><option>Low</option>
          </select>
        </div>
        <div className="issue-list">
          {filtered.length === 0 && <div className="empty-state compact-empty"><Flag size={22} /><h3>No matching flags</h3><p>Change the priority filter or create a flag.</p></div>}
          {filtered.slice(0, 18).map(({ course, flag }) => (
            <Link href={`/courses/${course.courseId}`} key={flag.id}>
              <span className={`priority-dot priority-${flag.priority.toLowerCase()}`} />
              <div><strong>{flag.title}</strong><small>{course.courseTitle} · Due {flag.dueDate}</small></div>
              <span>{flag.assignee?.displayName ?? "Unassigned"}</span>
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
    setMessage(`${name} completed against the current database metrics.`);
  };
  const downloadReport = (name: string, count: string, description: string) => {
    const csv = `report,count,description\r\n${[name, count, description].map((value) => `"${value.replaceAll('"', '""')}"`).join(",")}\r\n`;
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    anchor.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
    anchor.click(); URL.revokeObjectURL(anchor.href);
  };
  return (
    <WorkspaceFrame
      eyebrow="Reporting workspace"
      title="Reports"
      description="Run curated portfolio reports and export authorized results."
    >
      {message && <div className="inline-alert alert-success"><Check size={17} /><span><strong>Report ready</strong>{message}</span></div>}
      <section className="report-grid">
        {reportCatalog.map(([name, count, description], index) => (
          <article className="report-card" key={name}>
            <div className={`report-icon report-icon-${index % 4}`}><FileBarChart size={20} /></div>
            <div><strong>{name}</strong><p>{description}</p><small>{count}</small></div>
            <div className="report-actions">
              <button onClick={() => runReport(name)}>Run report <ArrowRight size={14} /></button>
              <button aria-label={`Download ${name} as CSV`} onClick={() => downloadReport(name, count, description)}><Download size={15} /></button>
            </div>
          </article>
        ))}
      </section>
    </WorkspaceFrame>
  );
}

export function AdminWorkspace({
  retrievalRuns,
  mappingSummary,
  wrikeConnection,
  wrikeSync,
}: {
  retrievalRuns: RetrievalRun[];
  mappingSummary: IntegrationMappingSummary;
  wrikeConnection: WrikeConnectionSummary;
  wrikeSync: WrikeSyncStatus;
}) {
  const [activeTab, setActiveTab] = useState("LMS provider");
  const tabs = ["LMS provider", "Wrike provider", "Integration Mapping", "Users & roles", "Retrieval history"];

  return (
    <WorkspaceFrame
      eyebrow="Configuration workspace"
      title="Administration"
      description="Manage connectors, mappings, permissions, and immutable system history."
    >
      <div className="admin-layout">
        <nav className="admin-nav" aria-label="Administration sections">
          {tabs.map((tab) => <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab}</button>)}
        </nav>
        <section className="panel admin-panel">
          {activeTab === "LMS provider" && (
            <>
              <div className="panel-heading"><div><h2>Read-only LMS connector</h2><p>Provider configuration and health</p></div><StatusBadge tone="neutral">Not configured</StatusBadge></div>
              <div className="provider-card">
                <div className="provider-mark">L</div>
                <div><strong>LMS API connector</strong><span>Read-only GET contract</span></div>
                <StatusBadge tone="neutral">Unavailable</StatusBadge>
              </div>
              <div className="readonly-callout"><ShieldCheck size={18} /><span><strong>Read-only enforcement</strong>No create, edit, publish, archive, assignment, enrollment, or deletion methods exist in the provider contract.</span></div>
              <div className="configuration-grid">
                <ConfigRow label="Live base URL" value="Not configured" />
                <ConfigRow label="Authentication" value="Awaiting documentation" />
                <ConfigRow label="Course endpoint" value="Not invented" />
                <ConfigRow label="Pagination" value="Awaiting documentation" />
              </div>
            </>
          )}
          {activeTab === "Wrike provider" && (
            <WrikeConnectionPanel initialConnection={wrikeConnection} initialSync={wrikeSync} />
          )}
          {activeTab === "Integration Mapping" && (
            <IntegrationMappingPanel summary={mappingSummary} onRetry={() => setActiveTab("Wrike provider")} />
          )}
          {activeTab === "Users & roles" && (
            <>
              <div className="panel-heading"><div><h2>Users and roles</h2><p>Server-enforced, exclusive four-role assignments</p></div><Link href="/admin/users" className="button button-primary"><Users size={16} /> Go to User Management</Link></div>
              <div className="readonly-callout"><ShieldCheck size={18} /><span><strong>Exclusive roles</strong>Each user has exactly one role — super_admin, admin, accreditation, or content. Manage users, roles, and account status on the User Management page.</span></div>
            </>
          )}
          {activeTab === "Retrieval history" && (
            <>
              <div className="panel-heading"><div><h2>Retrieval history</h2><p>Immutable record of read-only LMS retrieval attempts</p></div></div>
              <div className="table-scroll"><table className="data-table"><thead><tr><th>Run</th><th>Status</th><th>Requested</th><th>Received</th><th>Failed</th><th>Message</th></tr></thead><tbody>{retrievalRuns.length === 0 && <tr><td colSpan={6}>No retrieval attempts have been recorded.</td></tr>}{retrievalRuns.map((run) => <tr key={run.id}><td className="mono-cell">{run.id}</td><td><StatusBadge>{run.status}</StatusBadge></td><td>{run.recordsRequested}</td><td>{run.recordsReceived}</td><td>{run.recordsFailed}</td><td>{run.message}</td></tr>)}</tbody></table></div>
            </>
          )}
        </section>
      </div>
    </WorkspaceFrame>
  );
}

function MappingTable({ mappings }: { mappings: IntegrationMappingSummary["uploaded"]["mappings"] }) {
  return <div className="table-scroll"><table className="data-table integration-mapping-table"><thead><tr><th>Source field</th><th>CourseTrack field</th><th>Requirement</th><th>Transformation</th><th>Access</th></tr></thead><tbody>{mappings.map((mapping) => <tr key={`${mapping.source}-${mapping.target}`}><td>{mapping.source}</td><td className="mono-cell">{mapping.target}</td><td>{mapping.required ? "Required" : "Optional"}</td><td>{mapping.transformation ?? "Direct"}</td><td>{mapping.readOnly ? "Read-only" : "Application-managed"}</td></tr>)}</tbody></table></div>;
}

function IntegrationMappingPanel({ summary, onRetry }: { summary: IntegrationMappingSummary; onRetry: () => void }) {
  return <div className="integration-mapping-stack">
    <section><div className="panel-heading"><div><h2>Uploaded data mapping</h2><p>Latest real import mapping and immutable source provenance</p></div><StatusBadge tone="info">{summary.uploaded.provenance}</StatusBadge></div><div className="configuration-grid"><ConfigRow label="Source workbook" value={summary.uploaded.sourceFilename ?? "No completed import"} /><ConfigRow label="Imported" value={summary.uploaded.importedAt ?? "Not available"} /><ConfigRow label="Status" value={summary.uploaded.status ?? "Not available"} /><ConfigRow label="Warnings / validation errors" value={`${summary.uploaded.warnings} / ${summary.uploaded.validationErrors}`} /></div><MappingTable mappings={summary.uploaded.mappings} /><div className="mapping-field-lists"><div><strong>Ignored fields</strong><p>{summary.uploaded.ignoredFields.join(", ") || "None"}</p></div><div><strong>Unmapped raw fields</strong><p>{summary.uploaded.unmappedRawFields.join(", ") || "None"}</p></div></div></section>
    <section><div className="panel-heading"><div><h2>Wrike task mapping</h2><p>GET-only normalized task, contact, date, and folder/project index</p></div><StatusBadge tone="success">{summary.wrike.provenance}</StatusBadge></div><div className="configuration-grid"><ConfigRow label="Indexed active tasks" value={summary.wrike.taskCount.toLocaleString()} /><ConfigRow label="Indexed contacts" value={summary.wrike.contactCount.toLocaleString()} /><ConfigRow label="Indexed folders/projects" value={summary.wrike.folderCount.toLocaleString()} /><ConfigRow label="Last run" value={summary.wrike.lastRunAt ? `${summary.wrike.lastRunStatus} · ${summary.wrike.lastRunAt}` : "Never synchronized"} /></div><MappingTable mappings={summary.wrike.mappings} /><div className="mapping-field-lists"><div><strong>Approved folders</strong><p>{summary.wrike.approvedFolders.join(", ") || "None configured"}</p></div><div><strong>Ignored raw fields</strong><p>{summary.wrike.ignoredFields.join(", ")}</p></div></div>{summary.wrike.warnings.map((warning) => <div className="inline-alert alert-danger" key={warning}>{warning}</div>)}<button className="button button-secondary" onClick={onRetry}>{summary.wrike.currentRun ? "View current run" : "Review connection or retry sync"}</button></section>
    <section><div className="panel-heading"><div><h2>Future LMS API mapping</h2><p>No provider mapping is shown until real documentation and endpoint contracts are configured.</p></div><StatusBadge tone="neutral">{summary.lms.status}</StatusBadge></div><div className="configuration-grid"><ConfigRow label="Connection" value={summary.lms.status} /><ConfigRow label="Last retrieval" value={summary.lms.lastRetrievedAt ?? "Never"} /><ConfigRow label="Provenance" value={summary.lms.provenance ?? "Not available until connected"} /><ConfigRow label="Mapped fields" value={String(summary.lms.mappings.length)} /></div>{summary.lms.warnings.map((warning) => <div className="readonly-callout" key={warning}><ShieldCheck size={18} /><span><strong>Configuration required</strong>{warning}</span></div>)}</section>
  </div>;
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
  const [feedback, setFeedback] = useState<{
    tone: "success" | "danger";
    title: string;
    message: string;
  } | null>(null);

  const runAction = async (action: () => Promise<void>) => {
    setPending(true);
    setFeedback(null);
    try {
      await action();
    } catch (error) {
      setFeedback({
        tone: "danger",
        title: "Wrike action failed",
        message: error instanceof Error ? error.message : "The Wrike request failed.",
      });
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
      setFeedback({
        tone: "success",
        title: "Wrike connected",
        message: result.connection.accountName
          ? `${result.connection.accountName} is ready for read-only synchronization.`
          : (result.message ?? "The Wrike connection is ready for read-only synchronization."),
      });
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
      setFeedback({
        tone: "success",
        title: "Wrike disconnected",
        message: result.message ?? "The stored CourseTrack connection was removed. Wrike was not changed.",
      });
    });

  const handleHealthCheck = () =>
    runAction(async () => {
      const response = await fetch("/api/wrike/health");
      const result = (await response.json()) as { connection?: WrikeConnectionSummary; message?: string };
      if (!response.ok || !result.connection) throw new Error(result.message ?? "Health check failed.");
      setConnection(result.connection);
      if (result.connection.status !== "connected") {
        throw new Error(result.connection.lastError ?? "Wrike connection reported an error.");
      }
      setFeedback({
        tone: "success",
        title: "Connection healthy",
        message: "CourseTrack successfully reached Wrike using the stored credentials.",
      });
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
      if (result.run.status === "failed") {
        throw new Error("Wrike synchronization failed. Review the folder results below for details.");
      }
      setFeedback({
        tone: "success",
        title: result.run.status === "partial" ? "Sync partially completed" : "Sync completed",
        message: `${result.run.tasksUpserted} task(s) synchronized${
          result.run.status === "partial" ? "; review the folder results below for items needing attention." : "."
        }`,
      });
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
      {feedback && (
        <div
          className={`inline-alert alert-${feedback.tone} wrike-action-feedback`}
          role={feedback.tone === "danger" ? "alert" : "status"}
          aria-live="polite"
        >
          {feedback.tone === "success" ? <ShieldCheck size={18} /> : <AlertTriangle size={18} />}
          <span>
            <strong>{feedback.title}</strong>
            {feedback.message}
          </span>
        </div>
      )}

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

const PROFILE_ROLE_LABELS: Record<AuthContext["role"], string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  accreditation: "Accreditation",
  content: "Content",
};

export function ProfileWorkspace({ authContext }: { authContext: AuthContext }) {
  const router = useRouter();
  const [notifications, setNotifications] = useState({
    accreditation: true,
    review: true,
    assignments: true,
    retrieval: false,
  });
  const [profile, setProfile] = useState({
    firstName: authContext.firstName,
    lastName: authContext.lastName,
    displayName: authContext.displayName,
    jobTitle: authContext.jobTitle,
    department: authContext.department,
    timezone: authContext.timezone,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(profile),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "Could not update your profile.");
      setMessage(result.message ?? "Profile updated.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update your profile.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <WorkspaceFrame
      eyebrow="Personal workspace"
      title="User Profile"
      description="Review your profile, access, and notification preferences."
    >
      <div className="profile-layout">
        <section className="panel profile-card-large">
          <span className="profile-avatar-large">{initialsFor(profile.displayName)}</span>
          <div>
            <h2>{profile.displayName}</h2>
            <p>{profile.jobTitle || profile.department || authContext.email}</p>
            <StatusBadge tone="info">{PROFILE_ROLE_LABELS[authContext.role]}</StatusBadge>
          </div>
          <div className="profile-facts">
            <span><small>Email</small><strong>{authContext.email}</strong></span>
            <span><small>Department</small><strong>{profile.department || "Not set"}</strong></span>
            <span><small>Time zone</small><strong>{profile.timezone}</strong></span>
          </div>
        </section>
        <section className="panel profile-details-panel">
          <div className="panel-heading"><div><h2>Profile details</h2><p>These details personalize CourseTrack. Email, role, and account access remain administrator-managed.</p></div></div>
          <form className="profile-details-form" onSubmit={saveProfile}>
            <label><span>First name</span><input type="text" value={profile.firstName} onChange={(event) => setProfile((current) => ({ ...current, firstName: event.target.value }))} maxLength={80} disabled={saving} /></label>
            <label><span>Last name</span><input type="text" value={profile.lastName} onChange={(event) => setProfile((current) => ({ ...current, lastName: event.target.value }))} maxLength={80} disabled={saving} /></label>
            <label className="profile-field-full"><span>Display name</span><input type="text" value={profile.displayName} onChange={(event) => setProfile((current) => ({ ...current, displayName: event.target.value }))} maxLength={120} required disabled={saving} /></label>
            <label><span>Job title</span><input type="text" value={profile.jobTitle} onChange={(event) => setProfile((current) => ({ ...current, jobTitle: event.target.value }))} maxLength={120} disabled={saving} /></label>
            <label><span>Department or team</span><input type="text" value={profile.department} onChange={(event) => setProfile((current) => ({ ...current, department: event.target.value }))} maxLength={120} disabled={saving} /></label>
            <label className="profile-field-full"><span>Time zone</span><select value={profile.timezone} onChange={(event) => setProfile((current) => ({ ...current, timezone: event.target.value }))} disabled={saving}><option value="America/New_York">Eastern (America/New_York)</option><option value="America/Chicago">Central (America/Chicago)</option><option value="America/Denver">Mountain (America/Denver)</option><option value="America/Los_Angeles">Pacific (America/Los_Angeles)</option><option value="UTC">UTC</option></select></label>
            <div className="profile-form-actions profile-field-full"><button type="submit" className="button button-primary" disabled={saving || !profile.displayName.trim()}>{saving ? "Saving…" : "Save profile"}</button></div>
          </form>
          {message && <p className="taxonomy-editor-error profile-name-message">{message}</p>}
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
}: {
  topics: TaxonomySummary[];
  tags: TaxonomySummary[];
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
  const [courseMatches, setCourseMatches] = useState<CourseIndexEntry[]>([]);
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
  const pickerCourses = courseMatches
    .filter((course) => !assignedCourseIds.has(course.id))
    .slice(0, 50);

  useEffect(() => {
    const query = courseSearch.trim();
    if (query.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => fetch(`/api/courses/search?q=${encodeURIComponent(query)}`, { signal: controller.signal }).then((response) => response.json()).then((result: { items?: CourseIndexEntry[] }) => setCourseMatches(result.items ?? [])).catch((error) => { if (error?.name !== "AbortError") setCourseMatches([]); }), 200);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [courseSearch]);

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
              onChange={(event) => { setCourseSearch(event.target.value); if (event.target.value.trim().length < 2) setCourseMatches([]); }}
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

const ROLE_LABELS_FOR_ADMIN: Record<ApplicationRole, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  accreditation: "Accreditation",
  content: "Content",
};

export function UserManagementWorkspace({
  initialUsers,
  currentUserId,
  currentUserRole,
}: {
  initialUsers: ApplicationUserSummary[];
  currentUserId: string;
  currentUserRole: ApplicationRole;
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [roleFilter, setRoleFilter] = useState<ApplicationRole | "">("");
  const [statusFilter, setStatusFilter] = useState<"active" | "disabled" | "">("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [newRole, setNewRole] = useState<ApplicationRole>("content");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [transferTarget, setTransferTarget] = useState<ApplicationUserSummary | null>(null);
  const [transferConfirmation, setTransferConfirmation] = useState("");

  const assignableRoles: ApplicationRole[] =
    currentUserRole === "super_admin" ? ["admin", "accreditation", "content"] : ["accreditation", "content"];

  const canActOn = (target: ApplicationUserSummary): boolean => {
    if (target.id === currentUserId) return false;
    if (currentUserRole === "admin" && (target.role === "super_admin" || target.role === "admin")) return false;
    return currentUserRole === "super_admin" || currentUserRole === "admin";
  };

  const visibleUsers = users.filter(
    (user) => (!roleFilter || user.role === roleFilter) && (!statusFilter || user.accountStatus === statusFilter),
  );

  const handleAddUser = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, displayName, role: newRole }),
      });
      const result = (await response.json()) as { user?: ApplicationUserSummary; message?: string };
      if (!response.ok || !result.user) throw new Error(result.message ?? "Could not create this user.");
      setUsers((prev) => [result.user as ApplicationUserSummary, ...prev]);
      setMessage(result.message ?? "User created.");
      setEmail("");
      setDisplayName("");
      setShowAddForm(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create this user.");
    } finally {
      setPending(false);
    }
  };

  const patchUser = async (targetId: string, body: { role?: ApplicationRole; status?: "active" | "disabled" }) => {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/users/${targetId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { user?: ApplicationUserSummary; message?: string };
      if (!response.ok || !result.user) throw new Error(result.message ?? "Could not update this user.");
      const updated = result.user;
      setUsers((prev) => prev.map((user) => (user.id === targetId ? updated : user)));
      setMessage(result.message ?? "User updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update this user.");
    } finally {
      setPending(false);
    }
  };

  const handleResend = async (targetId: string, targetEmail: string) => {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch(`/api/admin/users/${targetId}/resend`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "Could not resend this email.");
      setMessage(result.message ?? "Email sent.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not resend this email.");
    } finally {
      setPending(false);
    }
  };

  const handleTransferSuperAdmin = async (event: FormEvent) => {
    event.preventDefault();
    if (!transferTarget) return;
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/users/transfer-superadmin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          targetUserId: transferTarget.id,
          confirmationEmail: transferConfirmation,
        }),
      });
      const result = (await response.json()) as {
        previousSuperAdmin?: ApplicationUserSummary;
        newSuperAdmin?: ApplicationUserSummary;
        message?: string;
      };
      if (!response.ok || !result.previousSuperAdmin || !result.newSuperAdmin) {
        throw new Error(result.message ?? "Could not transfer superadmin authority.");
      }
      setUsers((previous) => previous.map((user) => {
        if (user.id === result.previousSuperAdmin?.id) return result.previousSuperAdmin;
        if (user.id === result.newSuperAdmin?.id) return result.newSuperAdmin;
        return user;
      }));
      setMessage(result.message ?? "Superadmin authority transferred.");
      setTransferTarget(null);
      setTransferConfirmation("");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not transfer superadmin authority.");
    } finally {
      setPending(false);
    }
  };

  return (
    <WorkspaceFrame
      eyebrow="Administration"
      title="User Management"
      description="Each user has exactly one role — super_admin, admin, accreditation, or content."
      action={
        <button type="button" className="button button-primary" onClick={() => setShowAddForm((value) => !value)}>
          <Users size={16} /> Add user
        </button>
      }
    >
      {message && <div className="inline-alert alert-success"><ShieldCheck size={17} /><span>{message}</span></div>}

      {showAddForm && (
        <section className="panel">
          <div className="panel-heading"><div><h2>Add user</h2><p>An invitation/setup email is sent immediately.</p></div></div>
          <form className="auth-form" onSubmit={handleAddUser}>
            <label>
              <span>Email</span>
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required disabled={pending} />
            </label>
            <label>
              <span>Display name</span>
              <input type="text" value={displayName} onChange={(event) => setDisplayName(event.target.value)} required disabled={pending} />
            </label>
            <label>
              <span>Role</span>
              <select value={newRole} onChange={(event) => setNewRole(event.target.value as ApplicationRole)} disabled={pending} className="select-control">
                {assignableRoles.map((role) => (
                  <option key={role} value={role}>{ROLE_LABELS_FOR_ADMIN[role]}</option>
                ))}
              </select>
            </label>
            <button type="submit" className="button button-primary" disabled={pending || !email.trim() || !displayName.trim()}>
              Create user
            </button>
          </form>
        </section>
      )}

      {transferTarget && currentUserRole === "super_admin" && (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Transfer superadmin authority</h2>
              <p>
                {transferTarget.displayName} will become the only superadmin. Your account will become an admin.
              </p>
            </div>
          </div>
          <form className="auth-form" onSubmit={handleTransferSuperAdmin}>
            <label>
              <span>Enter {transferTarget.email} to confirm</span>
              <input
                type="email"
                value={transferConfirmation}
                onChange={(event) => setTransferConfirmation(event.target.value)}
                required
                disabled={pending}
                autoComplete="off"
              />
            </label>
            <div className="button-row">
              <button
                type="submit"
                className="button button-danger-ghost"
                disabled={pending || transferConfirmation.trim().toLowerCase() !== transferTarget.email.toLowerCase()}
              >
                {pending ? "Transferring…" : "Transfer superadmin"}
              </button>
              <button
                type="button"
                className="button button-secondary"
                disabled={pending}
                onClick={() => {
                  setTransferTarget(null);
                  setTransferConfirmation("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="panel">
        <div className="panel-heading">
          <div><h2>Users</h2><p>{visibleUsers.length} of {users.length} shown</p></div>
        </div>
        <div className="filter-row">
          <select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value as ApplicationRole | "")} className="select-control">
            <option value="">All roles</option>
            {APPLICATION_ROLES.map((role) => (
              <option key={role} value={role}>{ROLE_LABELS_FOR_ADMIN[role]}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "active" | "disabled" | "")} className="select-control">
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((user) => {
                const editable = canActOn(user);
                const isProtectedSuperAdmin = user.role === "super_admin";
                return (
                  <tr key={user.id}>
                    <td>{user.displayName}</td>
                    <td className="mono-cell">{user.email}</td>
                    <td>
                      {editable ? (
                        <select
                          value={user.role}
                          onChange={(event) => patchUser(user.id, { role: event.target.value as ApplicationRole })}
                          disabled={pending}
                          className="select-control"
                        >
                          {(currentUserRole === "super_admin" ? APPLICATION_ROLES : assignableRoles).map((role) => (
                            <option key={role} value={role}>{ROLE_LABELS_FOR_ADMIN[role]}</option>
                          ))}
                        </select>
                      ) : (
                        <StatusBadge tone={isProtectedSuperAdmin ? "info" : "neutral"}>
                          {ROLE_LABELS_FOR_ADMIN[user.role]}
                          {isProtectedSuperAdmin ? " (protected)" : ""}
                        </StatusBadge>
                      )}
                    </td>
                    <td>
                      <div className="button-row">
                        <StatusBadge tone={user.accountStatus === "active" ? "success" : "neutral"}>
                          {user.accountStatus === "active" ? "Active" : "Disabled"}
                        </StatusBadge>
                        {user.invitationStatus === "pending" && (
                          <StatusBadge tone="neutral">Invitation pending</StatusBadge>
                        )}
                      </div>
                    </td>
                    <td>
                      {editable ? (
                        <div className="button-row">
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={pending}
                            onClick={() => patchUser(user.id, { status: user.accountStatus === "active" ? "disabled" : "active" })}
                          >
                            {user.accountStatus === "active" ? "Disable" : "Reactivate"}
                          </button>
                          <button
                            type="button"
                            className="button button-secondary"
                            disabled={pending}
                            onClick={() => handleResend(user.id, user.email)}
                          >
                            Resend email
                          </button>
                          {currentUserRole === "super_admin"
                            && user.accountStatus === "active"
                            && user.invitationStatus === "ready" && (
                            <button
                              type="button"
                              className="button button-danger-ghost"
                              disabled={pending}
                              onClick={() => {
                                setTransferTarget(user);
                                setTransferConfirmation("");
                                setMessage("");
                              }}
                            >
                              Transfer superadmin
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="empty-hint">{user.id === currentUserId ? "This is you" : "Not permitted"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {visibleUsers.length === 0 && (
                <tr><td colSpan={5} className="empty-hint">No users match these filters.</td></tr>
              )}
            </tbody>
          </table>
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
