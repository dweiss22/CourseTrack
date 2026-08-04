import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiError, mutationMetadata, validationError } from "@/lib/api-response";
import { noteSchema } from "@/lib/workflow-validation";
import { saveNote } from "@/db";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(); if ("error" in auth) return auth.error;
  const parsed = noteSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return validationError("Review the note fields.", parsed.error.issues);
  try { const { id } = await context.params; const note = await saveNote({ ...parsed.data, courseAppId: id, actor: auth.context }); return NextResponse.json({ note, ...mutationMetadata(auth.context.userId, note.updatedAt), message: "Note created." }, { status: 201 }); }
  catch (error) { return apiError(error); }
}
