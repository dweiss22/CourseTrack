import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { apiError, mutationMetadata, validationError } from "@/lib/api-response";
import { revampTaskSchema } from "@/lib/workflow-validation";
import { createRevampTask } from "@/db";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole("super_admin", "admin", "content");
  if ("error" in auth) return auth.error;
  const parsed = revampTaskSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return validationError("Review the Revamp task fields.", parsed.error.issues);
  if (parsed.data.bucket === "Approved" && !["super_admin", "admin"].includes(auth.context.role)) {
    return NextResponse.json({ code: "forbidden", message: "Only an administrator can approve Revamp work." }, { status: 403 });
  }
  try {
    const { id } = await context.params;
    const task = await createRevampTask({ ...parsed.data, courseAppId: id, actor: auth.context });
    return NextResponse.json({ task, ...mutationMetadata(auth.context.userId, task.updatedAt), message: "Revamp task created." }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
