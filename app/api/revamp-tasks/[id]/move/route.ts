import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { apiError, mutationMetadata, validationError } from "@/lib/api-response";
import { revampMoveSchema } from "@/lib/workflow-validation";
import { moveRevampTask } from "@/db";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole("super_admin", "admin", "content");
  if ("error" in auth) return auth.error;
  const parsed = revampMoveSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return validationError("Choose a valid destination.", parsed.error.issues);
  if (parsed.data.bucket === "Approved" && !["super_admin", "admin"].includes(auth.context.role)) {
    return NextResponse.json({ code: "forbidden", message: "Only an administrator can approve Revamp work." }, { status: 403 });
  }
  try {
    const { id } = await context.params;
    const result = await moveRevampTask({ id, ...parsed.data, actor: auth.context });
    return NextResponse.json({ ...result, ...mutationMetadata(auth.context.userId, result.task.updatedAt), message: `Revamp task moved to ${parsed.data.bucket}.` });
  } catch (error) {
    return apiError(error);
  }
}
