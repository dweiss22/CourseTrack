import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { apiError, validationError } from "@/lib/api-response";
import { restoreManagedRecord } from "@/db";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole("super_admin", "admin");
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  if (typeof body.expectedUpdatedAt !== "string") return validationError("A concurrency token is required.");
  try {
    const { id } = await context.params;
    await restoreManagedRecord({ table: "accreditation_records", id, expectedUpdatedAt: body.expectedUpdatedAt, actor: auth.context });
    return NextResponse.json({ restored: true, message: "Accreditation restored." });
  } catch (error) { return apiError(error); }
}
