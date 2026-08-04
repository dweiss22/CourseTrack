import { NextResponse } from "next/server";
import { assignCourseRelationship } from "@/db";
import { apiError, validationError } from "@/lib/api-response";
import { requireApiRole } from "@/lib/auth";
import { relationshipSchema } from "@/lib/workflow-validation";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole("super_admin", "admin", "content");
  if ("error" in auth) return auth.error;
  const parsed = relationshipSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return validationError("Choose a valid related course and relationship.", parsed.error.issues);
  try { const { id } = await context.params; const relationship = await assignCourseRelationship({ courseId: id, ...parsed.data, actor: auth.context }); return NextResponse.json({ relationship, message: "Relationship assigned." }, { status: 201 }); }
  catch (error) { return apiError(error); }
}
