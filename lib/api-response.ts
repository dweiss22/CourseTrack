import { NextResponse } from "next/server";

export function apiError(error: unknown): NextResponse {
  const message = error instanceof Error ? error.message : "CourseTrack could not complete this request.";
  const lower = message.toLowerCase();
  const status = lower.includes("changed after") || lower.includes("since it was loaded")
    ? 409
    : lower.includes("read-only") || lower.includes("permission")
      ? 403
      : lower.includes("not found")
        ? 404
        : lower.includes("not configured")
          ? 503
          : 500;
  const code = status === 409
    ? "conflict"
    : status === 403
      ? "forbidden"
      : status === 404
        ? "not_found"
        : status === 503
          ? "persistence_unavailable"
          : "server_error";
  return NextResponse.json({ code, message }, { status });
}

export function validationError(message: string, issues?: unknown): NextResponse {
  return NextResponse.json({ code: "validation_error", message, issues }, { status: 422 });
}

export function mutationMetadata(actorId: string, updatedAt?: string) {
  return {
    audit: { actorId, recorded: true },
    concurrency: { updatedAt: updatedAt ?? null },
  };
}
