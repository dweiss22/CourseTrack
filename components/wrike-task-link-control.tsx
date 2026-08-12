"use client";

import { Link2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { CourseVersion, VersionWrikeTaskReference } from "@/types/course";
import type { WrikeConnectorState, WrikeTaskCandidate } from "@/db";

type LinkResult = {
  id: string; wrikeTaskId: string; taskTitle: string; permalink: string | null;
  taskStatus: string | null; projectTitle: string | null; assigneeNames: string[];
  dueDate: string | null; updatedAt: string; lastVerifiedAt?: string; wrikePublishedDate: string | null;
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
  const directMode = wrikeUrl(query.trim());

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
    setEditing(false); setQuery(""); setSelected(null); setCandidates([]);
  };

  const saveLink = async () => {
    if (!directMode && !selected) return;
    setPending(true); setError("");
    try {
      const body = directMode ? { permalink: query.trim(), expectedUpdatedAt: active?.updatedAt } : { candidateTaskId: selected!.wrikeTaskId, expectedUpdatedAt: active?.updatedAt };
      const response = await fetch(`/api/course-versions/${version.id}/wrike/link`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { link?: LinkResult; message?: string }; if (!response.ok || !result.link) throw new Error(result.message || "Wrike Task Link could not be saved.");
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

  if (active && !editing) return <div className="wrike-reference"><Link2 size={13} /><strong>{active.taskTitle}</strong><small>{active.wrikeTaskId}{active.projectTitle ? ` · ${active.projectTitle}` : ""}{active.lastVerifiedAt ? ` · Verified ${new Date(active.lastVerifiedAt).toLocaleDateString()}` : ""}</small>{active.permalink && <a href={active.permalink} target="_blank" rel="noopener noreferrer">Open in Wrike</a>}{canManage && <div className="wrike-cell-actions"><button disabled={pending} onClick={verify}>Verify</button><button disabled={pending} onClick={() => setEditing(true)}>Relink</button><button disabled={pending} onClick={unlink}>Unlink</button></div>}{error && <p className="taxonomy-editor-error" role="alert">{error}</p>}</div>;
  if (!canManage) return <span className="wrike-empty">No Wrike Task Link</span>;
  if (!editing) return <button type="button" className="button button-secondary" onClick={() => setEditing(true)}>Link Wrike task</button>;

  return <div className="wrike-combobox"><label htmlFor={`${listId}-input`}>Wrike Task Link</label><input id={`${listId}-input`} role="combobox" aria-autocomplete="list" aria-expanded={!directMode && candidates.length > 0} aria-controls={listId} aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined} placeholder="Search by task name or paste a Wrike URL…" value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex((index) => Math.min(candidates.length - 1, index + 1)); } else if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => Math.max(0, index - 1)); } else if (event.key === "Enter" && !directMode && activeIndex >= 0) { event.preventDefault(); setSelected(candidates[activeIndex]!); setQuery(candidates[activeIndex]!.title); } else if (event.key === "Escape") { setEditing(false); setCandidates([]); } }} />
    <div className="sr-only" role="status" aria-live="polite">{loading ? "Searching synchronized Wrike tasks" : directMode ? "Valid Wrike URL detected. Direct-link mode." : connectorState?.message ?? `${candidates.length} candidates available.`}</div>
    {directMode && <p className="combobox-hint">Direct-link mode: CourseTrack will verify this task through read-only Wrike access before saving.</p>}
    {!directMode && query.trim().length === 1 && <p className="combobox-hint">Enter at least two characters.</p>}
    {!directMode && <ul id={listId} role="listbox" className="wrike-candidate-list">{candidates.map((candidate, index) => <li id={`${listId}-${index}`} role="option" aria-selected={selected?.wrikeTaskId === candidate.wrikeTaskId} key={candidate.wrikeTaskId}><button type="button" onPointerDown={(event) => event.preventDefault()} onClick={() => { setSelected(candidate); setQuery(candidate.title); }}><strong>{candidate.title}</strong><span className="wrike-candidate-reporting-year">Reporting year: {candidate.reportingYear ?? "not set"}</span><span>{candidate.wrikeTaskId} · {candidate.projectTitles.join(", ") || "No indexed folder/project"}</span><span>{candidate.status ?? "No status"} · {candidate.assigneeNames.join(", ") || "Unassigned"} · Due {candidate.dueDate ?? "not set"}</span></button></li>)}{!loading && connectorState?.status === "ready" && candidates.length === 0 && <li className="empty-hint">No synchronized tasks match this search.</li>}</ul>}
    {connectorState && connectorState.status !== "ready" && <div className="inline-alert" role="status">{connectorState.message}</div>}
    {error && <p className="taxonomy-editor-error" role="alert">{error}</p>}
    <div className="button-row"><button type="button" className="button button-secondary" onClick={() => setEditing(false)}>Cancel</button><button type="button" className="button button-primary" disabled={pending || (!directMode && !selected)} onClick={saveLink}>{pending ? "Verifying…" : active ? "Relink task" : "Link task"}</button></div>
  </div>;
}
