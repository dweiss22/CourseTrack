"use client";

import { CircleHelp, X } from "lucide-react";
import { useRef } from "react";
import { HEALTH_FACTORS, HEALTH_LEVELS, HEALTH_SCORING, REQUIRED_HEALTH_METADATA_FIELDS } from "@/lib/health";

export function HealthAboutDialog({ compact = false }: { compact?: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button
        type="button"
        className={compact ? "icon-action" : "button button-ghost"}
        onClick={() => dialogRef.current?.showModal()}
        aria-label="About CourseTrack Health Levels"
      >
        <CircleHelp size={16} aria-hidden="true" />
        {!compact && "About health levels"}
      </button>
      <dialog ref={dialogRef} className="health-dialog" aria-labelledby="health-dialog-title">
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">Shared scoring model</span>
            <h2 id="health-dialog-title">About CourseTrack Health Levels</h2>
          </div>
          <button type="button" className="icon-action" onClick={() => dialogRef.current?.close()} aria-label="Close health information">
            <X size={18} />
          </button>
        </div>
        <p>Every CourseTrack screen and report uses the same score. Scores are clamped between {HEALTH_SCORING.minimumScore} and {HEALTH_SCORING.maximumScore}.</p>
        <div className="health-range-list">
          {HEALTH_LEVELS.map((level) => (
            <div key={level.status}>
              <strong>{level.status}</strong>
              <span>{level.min}–{level.max}</span>
              <p>{level.summary}</p>
            </div>
          ))}
        </div>
        <h3>Factors</h3>
        <ul>
          {HEALTH_FACTORS.map((factor) => <li key={factor.key}><strong>{factor.label}:</strong> {factor.detail}</li>)}
        </ul>
        <details>
          <summary>Calculation details</summary>
          <p><code>{`clamp(${HEALTH_SCORING.minimumScore}, ${HEALTH_SCORING.maximumScore}, metadata completeness − ${HEALTH_SCORING.unresolvedConflictPenalty} × unresolved discrepancies − ${HEALTH_SCORING.importValidationErrorPenalty} × import validation errors − ${HEALTH_SCORING.missingLmsSnapshotPenalty} when no current LMS snapshot exists)`}</code></p>
          <p>Metadata completeness measures whether each of these fields is present:</p>
          <ul>{REQUIRED_HEALTH_METADATA_FIELDS.map((field) => <li key={field}>{field}</li>)}</ul>
        </details>
        <form method="dialog" className="dialog-actions"><button className="button button-primary">Close</button></form>
      </dialog>
    </>
  );
}
