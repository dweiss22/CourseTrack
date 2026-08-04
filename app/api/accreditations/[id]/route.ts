import { requireApiRole } from "@/lib/auth";
import { apiError, mutationMetadata, validationError } from "@/lib/api-response";
import { accreditationSchema } from "@/lib/workflow-validation";
import { archiveWorkflowRecord, saveAccreditation } from "@/db";
import { NextResponse } from "next/server";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole("super_admin", "admin", "accreditation");
  if ("error" in auth) return auth.error;
  const parsed = accreditationSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || !parsed.data.expectedUpdatedAt) return validationError("Review the accreditation fields.", parsed.success ? undefined : parsed.error.issues);
  try {
    const { id } = await context.params;
    const record = await saveAccreditation({ id, ...parsed.data, actor: auth.context });
    return NextResponse.json({ record, ...mutationMetadata(auth.context.userId, record.updatedAt), message: "Accreditation updated." });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole("super_admin", "admin", "accreditation");
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  if (typeof body.expectedUpdatedAt !== "string") return validationError("A concurrency token is required.");
  try {
    const { id } = await context.params;
    await archiveWorkflowRecord({ table: "accreditation_records", id, expectedUpdatedAt: body.expectedUpdatedAt, actor: auth.context });
    return NextResponse.json({ archived: true, message: "Accreditation archived." });
  } catch (error) { return apiError(error); }
}
