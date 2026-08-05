import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiError, mutationMetadata, validationError } from "@/lib/api-response";
import { flagSchema } from "@/lib/workflow-validation";
import { deleteWorkflowRecordPermanently, saveFlag } from "@/db";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(); if ("error" in auth) return auth.error;
  const parsed = flagSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || !parsed.data.expectedUpdatedAt) return validationError("Review the task or callout fields.", parsed.success ? undefined : parsed.error.issues);
  try { const { id } = await context.params; const flag = await saveFlag({ id, ...parsed.data, actor: auth.context }); return NextResponse.json({ flag, ...mutationMetadata(auth.context.userId, flag.updatedAt), message: `${flag.recordKind} updated.` }); }
  catch (error) { return apiError(error); }
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(); if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({})); if (typeof body.expectedUpdatedAt !== "string") return validationError("A concurrency token is required.");
  try { const { id } = await context.params; await deleteWorkflowRecordPermanently({ table: "course_flags", id, expectedUpdatedAt: body.expectedUpdatedAt, actor: auth.context }); return NextResponse.json({ deleted: true, message: "Task or callout permanently deleted. An audit snapshot was retained." }); }
  catch (error) { return apiError(error); }
}
