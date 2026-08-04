import { NextResponse } from "next/server";
import { createCourseProjection } from "@/db";
import { apiError, validationError } from "@/lib/api-response";
import { requireApiRole } from "@/lib/auth";
import { courseCreateSchema } from "@/lib/workflow-validation";

export async function POST(request: Request) {
  const auth = await requireApiRole("super_admin", "admin", "content");
  if ("error" in auth) return auth.error;
  const parsed = courseCreateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return validationError("Review the course fields.", parsed.error.issues);
  try {
    const course = await createCourseProjection({ ...parsed.data, actor: auth.context });
    return NextResponse.json({ course, message: "Course created." }, { status: 201 });
  } catch (error) { return apiError(error); }
}
