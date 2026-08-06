"use client";

type ApplicationErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export function ApplicationError({ error, reset }: ApplicationErrorProps) {
  const incidentId = error.digest?.trim() || "not available";
  return (
    <main className="application-error" role="alert">
      <div className="application-error-card">
        <p className="eyebrow">CourseTrack</p>
        <h1>This page couldn&apos;t load</h1>
        <p>A server error occurred. Try the request again. If it continues, share the incident identifier with support.</p>
        <p className="application-error-incident">Incident: <code>{incidentId}</code></p>
        <button type="button" className="button primary" onClick={reset}>Try again</button>
      </div>
    </main>
  );
}
