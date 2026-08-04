import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { apiError, mutationMetadata, validationError } from "@/lib/api-response";
import { versionSchema } from "@/lib/workflow-validation";
import { saveVersion } from "@/db";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole("super_admin", "admin", "content");
  if ("error" in auth) return auth.error;
  const parsed = versionSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return validationError("Review the version fields.", parsed.error.issues);
  try {
    const { id } = await context.params;
    const version = await saveVersion({ ...parsed.data, courseAppId: id, actor: auth.context });
    return NextResponse.json({ version, ...mutationMetadata(auth.context.userId, version.updatedAt), message: "Version created." }, { status: 201 });
  } catch (error) { return apiError(error); }
}
