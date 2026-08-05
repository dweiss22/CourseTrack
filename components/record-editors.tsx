"use client";

import type { FormEvent, ReactNode } from "react";
import { X } from "lucide-react";
import type { AccreditationRecord, CourseVersion } from "@/types/course";

export function AccreditationRecordEditor({ record, courseField, pending, apiLocked = false, onSubmit, onCancel }: {
  record: AccreditationRecord | null;
  courseField: ReactNode;
  pending: boolean;
  apiLocked?: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const locked = apiLocked && record?.sourceDomain === "lms";
  return <form className="panel workflow-form" onSubmit={onSubmit}>
    <div className="panel-heading"><div><h2>{record ? "Edit accreditation record" : "Add accreditation record"}</h2><p>{locked ? "LMS source fields are locked in API mode; status and credits remain editable." : "Source evidence remains unchanged when CourseTrack values are edited."}</p></div><button type="button" className="icon-action" aria-label="Cancel accreditation editing" onClick={onCancel}><X size={18} /></button></div>
    <div className="form-grid">
      {courseField}
      <label>Issuing body<input name="organization" required minLength={2} disabled={locked} defaultValue={record?.organization ?? ""} /></label>
      <label>State / jurisdiction<input name="jurisdiction" required disabled={locked} defaultValue={record ? record.jurisdiction : "National"} /></label>
      <label>Status<select name="status" defaultValue={record?.status ?? "Approved"}>{["Approved", "Approved with Conditions", "Renewal Due", "Renewal Submitted", "Expiring Soon", "Expired", "Not Required"].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Accreditation number<input name="approvalNumber" disabled={locked} defaultValue={record?.approvalNumber ?? ""} /></label>
      <label>Topic number<input name="topicNumber" disabled={locked} defaultValue={record?.topicNumber ?? ""} /></label>
      <label>Credit hours<input name="creditHours" type="number" min={0} step="0.25" defaultValue={record?.creditHours ?? 0} /></label>
      <label>Start date<input name="effectiveDate" type="date" disabled={locked} defaultValue={record?.effectiveDate ?? ""} /></label>
      <label>End date<input name="expirationDate" type="date" disabled={locked} defaultValue={record?.expirationDate ?? ""} /></label>
    </div>
    <div className="button-row"><button type="button" className="button button-secondary" onClick={onCancel}>Cancel</button><button className="button button-primary" disabled={pending}>{pending ? "Saving…" : "Save accreditation"}</button></div>
  </form>;
}

export function VersionRecordEditor({ version, courseField, pending, onSubmit, onCancel }: {
  version: CourseVersion | null;
  courseField: ReactNode;
  pending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return <form className="panel workflow-form" onSubmit={onSubmit}>
    <div className="panel-heading"><div><h2>{version ? "Edit version" : "Create version"}</h2><p>Versions are managed by CourseTrack and retain their original provenance.</p></div><button type="button" className="icon-action" aria-label="Cancel version editing" onClick={onCancel}><X size={18} /></button></div>
    <div className="form-grid">
      {courseField}
      <label>Version<input name="versionNumber" required defaultValue={version?.versionNumber ?? ""} /></label>
      <label>Type<select name="versionType" defaultValue={version?.versionType ?? "Minor Revision"}>{["Initial Release", "Minor Revision", "Major Revision", "Technical Update", "Accessibility Update", "Legal Update", "Accreditation Update"].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>CourseTrack publication date<input name="publicationDate" type="date" required defaultValue={version?.publicationDate ?? ""} /></label>
      <label>Status<select name="versionStatus" defaultValue={version?.versionStatus ?? "Draft"}>{["Draft", "In Review", "Scheduled", "Published", "Superseded"].map((value) => <option key={value}>{value}</option>)}</select></label>
      <label>Authoring tool<input name="authoringTool" defaultValue={version?.authoringTool ?? ""} /></label>
      <label>Package standard<input name="packageStandard" defaultValue={version?.packageStandard ?? ""} /></label>
      <label className="checkbox-field"><input name="isCurrent" type="checkbox" defaultChecked={version?.isCurrent ?? false} /> Current version</label>
      <label className="form-span">Release notes<textarea name="releaseNotes" defaultValue={version?.releaseNotes ?? ""} /></label>
    </div>
    <div className="button-row"><button type="button" className="button button-secondary" onClick={onCancel}>Cancel</button><button className="button button-primary" disabled={pending}>{pending ? "Saving…" : "Save version"}</button></div>
  </form>;
}
