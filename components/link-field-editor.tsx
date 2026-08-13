"use client";

import { useState } from "react";
import { Pencil, Save } from "lucide-react";
import { LmsLinkAction, type LmsLinkKind } from "./lms-link-actions";

export function LinkFieldEditor({
  kind,
  value,
  label,
  editable,
  pending,
  onSave,
}: {
  kind: LmsLinkKind;
  value: unknown;
  label: string;
  editable: boolean;
  pending: boolean;
  onSave: (nextValue: string) => Promise<void> | void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const begin = () => {
    setDraft(typeof value === "string" ? value : "");
    setEditing(true);
  };

  const save = async () => {
    await onSave(draft);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="link-field-editor">
        <input
          aria-label={`Edit ${label}`}
          autoFocus
          type="url"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setEditing(false);
            if (event.key === "Enter") { event.preventDefault(); void save(); }
          }}
        />
        <div className="inline-field-actions">
          <button disabled={pending} onClick={() => void save()}><Save size={13} /> Save</button>
          <button disabled={pending} onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div className="link-field-display">
      <LmsLinkAction kind={kind} value={value} />
      {!value && <span className="link-field-empty">Not supplied</span>}
      {editable && (
        <button aria-label={`Edit ${label}`} onClick={begin}><Pencil size={13} /></button>
      )}
    </div>
  );
}
