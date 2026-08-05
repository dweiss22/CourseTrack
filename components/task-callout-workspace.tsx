"use client";

import { ListTodo, X } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useMemo, useState } from "react";
import type { FlagBoardEntry } from "@/db";
import type { TaskCalloutActor, TaskCalloutRecord } from "@/types/course";
import {
  isTaskCalloutClosed,
  statusesForKind,
  TASK_CALLOUT_KINDS,
  TASK_CALLOUT_PRIORITIES,
  taskCalloutDueState,
  taskCalloutStatusAction,
} from "@/lib/task-callouts";
import { StatusBadge } from "./status-badge";
import { AsyncCourseSelect } from "./async-course-select";

const priorityRank: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };

function sortWork(a: FlagBoardEntry, b: FlagBoardEntry) {
  const aOverdue = !isTaskCalloutClosed(a.flag) && taskCalloutDueState(a.flag) === "Overdue" ? 0 : 1;
  const bOverdue = !isTaskCalloutClosed(b.flag) && taskCalloutDueState(b.flag) === "Overdue" ? 0 : 1;
  return aOverdue - bOverdue
    || (priorityRank[a.flag.priority] ?? 9) - (priorityRank[b.flag.priority] ?? 9)
    || (a.flag.dueDate ?? "9999-12-31").localeCompare(b.flag.dueDate ?? "9999-12-31")
    || a.flag.title.localeCompare(b.flag.title);
}

export function TaskCalloutWorkspace({ entries, assignees }: { entries: FlagBoardEntry[]; assignees: TaskCalloutActor[] }) {
  const [records, setRecords] = useState(entries);
  const [editing, setEditing] = useState<FlagBoardEntry | "new" | null>(null);
  const [editorKind, setEditorKind] = useState<TaskCalloutRecord["recordKind"]>("Task");
  const [pendingId, setPendingId] = useState("");
  const [message, setMessage] = useState("");
  const [filters, setFilters] = useState({ kind: "", assignee: "", status: "", priority: "", dueState: "" });

  const filtered = useMemo(() => records.filter(({ flag }) => !flag.archivedAt).filter(({ flag }) =>
    (!filters.kind || flag.recordKind === filters.kind)
    && (!filters.assignee || (filters.assignee === "unassigned" ? !flag.assigneeId : flag.assigneeId === filters.assignee))
    && (!filters.status || flag.status === filters.status)
    && (!filters.priority || flag.priority === filters.priority)
    && (!filters.dueState || taskCalloutDueState(flag) === filters.dueState),
  ).sort(sortWork), [records, filters]);

  const payloadFor = (flag: TaskCalloutRecord, overrides: Partial<TaskCalloutRecord> = {}) => ({
    recordKind: overrides.recordKind ?? flag.recordKind,
    category: overrides.category ?? flag.category,
    title: overrides.title ?? flag.title,
    description: overrides.description ?? flag.description,
    priority: overrides.priority ?? flag.priority,
    status: overrides.status ?? flag.status,
    assigneeId: overrides.assigneeId === undefined ? flag.assigneeId : overrides.assigneeId,
    dueDate: overrides.dueDate === undefined ? flag.dueDate : overrides.dueDate,
    completionNotes: overrides.completionNotes === undefined ? flag.completionNotes : overrides.completionNotes,
    expectedUpdatedAt: flag.updatedAt,
  });

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const current = editing === "new" ? null : editing;
    const courseId = current?.course.courseId ?? String(form.get("courseId"));
    const body = {
      recordKind: String(form.get("recordKind")), category: String(form.get("category")),
      title: String(form.get("title")), description: String(form.get("description")),
      priority: String(form.get("priority")), status: String(form.get("status")),
      assigneeId: String(form.get("assigneeId")) || null, dueDate: String(form.get("dueDate")) || null,
      completionNotes: String(form.get("completionNotes")) || null, expectedUpdatedAt: current?.flag.updatedAt,
    };
    setPendingId(current?.flag.id ?? "new"); setMessage("");
    try {
      const response = await fetch(current ? `/api/flags/${current.flag.id}` : `/api/courses/${courseId}/flags`, {
        method: current ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await response.json() as { flag?: TaskCalloutRecord; message?: string };
      if (!response.ok || !result.flag) throw new Error(result.message || "Task or callout could not be saved.");
      const course = current?.course ?? { courseId, courseTitle: "Course", courseCode: "" };
      setRecords((items) => current ? items.map((item) => item.flag.id === current.flag.id ? { course, flag: result.flag! } : item) : [{ course, flag: result.flag! }, ...items]);
      setEditing(null); setMessage(result.message ?? "Saved.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Task or callout could not be saved."); }
    finally { setPendingId(""); }
  };

  const updateStatus = async (entry: FlagBoardEntry) => {
    const action = taskCalloutStatusAction(entry.flag);
    setPendingId(entry.flag.id); setMessage("");
    try {
      const response = await fetch(`/api/flags/${entry.flag.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payloadFor(entry.flag, { status: action.status })) });
      const result = await response.json() as { flag?: TaskCalloutRecord; message?: string };
      if (!response.ok || !result.flag) throw new Error(result.message || "Status could not be changed.");
      setRecords((items) => items.map((item) => item.flag.id === entry.flag.id ? { ...item, flag: result.flag! } : item));
      setMessage(result.message ?? "Status updated.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Status could not be changed."); }
    finally { setPendingId(""); }
  };

  const deleteRecord = async (entry: FlagBoardEntry) => {
    if (!window.confirm(`Permanently delete ${entry.flag.recordKind.toLowerCase()} “${entry.flag.title}”? This cannot be undone.`)) return;
    setPendingId(entry.flag.id); setMessage("");
    try {
      const response = await fetch(`/api/flags/${entry.flag.id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: entry.flag.updatedAt }) });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message || "The record could not be deleted.");
      setRecords((items) => items.filter((item) => item.flag.id !== entry.flag.id));
      setMessage(result.message ?? "Permanently deleted.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The record could not be deleted."); }
    finally { setPendingId(""); }
  };

  const renderRows = (items: FlagBoardEntry[]) => items.length === 0
    ? <div className="empty-state compact-empty"><ListTodo size={24} /><h3>No matching records</h3><p>Change the filters or create a record.</p></div>
    : <div className="task-callout-rows">{items.map((entry) => {
      const due = taskCalloutDueState(entry.flag);
      const action = taskCalloutStatusAction(entry.flag);
      return <article key={entry.flag.id} className={`task-callout-row ${due === "Overdue" ? "is-overdue" : ""}`}>
        <div className="task-row-main"><div><StatusBadge>{entry.flag.status}</StatusBadge>{due === "Overdue" && <StatusBadge tone="danger">Overdue</StatusBadge>}</div><strong>{entry.flag.title}</strong><Link href={`/courses/${entry.course.courseId}`}>{entry.course.courseTitle}</Link></div>
        <span>{entry.flag.assignee?.displayName ?? "Unassigned"}</span><span>{entry.flag.dueDate ?? "No due date"}</span>
        <StatusBadge tone={entry.flag.priority === "Critical" ? "danger" : entry.flag.priority === "High" ? "warning" : "neutral"}>{entry.flag.priority}</StatusBadge>
        <div className="task-row-actions"><button onClick={() => { setEditorKind(entry.flag.recordKind); setEditing(entry); }}>Edit</button><button disabled={pendingId === entry.flag.id} onClick={() => updateStatus(entry)}>{action.label}</button><button disabled={pendingId === entry.flag.id} onClick={() => deleteRecord(entry)}>Delete</button></div>
        <details><summary>Description and audit details</summary><p>{entry.flag.description || "No description supplied."}</p><dl><div><dt>Created</dt><dd>{entry.flag.createdBy?.displayName ?? "Unknown"} · {entry.flag.createdAt.slice(0, 10)}</dd></div><div><dt>Updated</dt><dd>{entry.flag.updatedBy?.displayName ?? "Unknown"} · {entry.flag.updatedAt.slice(0, 10)}</dd></div>{entry.flag.completionNotes && <div><dt>Completion notes</dt><dd>{entry.flag.completionNotes}</dd></div>}</dl></details>
      </article>;
    })}</div>;

  const active = records.filter(({ flag }) => !flag.archivedAt);
  const editorRecord = editing === "new" ? null : editing;
  const updateFilter = (key: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  return <div className="page-stack">
    <section className="page-heading"><div><span className="eyebrow">Operational workspace</span><h1>Tasks & Callouts</h1><p>Manage assigned work and contextual callouts in compact, separate queues.</p></div><button className="button button-primary" onClick={() => { setEditorKind("Task"); setEditing("new"); }}><ListTodo size={16} /> Create task or callout</button></section>
    <section className="metric-strip"><article><span>Open work</span><strong>{active.filter(({ flag }) => !isTaskCalloutClosed(flag)).length}</strong><small>Tasks and callouts</small></article><article><span>Blocked</span><strong>{active.filter(({ flag }) => flag.status === "Blocked").length}</strong><small>Needs intervention</small></article><article><span>Overdue</span><strong>{active.filter(({ flag }) => taskCalloutDueState(flag) === "Overdue").length}</strong><small>Past due and still open</small></article><article><span>Unassigned</span><strong>{active.filter(({ flag }) => !flag.assigneeId).length}</strong><small>Assignment needed</small></article></section>
    {message && <div className="inline-alert" role="status" aria-live="polite">{message}</div>}
    {editing && <form className="panel workflow-form" onSubmit={save}><div className="panel-heading"><div><h2>{editorRecord ? `Edit ${editorRecord.flag.recordKind}` : "Create task or callout"}</h2><p>All changes use optimistic concurrency and are recorded in audit history.</p></div><button type="button" className="icon-action" onClick={() => setEditing(null)} aria-label="Cancel editing"><X size={18} /></button></div><div className="form-grid">
      {!editorRecord && <AsyncCourseSelect />}
      <label>Kind<select name="recordKind" value={editorKind} onChange={(event) => setEditorKind(event.target.value as TaskCalloutRecord["recordKind"])}>{TASK_CALLOUT_KINDS.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Category<input name="category" required defaultValue={editorRecord?.flag.category ?? "Content"} /></label><label>Title<input name="title" required minLength={3} defaultValue={editorRecord?.flag.title ?? ""} /></label>
      <label>Priority<select name="priority" defaultValue={editorRecord?.flag.priority ?? "Medium"}>{TASK_CALLOUT_PRIORITIES.map((value) => <option key={value}>{value}</option>)}</select></label><label>Status<select key={editorKind} name="status" defaultValue={editorRecord && statusesForKind(editorKind).includes(editorRecord.flag.status) ? editorRecord.flag.status : "Open"}>{statusesForKind(editorKind).map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Assignee<select name="assigneeId" defaultValue={editorRecord?.flag.assigneeId ?? ""}><option value="">Unassigned</option>{assignees.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select></label><label>Due date<input name="dueDate" type="date" defaultValue={editorRecord?.flag.dueDate ?? ""} /></label>
      <label className="form-span">Description<textarea name="description" maxLength={5000} defaultValue={editorRecord?.flag.description ?? ""} /></label><label className="form-span">Completion or resolution notes<textarea name="completionNotes" maxLength={5000} defaultValue={editorRecord?.flag.completionNotes ?? ""} /></label>
    </div><div className="button-row"><button type="button" className="button button-secondary" onClick={() => setEditing(null)}>Cancel</button><button className="button button-primary" disabled={Boolean(pendingId)}>{pendingId ? "Saving…" : "Save"}</button></div></form>}
    <section className="panel"><div className="panel-heading"><div><h2>Active work</h2><p>{filtered.length} matching record{filtered.length === 1 ? "" : "s"}</p></div></div>
      <div className="task-filter-grid"><select aria-label="Filter by kind" value={filters.kind} onChange={(event) => updateFilter("kind", event.target.value)}><option value="">All kinds</option>{TASK_CALLOUT_KINDS.map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Filter by assignee" value={filters.assignee} onChange={(event) => updateFilter("assignee", event.target.value)}><option value="">All assignees</option><option value="unassigned">Unassigned</option>{assignees.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select><select aria-label="Filter by status" value={filters.status} onChange={(event) => updateFilter("status", event.target.value)}><option value="">All statuses</option>{["Open", "In Progress", "Blocked", "Completed", "Resolved"].map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Filter by priority" value={filters.priority} onChange={(event) => updateFilter("priority", event.target.value)}><option value="">All priorities</option>{TASK_CALLOUT_PRIORITIES.map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Filter by due state" value={filters.dueState} onChange={(event) => updateFilter("dueState", event.target.value)}><option value="">All due states</option>{["Overdue", "Due", "No due date", "Closed"].map((value) => <option key={value}>{value}</option>)}</select></div>
      <section className="task-callout-section"><h3>Tasks <span>{filtered.filter(({ flag }) => flag.recordKind === "Task").length}</span></h3>{renderRows(filtered.filter(({ flag }) => flag.recordKind === "Task"))}</section>
      <section className="task-callout-section"><h3>Callouts <span>{filtered.filter(({ flag }) => flag.recordKind === "Callout").length}</span></h3>{renderRows(filtered.filter(({ flag }) => flag.recordKind === "Callout"))}</section>
    </section>
  </div>;
}
