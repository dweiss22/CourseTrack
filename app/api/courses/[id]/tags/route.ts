import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth";
import { assignCourseTag, getCourseRecord, removeCourseTag } from "@/db";
import { apiError, validationError } from "@/lib/api-response";

const assignSchema = z.object({
  label: z.string().trim().min(1).max(120),
}).strict();

const removeSchema = z.object({
  courseTagId: z.string().trim().min(1),
}).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await requireApiRole("super_admin", "admin", "content");
  if ("error" in actor) return actor.error;
  const { id } = await context.params;
  const course = await getCourseRecord(id);
  if (!course) {
    return NextResponse.json({ code: "not_found", message: "Course not found." }, { status: 404 });
  }

  const parsed = assignSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return validationError("Enter a tag to assign.", parsed.error.issues);
  }

  try { const saved = await assignCourseTag({ courseId: id, tagLabel: parsed.data.label, actorEmail: actor.context.email }); if (!saved) throw new Error("The tag assignment was rejected."); return NextResponse.json({ saved, message: "Tag assigned." }); } catch (error) { return apiError(error); }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await requireApiRole("super_admin", "admin", "content");
  if ("error" in actor) return actor.error;
  const { id } = await context.params;
  const course = await getCourseRecord(id);
  if (!course) {
    return NextResponse.json({ code: "not_found", message: "Course not found." }, { status: 404 });
  }

  const parsed = removeSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return validationError("A tag assignment id is required.", parsed.error.issues);
  }

  try { const removed = await removeCourseTag({ courseTagId: parsed.data.courseTagId, actorEmail: actor.context.email }); if (!removed) return NextResponse.json({ code: "forbidden", message: "Only manual CourseTrack tag assignments can be removed." }, { status: 403 }); return NextResponse.json({ removed, message: "Tag removed." }); } catch (error) { return apiError(error); }
}
