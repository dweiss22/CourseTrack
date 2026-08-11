import { ExternalLink, LockKeyhole } from "lucide-react";
import { hasInvalidExternalUrl, normalizedHttpUrl } from "@/lib/external-url";

export type LmsLinkKind = "backend" | "course";

export function LmsLinkAction({
  kind,
  value,
  courseName,
  compact = false,
}: {
  kind: LmsLinkKind;
  value: unknown;
  courseName?: string;
  compact?: boolean;
}) {
  const href = normalizedHttpUrl(value);
  const label = kind === "backend" ? "Open LMS backend" : "Open LMS course";
  const accessibleLabel = `${label}${courseName ? ` for ${courseName}` : ""} in a new tab`;
  if (href) {
    return (
      <a
        className={compact ? "lms-link-action is-compact" : `button ${kind === "backend" ? "button-primary" : "button-secondary"}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={accessibleLabel}
      >
        {kind === "backend" ? <LockKeyhole size={compact ? 14 : 15} aria-hidden="true" /> : <ExternalLink size={compact ? 14 : 15} aria-hidden="true" />}
        <span>{compact ? (kind === "backend" ? "Backend" : "Course") : label}</span>
      </a>
    );
  }
  if (hasInvalidExternalUrl(value)) {
    return <span className="lms-link-invalid" role="status">Invalid {kind === "backend" ? "backend" : "course"} link</span>;
  }
  return null;
}

export function LmsLinkActions({
  backendLink,
  frontendLink,
  courseName,
  compact = false,
  showUnavailable = true,
}: {
  backendLink: unknown;
  frontendLink: unknown;
  courseName?: string;
  compact?: boolean;
  showUnavailable?: boolean;
}) {
  const hasValues = Boolean(normalizedHttpUrl(backendLink) || normalizedHttpUrl(frontendLink) || hasInvalidExternalUrl(backendLink) || hasInvalidExternalUrl(frontendLink));
  return (
    <div className={`lms-link-actions${compact ? " is-compact" : ""}`} aria-label="LMS links">
      <LmsLinkAction kind="backend" value={backendLink} courseName={courseName} compact={compact} />
      <LmsLinkAction kind="course" value={frontendLink} courseName={courseName} compact={compact} />
      {!hasValues && showUnavailable && <span className="lms-links-unavailable">No LMS links</span>}
    </div>
  );
}

export function RestrictedLinkPresence({ value, kind }: { value: unknown; kind: LmsLinkKind }) {
  const present = typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined;
  return <span className="restricted-link-presence">{present ? `${kind === "backend" ? "Restricted backend" : "Course"} link present` : "Not supplied"}</span>;
}
