"use client";

import { ListTodo, X } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import type { CourseIndexEntry, FlagBoardEntry } from "@/db";
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

export function TaskCalloutWorkspace({ entries, courseOptions, assignees }: { entries: FlagBoardEntry[]; courseOptions: CourseIndexEntry[]; assignees: TaskCalloutActor[] }) {
  const [records, setRecords] = useState(entries);
  const [editing, setEditing] = useState<FlagBoardEntry | "new" | null>(null);
  const [editorKind, setEditorKind] = useState<TaskCalloutRecord["recordKind"]>("Task");
  const [pendingId, setPendingId] = useState("");
  const [message, setMessage] = useState("");
  const [kind, setKind] = useState("");
  const [assignee, setAssignee] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [dueState, setDueState] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const visible = records.filter(({ flag }) => Boolean(flag.archivedAt) === showArchived);
  const filtered = visible.filter(({ flag }) =>
    (!kind || flag.recordKind === kind) &&
    (!assignee || (assignee === "unassigned" ? !flag.assigneeId : flag.assigneeId === assignee)) &&
    (!status || flag.status === status) &&
    (!priority || flag.priority === priority) &&
    (!dueState || taskCalloutDueState(flag) === dueState));

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
    setPendingId(current?.flag.id ?? "new");
    setMessage("");
    const courseId = current?.course.courseId ?? String(form.get("courseId"));
    const body = {
      recordKind: String(form.get("recordKind")),
      category: String(form.get("category")),
      title: String(form.get("title")),
      description: String(form.get("description")),
      priority: String(form.get("priority")),
      status: String(form.get("status")),
      assigneeId: String(form.get("assigneeId")) || null,
      dueDate: String(form.get("dueDate")) || null,
      completionNotes: String(form.get("completionNotes")) || null,
      expectedUpdatedAt: current?.flag.updatedAt,
    };
    try {
      const response = await fetch(current ? `/api/flags/${current.flag.id}` : `/api/courses/${courseId}/flags`, {
        method: current ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { flag?: TaskCalloutRecord; message?: string };
      if (!response.ok || !result.flag) throw new Error(result.message || "Task or callout could not be saved.");
      const option = courseOptions.find((item) => item.id === courseId);
      const course = current?.course ?? { courseId, courseTitle: option?.title ?? "Course", courseCode: option?.courseCode ?? "" };
      setRecords((items) => current
        ? items.map((item) => item.flag.id === current.flag.id ? { course, flag: result.flag! } : item)
        : [{ course, flag: result.flag! }, ...items]);
      setMessage(result.message ?? "Saved.");
      setEditing(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Task or callout could not be saved.");
    } finally {
      setPendingId("");
    }
  };

  const updateStatus = async (entry: FlagBoardEntry) => {
    const action = taskCalloutStatusAction(entry.flag);
    setPendingId(entry.flag.id);
    setMessage("");
    try {
      const response = await fetch(`/api/flags/${entry.flag.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payloadFor(entry.flag, { status: action.status })) });
      const result = (await response.json()) as { flag?: TaskCalloutRecord; message?: string };
      if (!response.ok || !result.flag) throw new Error(result.message || "Status could not be changed.");
      setRecords((items) => items.map((item) => item.flag.id === entry.flag.id ? { ...item, flag: result.flag! } : item));
      setMessage(result.message ?? "Status updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Status could not be changed.");
    } finally {
      setPendingId("");
    }
  };

  const setArchived = async (entry: FlagBoardEntry, archived: boolean) => {
    setPendingId(entry.flag.id);
    setMessage("");
    try {
      const response = await fetch(`/api/flags/${entry.flag.id}${archived ? "" : "/restore"}`, {
        method: archived ? "DELETE" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedUpdatedAt: entry.flag.updatedAt }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(result.message || "Archive state could not be changed.");
      if (archived) {
        setRecords((items) => items.map((item) => item.flag.id === entry.flag.id ? { ...item, flag: { ...item.flag, archivedAt: new Date().toISOString() } } : item));
      } else {
        window.location.reload();
      }
      setMessage(result.message ?? (archived ? "Archived." : "Restored."));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Archive state could not be changed.");
    } finally {
      setPendingId("");
    }
  };

  const active = records.filter(({ flag }) => !flag.archivedAt);
  const editorRecord = editing === "new" ? null : editing;
  return <div className="page-stack">
    <section className="page-heading"><div><span className="eyebrow">Operational workspace</span><h1>Tasks & Callouts</h1><p>Manage assigned work and contextual callouts with shared status, ownership, and audit rules.</p></div><button className="button button-primary" disabled={!courseOptions.length} onClick={() => { setEditorKind("Task"); setEditing("new"); }}><ListTodo size={16} /> Create task or callout</button></section>
    <section className="metric-strip"><article><span>Open work</span><strong>{active.filter(({ flag }) => !isTaskCalloutClosed(flag)).length}</strong><small>Tasks and callouts</small></article><article><span>Blocked</span><strong>{active.filter(({ flag }) => flag.status === "Blocked").length}</strong><small>Needs intervention</small></article><article><span>Overdue</span><strong>{active.filter(({ flag }) => taskCalloutDueState(flag) === "Overdue").length}</strong><small>Past due and still open</small></article><article><span>Unassigned</span><strong>{active.filter(({ flag }) => !flag.assigneeId).length}</strong><small>Assignment needed</small></article></section>
    {message && <div className="inline-alert" role="status">{message}</div>}
    {editing && <form className="panel workflow-form" onSubmit={save}><div className="panel-heading"><div><h2>{editorRecord ? `Edit ${editorRecord.flag.recordKind}` : "Create task or callout"}</h2><p>All changes use optimistic concurrency and are recorded in audit history.</p></div><button type="button" className="icon-action" onClick={() => setEditing(null)} aria-label="Cancel editing"><X size={18} /></button></div><div className="form-grid">
      {!editorRecord && <label>Course<select name="courseId" required>{courseOptions.map((course) => <option key={course.id} value={course.id}>{course.courseCode} — {course.title}</option>)}</select></label>}
      <label>Kind<select name="recordKind" value={editorKind} onChange={(event) => setEditorKind(event.target.value as TaskCalloutRecord["recordKind"])}>{TASK_CALLOUT_KINDS.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Category<input name="category" required defaultValue={editorRecord?.flag.category ?? "Content"} /></label>
      <label>Title<input name="title" required minLength={3} defaultValue={editorRecord?.flag.title ?? ""} /></label>
      <label>Priority<select name="priority" defaultValue={editorRecord?.flag.priority ?? "Medium"}>{TASK_CALLOUT_PRIORITIES.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Status<select key={editorKind} name="status" defaultValue={editorRecord && statusesForKind(editorKind).includes(editorRecord.flag.status) ? editorRecord.flag.status : "Open"}>{statusesForKind(editorKind).map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Assignee<select name="assigneeId" defaultValue={editorRecord?.flag.assigneeId ?? ""}><option value="">Unassigned</option>{assignees.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select></label>
      <label>Due date<input name="dueDate" type="date" defaultValue={editorRecord?.flag.dueDate ?? ""} /></label>
      <label className="form-span">Description<textarea name="description" maxLength={5000} defaultValue={editorRecord?.flag.description ?? ""} /></label>
      <label className="form-span">Completion or resolution notes<textarea name="completionNotes" maxLength={5000} defaultValue={editorRecord?.flag.completionNotes ?? ""} /></label>
    </div><div className="button-row"><button type="button" className="button button-secondary" onClick={() => setEditing(null)}>Cancel</button><button className="button button-primary" disabled={Boolean(pendingId)}>{pendingId ? "Saving…" : "Save"}</button></div></form>}
    <section className="panel"><div className="panel-heading"><div><h2>{showArchived ? "Archived items" : "Active work"}</h2><p>{filtered.length} matching record{filtered.length === 1 ? "" : "s"}</p></div><button className="button button-secondary" onClick={() => setShowArchived((value) => !value)}>{showArchived ? "View active" : "View archived"}</button></div>
      <div className="task-filter-grid"><select aria-label="Filter by kind" value={kind} onChange={(event) => setKind(event.target.value)}><option value="">All kinds</option>{TASK_CALLOUT_KINDS.map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Filter by assignee" value={assignee} onChange={(event) => setAssignee(event.target.value)}><option value="">All assignees</option><option value="unassigned">Unassigned</option>{assignees.map((person) => <option key={person.id} value={person.id}>{person.displayName}</option>)}</select><select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{["Open", "In Progress", "Blocked", "Completed", "Resolved"].map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Filter by priority" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">All priorities</option>{TASK_CALLOUT_PRIORITIES.map((value) => <option key={value}>{value}</option>)}</select><select aria-label="Filter by due state" value={dueState} onChange={(event) => setDueState(event.target.value)}><option value="">All due states</option>{["Overdue", "Due", "No due date", "Closed"].map((value) => <option key={value}>{value}</option>)}</select></div>
      <div className="task-callout-list">{filtered.length === 0 ? <div className="empty-state compact-empty"><ListTodo size={24} /><h3>No matching tasks or callouts</h3><p>Change the filters or create a record.</p></div> : filtered.map((entry) => { const due = taskCalloutDueState(entry.flag); const action = taskCalloutStatusAction(entry.flag); return <article key={entry.flag.id} className={`task-callout-card ${due === "Overdue" ? "is-overdue" : ""}`}><div className="task-callout-heading"><div><StatusBadge tone={entry.flag.recordKind === "Task" ? "info" : "neutral"}>{entry.flag.recordKind}</StatusBadge><StatusBadge>{entry.flag.status}</StatusBadge>{due === "Overdue" && <StatusBadge tone="danger">Overdue</StatusBadge>}</div><StatusBadge tone={entry.flag.priority === "Critical" ? "danger" : entry.flag.priority === "High" ? "warning" : "neutral"}>{entry.flag.priority}</StatusBadge></div><h3>{entry.flag.title}</h3><p>{entry.flag.description || "No description supplied."}</p><dl><div><dt>Course</dt><dd><Link href={`/courses/${entry.course.courseId}`}>{entry.course.courseTitle}</Link></dd></div><div><dt>Assignee</dt><dd>{entry.flag.assignee?.displayName ?? "Unassigned"}</dd></div><div><dt>Due</dt><dd>{entry.flag.dueDate ?? "No due date"}</dd></div><div><dt>Created</dt><dd>{entry.flag.createdBy?.displayName ?? "Unknown"} · {entry.flag.createdAt.slice(0, 10)}</dd></div><div><dt>Updated</dt><dd>{entry.flag.updatedBy?.displayName ?? "Unknown"} · {entry.flag.updatedAt.slice(0, 10)}</dd></div>{entry.flag.completedBy && <div><dt>Completed</dt><dd>{entry.flag.completedBy.displayName} · {entry.flag.completedAt?.slice(0, 10)}</dd></div>}{entry.flag.resolvedBy && <div><dt>Resolved</dt><dd>{entry.flag.resolvedBy.displayName} · {entry.flag.resolvedAt?.slice(0, 10)}</dd></div>}</dl><div className="table-actions">{showArchived ? <button disabled={pendingId === entry.flag.id} onClick={() => setArchived(entry, false)}>Restore</button> : <><button onClick={() => { setEditorKind(entry.flag.recordKind); setEditing(entry); }}>Edit</button><button disabled={pendingId === entry.flag.id} onClick={() => updateStatus(entry)}>{action.label}</button><button disabled={pendingId === entry.flag.id} onClick={() => setArchived(entry, true)}>Archive</button></>}</div></article>; })}</div>
    </section>
  </div>;
}
