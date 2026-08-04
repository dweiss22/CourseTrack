import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { apiError, mutationMetadata, validationError } from "@/lib/api-response";
import { revampTaskSchema } from "@/lib/workflow-validation";
import { archiveWorkflowRecord, updateRevampTask } from "@/db";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole("super_admin", "admin", "content");
  if ("error" in auth) return auth.error;
  const parsed = revampTaskSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || !parsed.data.expectedUpdatedAt) return validationError("Review the Revamp task fields.", parsed.success ? undefined : parsed.error.issues);
  try {
    const { id } = await context.params;
    const task = await updateRevampTask({ id, ...parsed.data, expectedUpdatedAt: parsed.data.expectedUpdatedAt, actor: auth.context });
    return NextResponse.json({ task, ...mutationMetadata(auth.context.userId, task.updatedAt), message: "Revamp task updated." });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole("super_admin", "admin", "content");
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  if (typeof body.expectedUpdatedAt !== "string") return validationError("A concurrency token is required.");
  try {
    const { id } = await context.params;
    await archiveWorkflowRecord({ table: "revamp_proposals", id, expectedUpdatedAt: typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : undefined, actor: auth.context });
    return NextResponse.json({ archived: true, message: "Revamp task archived." });
  } catch (error) {
    return apiError(error);
  }
}
