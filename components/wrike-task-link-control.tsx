"use client";

import { Link2, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { WrikeConnectorState, WrikeTaskCandidate } from "@/db";
import type { CourseVersion, VersionWrikeTaskReference } from "@/types/course";

type LinkResult = {
  id: string; wrikeTaskId: string; taskTitle: string; permalink: string | null; taskStatus: string | null;
  projectTitle: string | null; assigneeNames: string[]; dueDate: string | null; updatedAt: string;
  lastVerifiedAt?: string; wrikePublishedDate: string | null;
};

function wrikeUrl(value: string): boolean {
  try { const url = new URL(value); return url.protocol === "https:" && (url.hostname === "wrike.com" || url.hostname.endsWith(".wrike.com")); }
  catch { return false; }
}

export function WrikeTaskLinkControl({ version, canManage, onReferencesChange }: { version: CourseVersion; canManage: boolean; onReferencesChange: (references: VersionWrikeTaskReference[]) => void }) {
  const active = version.wrikeTaskReferences[0] ?? null;
  const listId = useId();
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<WrikeTaskCandidate[]>([]);
  const [selected, setSelected] = useState<WrikeTaskCandidate | null>(null);
  const [connectorState, setConnectorState] = useState<WrikeConnectorState | null>(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [position, setPosition] = useState({ left: 12, top: 12, width: 480, maxHeight: 520 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const directMode = wrikeUrl(query.trim());

  const close = useCallback(() => {
    setEditing(false); setCandidates([]); setSelected(null);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!editing) return;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const margin = 12;
      const width = Math.min(520, window.innerWidth - margin * 2);
      const below = window.innerHeight - rect.bottom - margin;
      const above = rect.top - margin;
      const viewportHeight = Math.max(160, window.innerHeight - margin * 2);
      const maxHeight = Math.min(560, viewportHeight, Math.max(below, above));
      const top = below >= 340 || below >= above ? Math.min(rect.bottom + 8, window.innerHeight - margin - maxHeight) : Math.max(margin, rect.top - maxHeight - 8);
      setPosition({ left: Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin)), top, width, maxHeight });
    };
    const outside = (event: PointerEvent) => { if (!dialogRef.current?.contains(event.target as Node) && !triggerRef.current?.contains(event.target as Node)) close(); };
    const keydown = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); close(); } };
    place(); requestAnimationFrame(() => inputRef.current?.focus());
    window.addEventListener("resize", place); window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", keydown);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    if (dialogRef.current) observer?.observe(dialogRef.current);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", keydown); observer?.disconnect(); };
  }, [close, editing]);

  useEffect(() => {
    if (!editing || selected || directMode || (query.trim().length > 0 && query.trim().length < 2)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setError(""); setSelected(null);
      try {
        const response = await fetch(`/api/course-versions/${version.id}/wrike/search`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(query.trim() ? { searchText: query.trim() } : {}), signal: controller.signal });
        const result = await response.json() as { items?: WrikeTaskCandidate[]; state?: WrikeConnectorState; message?: string };
        if (!response.ok && !result.state) throw new Error(result.message || "Wrike Task Link search failed.");
        setCandidates(result.items ?? []); setConnectorState(result.state ?? null); setActiveIndex((result.items?.length ?? 0) ? 0 : -1);
      } catch (searchError) { if (!(searchError instanceof DOMException && searchError.name === "AbortError")) setError(searchError instanceof Error ? searchError.message : "Wrike Task Link search failed."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [directMode, editing, query, selected, version.id]);

  const apply = (link: LinkResult, method: VersionWrikeTaskReference["linkMethod"], verifiedAt: string | null = null) => {
    const now = new Date().toISOString();
    onReferencesChange([{ id: link.id, wrikeTaskId: link.wrikeTaskId, taskTitle: link.taskTitle, projectId: null, projectTitle: link.projectTitle, taskStatus: link.taskStatus, assigneeNames: link.assigneeNames, dueDate: link.dueDate, permalink: link.permalink, provider: "Live Wrike", retrievedAt: now, linkedAt: active?.linkedAt ?? now, linkedBy: active?.linkedBy ?? "Current user", linkMethod: method, lastVerifiedAt: verifiedAt, updatedAt: link.updatedAt, wrikePublishedDate: link.wrikePublishedDate }]);
    close(); setQuery("");
  };

  const saveLink = async () => {
    if (!directMode && !selected) return;
    setPending(true); setError("");
    try {
      const body = directMode ? { permalink: query.trim(), expectedUpdatedAt: active?.updatedAt } : { candidateTaskId: selected!.wrikeTaskId, expectedUpdatedAt: active?.updatedAt };
      const response = await fetch(`/api/course-versions/${version.id}/wrike/link`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { link?: LinkResult; message?: string };
      if (!response.ok || !result.link) throw new Error(result.message || "Wrike Task Link could not be saved.");
      apply(result.link, directMode ? "manual_permalink" : "selected_candidate");
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Wrike Task Link could not be saved."); }
    finally { setPending(false); }
  };

  const verify = async () => {
    if (!active) return; setPending(true); setError("");
    try { const response = await fetch(`/api/course-versions/${version.id}/wrike/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ referenceId: active.id, expectedUpdatedAt: active.updatedAt }) }); const result = await response.json() as { link?: LinkResult; message?: string }; if (!response.ok || !result.link) throw new Error(result.message || "Wrike Task Link could not be verified."); apply(result.link, active.linkMethod, result.link.lastVerifiedAt ?? new Date().toISOString()); }
    catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Wrike Task Link could not be verified."); } finally { setPending(false); }
  };

  const unlink = async () => {
    if (!active) return; setPending(true); setError("");
    try { const response = await fetch(`/api/course-versions/${version.id}/wrike/link`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ referenceId: active.id, expectedUpdatedAt: active.updatedAt }) }); const result = await response.json() as { unlinked?: boolean; message?: string }; if (!response.ok || !result.unlinked) throw new Error(result.message || "Wrike Task Link could not be removed."); onReferencesChange([]); }
    catch (submitError) { setError(submitError instanceof Error ? submitError.message : "Wrike Task Link could not be removed."); } finally { setPending(false); }
  };

  if (!active && !canManage) return <span className="wrike-empty">No Wrike Task Link</span>;

  const dialog = editing ? createPortal(<div ref={dialogRef} className="wrike-link-popout" role="dialog" aria-modal="false" aria-labelledby={`${listId}-title`} style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight }}>
    <div className="panel-heading"><div><strong id={`${listId}-title`}>{active ? "Relink Wrike task" : "Link Wrike task"}</strong><p>Search synchronized tasks or paste a Wrike URL.</p></div><button type="button" className="icon-action" aria-label="Close Wrike task linker" onClick={close}><X size={16} /></button></div>
    <div className="wrike-combobox"><label htmlFor={`${listId}-input`}>Wrike Task Link</label><input ref={inputRef} id={`${listId}-input`} role="combobox" aria-autocomplete="list" aria-expanded={!directMode && candidates.length > 0} aria-controls={listId} aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined} placeholder="Search by task name or paste a Wrike URL…" value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(candidates.length - 1, index + 1)); } else if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)); } else if (event.key === "Enter" && !directMode && activeIndex >= 0) { event.preventDefault(); setSelected(candidates[activeIndex]!); setQuery(candidates[activeIndex]!.title); } }} />
      <div className="sr-only" role="status" aria-live="polite">{loading ? "Searching synchronized Wrike tasks" : directMode ? "Valid Wrike URL detected. Direct-link mode." : connectorState?.message ?? `${candidates.length} candidates available.`}</div>
      {directMode && <p className="combobox-hint">Direct-link mode: CourseTrack will verify this task before saving.</p>}
      {!directMode && query.trim().length === 1 && <p className="combobox-hint">Enter at least two characters.</p>}
      {!directMode && <ul id={listId} role="listbox" className="wrike-candidate-list">{candidates.map((candidate, index) => <li id={`${listId}-${index}`} role="option" aria-selected={selected?.wrikeTaskId === candidate.wrikeTaskId} key={candidate.wrikeTaskId}><button type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => { setSelected(candidate); setQuery(candidate.title); }}><strong>{candidate.title}</strong><span className="wrike-candidate-reporting-year">Reporting year: {candidate.reportingYear ?? "not set"}</span><span>{candidate.wrikeTaskId} · {candidate.projectTitles.join(", ") || "No indexed folder/project"}</span><span>{candidate.status ?? "No status"} · {candidate.assigneeNames.join(", ") || "Unassigned"} · Due {candidate.dueDate ?? "not set"}</span></button></li>)}{!loading && connectorState?.status === "ready" && candidates.length === 0 && <li className="empty-hint">No synchronized tasks match this search.</li>}</ul>}
      {connectorState && connectorState.status !== "ready" && <div className="inline-alert" role="status">{connectorState.message}</div>}
      {error && <p className="taxonomy-editor-error" role="alert">{error}</p>}
      <div className="button-row"><button type="button" className="button button-secondary" onClick={close}>Cancel</button><button type="button" className="button button-primary" disabled={pending || (!directMode && !selected)} onClick={saveLink}>{pending ? "Verifying…" : active ? "Relink task" : "Link task"}</button></div>
    </div>
  </div>, document.body) : null;

  if (active) return <><div className="wrike-reference"><Link2 size={13} /><strong>{active.taskTitle}</strong><small>{active.wrikeTaskId}{active.projectTitle ? ` · ${active.projectTitle}` : ""}{active.lastVerifiedAt ? ` · Verified ${new Date(active.lastVerifiedAt).toLocaleDateString()}` : ""}</small>{active.permalink && <a href={active.permalink} target="_blank" rel="noopener noreferrer">Open in Wrike</a>}{canManage && <div className="wrike-cell-actions"><button disabled={pending} onClick={verify}>Verify</button><button ref={triggerRef} disabled={pending} onClick={() => setEditing(true)} aria-haspopup="dialog" aria-expanded={editing}>Relink</button><button disabled={pending} onClick={unlink}>Unlink</button></div>}{!editing && error && <p className="taxonomy-editor-error" role="alert">{error}</p>}</div>{dialog}</>;
  return <><button ref={triggerRef} type="button" className="button button-secondary" onClick={() => setEditing(true)} aria-haspopup="dialog" aria-expanded={editing}>Link Wrike task</button>{dialog}</>;
}
