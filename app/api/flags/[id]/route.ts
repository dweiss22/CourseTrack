import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiError, mutationMetadata, validationError } from "@/lib/api-response";
import { flagSchema } from "@/lib/workflow-validation";
import { archiveWorkflowRecord, saveFlag } from "@/db";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(); if ("error" in auth) return auth.error;
  const parsed = flagSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || !parsed.data.expectedUpdatedAt) return validationError("Review the flag fields.", parsed.success ? undefined : parsed.error.issues);
  try { const { id } = await context.params; const flag = await saveFlag({ id, ...parsed.data, actor: auth.context }); return NextResponse.json({ flag, ...mutationMetadata(auth.context.userId, flag.updatedAt), message: "Flag updated." }); }
  catch (error) { return apiError(error); }
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(); if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({})); if (typeof body.expectedUpdatedAt !== "string") return validationError("A concurrency token is required.");
  try { const { id } = await context.params; await archiveWorkflowRecord({ table: "course_flags", id, expectedUpdatedAt: body.expectedUpdatedAt, actor: auth.context }); return NextResponse.json({ archived: true, message: "Flag archived." }); }
  catch (error) { return apiError(error); }
}
