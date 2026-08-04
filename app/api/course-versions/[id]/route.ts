import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { apiError, mutationMetadata, validationError } from "@/lib/api-response";
import { versionSchema } from "@/lib/workflow-validation";
import { archiveWorkflowRecord, saveVersion } from "@/db";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole("super_admin", "admin", "content");
  if ("error" in auth) return auth.error;
  const parsed = versionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success || !parsed.data.expectedUpdatedAt) return validationError("Review the version fields.", parsed.success ? undefined : parsed.error.issues);
  try {
    const { id } = await context.params;
    const version = await saveVersion({ id, ...parsed.data, actor: auth.context });
    return NextResponse.json({ version, ...mutationMetadata(auth.context.userId, version.updatedAt), message: "Version updated." });
  } catch (error) { return apiError(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole("super_admin", "admin", "content");
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  if (typeof body.expectedUpdatedAt !== "string") return validationError("A concurrency token is required.");
  try {
    const { id } = await context.params;
    await archiveWorkflowRecord({ table: "course_versions", id, expectedUpdatedAt: body.expectedUpdatedAt, actor: auth.context });
    return NextResponse.json({ archived: true, message: "Version archived." });
  } catch (error) { return apiError(error); }
}
