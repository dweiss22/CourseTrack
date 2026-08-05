import { NextResponse } from "next/server";
import { requireApiRole, requireApiUser } from "@/lib/auth";
import {
  getCourseRecord,
  setCourseArchived,
  updateCourseProjection,
} from "@/db";
import { apiError, validationError } from "@/lib/api-response";
import { courseProjectionUpdateSchema } from "@/lib/workflow-validation";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await requireApiUser();
  if ("error" in actor) return actor.error;

  const { id } = await context.params;
  const course = await getCourseRecord(id);
  if (!course) {
    return NextResponse.json({ message: "Course not found." }, { status: 404 });
  }
  return NextResponse.json({ course });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await requireApiRole("super_admin", "admin", "content");
  if ("error" in actor) return actor.error;
  const body = await request.json().catch(() => ({}));
  try { const { id } = await context.params; await setCourseArchived({ courseId: id, archived: true, expectedUpdatedAt: typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : undefined, actor: actor.context }); return NextResponse.json({ archived: true, message: "Course archived." }); }
  catch (error) { return apiError(error); }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const actor = await requireApiRole("super_admin", "admin", "content");
  if ("error" in actor) return actor.error;
  const body = await request.json().catch(() => ({}));
  try { const { id } = await context.params; await setCourseArchived({ courseId: id, archived: false, expectedUpdatedAt: typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : undefined, actor: actor.context }); return NextResponse.json({ restored: true, message: "Course restored." }); }
  catch (error) { return apiError(error); }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await requireApiRole("super_admin", "admin", "content");
  if ("error" in actor) return actor.error;
  const { id } = await context.params;
  const course = await getCourseRecord(id);
  if (!course) {
    return NextResponse.json({ message: "Course not found." }, { status: 404 });
  }

  const parsed = courseProjectionUpdateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return validationError("Review the CourseTrack fields.", parsed.error.issues);
  }
  try {
    const mutation = await updateCourseProjection({ courseId: id, actorId: actor.context.userId, actorEmail: actor.context.email, payload: parsed.data });
    const updated = await getCourseRecord(id);
    return NextResponse.json({
      saved: true,
      course: updated,
      sourceDifferenceCount: mutation.sourceDifferenceCount,
      audit: { actorId: actor.context.userId, updatedAt: mutation.updatedAt },
      message: "CourseTrack fields saved. Immutable LMS and uploaded source records were not changed.",
    });
  } catch (error) { return apiError(error); }
}
