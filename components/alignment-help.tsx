"use client";

import { CircleHelp } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";
import type { DataAlignmentStatus } from "@/types/course";
import { ALIGNMENT_DEFINITIONS } from "@/lib/alignment-status";
import { StatusBadge } from "./status-badge";

export function AlignmentStatusBadge({ status, tone, children }: { status: DataAlignmentStatus; tone?: "success" | "warning" | "danger" | "info" | "neutral"; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const descriptionId = useId();
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  return (
    <span className="alignment-help" ref={root} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" className="alignment-help-trigger" aria-expanded={open} aria-describedby={descriptionId} onFocus={() => setOpen(true)} onBlur={(event) => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget)) setOpen(false); }} onClick={() => setOpen((value) => !value)}>
        <StatusBadge tone={tone}>{children ?? status}</StatusBadge>
        <span className="sr-only">Explain {status}</span>
      </button>
      <span className="alignment-help-popover" id={descriptionId} role="tooltip" hidden={!open}>{ALIGNMENT_DEFINITIONS[status]}</span>
    </span>
  );
}

export function AlignmentGlossary() {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("keydown", close);
    requestAnimationFrame(() => dialog.current?.querySelector<HTMLButtonElement>("button")?.focus());
    return () => document.removeEventListener("keydown", close);
  }, [open]);
  return (
    <span className="alignment-glossary">
      <button ref={trigger} type="button" className="button button-secondary" aria-expanded={open} onClick={() => setOpen((value) => !value)}><CircleHelp size={15} aria-hidden="true" /> Alignment glossary</button>
      {open && <div className="alignment-glossary-popover" ref={dialog} role="dialog" aria-label="Alignment status glossary"><button type="button" className="glossary-close" onClick={() => setOpen(false)}>Close</button><dl>{Object.entries(ALIGNMENT_DEFINITIONS).map(([status, description]) => <div key={status}><dt>{status}</dt><dd>{description}</dd></div>)}</dl></div>}
    </span>
  );
}
