import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiError, mutationMetadata, validationError } from "@/lib/api-response";
import { noteSchema } from "@/lib/workflow-validation";
import { archiveWorkflowRecord, saveNote } from "@/db";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(); if ("error" in auth) return auth.error;
  const parsed = noteSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || !parsed.data.expectedUpdatedAt) return validationError("Review the note fields.", parsed.success ? undefined : parsed.error.issues);
  try { const { id } = await context.params; const note = await saveNote({ id, ...parsed.data, actor: auth.context }); return NextResponse.json({ note, ...mutationMetadata(auth.context.userId, note.updatedAt), message: "Note updated." }); }
  catch (error) { return apiError(error); }
}
export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(); if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({})); if (typeof body.expectedUpdatedAt !== "string") return validationError("A concurrency token is required.");
  try { const { id } = await context.params; await archiveWorkflowRecord({ table: "notes", id, expectedUpdatedAt: body.expectedUpdatedAt, actor: auth.context }); return NextResponse.json({ archived: true, message: "Note archived." }); }
  catch (error) { return apiError(error); }
}
