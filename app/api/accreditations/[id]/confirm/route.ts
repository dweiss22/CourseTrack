import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { apiError, validationError } from "@/lib/api-response";
import { confirmDataAlignment } from "@/db";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole("super_admin", "admin", "accreditation");
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  if (typeof body.expectedUpdatedAt !== "string") return validationError("A concurrency token is required.");
  try {
    const { id } = await context.params;
    const record = await confirmDataAlignment({ recordType: "accreditation", recordId: id, note: typeof body.note === "string" ? body.note : null, expectedUpdatedAt: body.expectedUpdatedAt, actor: auth.context });
    return NextResponse.json({ record, message: "Manual LMS alignment confirmed." });
  } catch (error) { return apiError(error); }
}
