import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { apiError, validationError } from "@/lib/api-response";
import { confirmDataAlignment } from "@/db";

export async function POST(request: Request, context: { params: Promise<{ id: string; comparisonId: string }> }) {
  const auth = await requireApiRole("super_admin", "admin", "content");
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  if (typeof body.expectedUpdatedAt !== "string") return validationError("A concurrency token is required.");
  if (body.note !== undefined && body.note !== null && typeof body.note !== "string") return validationError("Confirmation note must be text.");
  try {
    const { comparisonId } = await context.params;
    const comparison = await confirmDataAlignment({ recordType: "field_comparison", recordId: comparisonId, note: body.note ?? null, expectedUpdatedAt: body.expectedUpdatedAt, actor: auth.context });
    return NextResponse.json({ comparison, message: "Manual LMS alignment confirmed." });
  } catch (error) { return apiError(error); }
}
