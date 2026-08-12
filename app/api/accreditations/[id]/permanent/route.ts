import { NextResponse } from "next/server";
import { deleteArchivedAccreditation } from "@/db";
import { apiError, validationError } from "@/lib/api-response";
import { requireApiRole } from "@/lib/auth";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole("super_admin", "admin", "accreditation");
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  if (typeof body.expectedUpdatedAt !== "string") return validationError("A concurrency token is required.");
  try {
    const { id } = await context.params;
    await deleteArchivedAccreditation({ id, expectedUpdatedAt: body.expectedUpdatedAt, actor: auth.context });
    return NextResponse.json({ deleted: true, message: "Archived accreditation permanently deleted." });
  } catch (error) { return apiError(error); }
}
