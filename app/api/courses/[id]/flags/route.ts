import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiError, mutationMetadata, validationError } from "@/lib/api-response";
import { flagSchema } from "@/lib/workflow-validation";
import { saveFlag } from "@/db";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;
  const parsed = flagSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return validationError("Review the flag fields.", parsed.error.issues);
  try {
    const { id } = await context.params;
    const flag = await saveFlag({ ...parsed.data, courseAppId: id, actor: auth.context });
    return NextResponse.json({ flag, ...mutationMetadata(auth.context.userId, flag.updatedAt), message: "Flag created." }, { status: 201 });
  } catch (error) { return apiError(error); }
}
