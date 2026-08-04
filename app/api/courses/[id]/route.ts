import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole, requireApiUser } from "@/lib/auth";
import {
  getCourseRecord,
  setCourseArchived,
  updateInternalCourseMetadata,
} from "@/db";
import { apiError, validationError } from "@/lib/api-response";

const updateSchema = z.object({
  internalSummary: z.string().trim().min(10).max(1_200),
  owner: z.string().trim().min(2).max(120).nullable(),
  nextReviewDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  expectedUpdatedAt: z.string().datetime(),
}).strict();

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

  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return validationError("Review the internal metadata fields.", parsed.error.issues);
  }
  try {
    const updatedAt = await updateInternalCourseMetadata({ courseId: id, actorId: actor.context.userId, actorEmail: actor.context.email, ...parsed.data });
    return NextResponse.json({ saved: true, course: { ...course, ...parsed.data, updatedAt }, audit: { actorId: actor.context.userId, updatedAt }, message: "Internal CourseTrack metadata saved. Source records were not changed." });
  } catch (error) { return apiError(error); }
}
