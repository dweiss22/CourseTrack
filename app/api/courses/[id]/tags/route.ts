import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth";
import { assignCourseTag, getCourseRecord, removeCourseTag } from "@/db";

const assignSchema = z.object({
  label: z.string().trim().min(1).max(120),
});

const removeSchema = z.object({
  courseTagId: z.string().trim().min(1),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const course = await getCourseRecord(id);
  if (!course) {
    return NextResponse.json({ message: "Course not found." }, { status: 404 });
  }

  const parsed = assignSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ message: "Enter a tag to assign." }, { status: 400 });
  }

  const actor = await requireApiRole("super_admin", "admin", "content");
  if ("error" in actor) return actor.error;

  const saved = await assignCourseTag({ courseId: id, tagLabel: parsed.data.label, actorEmail: actor.context.email });
  return NextResponse.json({
    saved,
    message: saved
      ? "Tag assigned."
      : "The database binding is unavailable; the tag was not saved.",
  });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const course = await getCourseRecord(id);
  if (!course) {
    return NextResponse.json({ message: "Course not found." }, { status: 404 });
  }

  const parsed = removeSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ message: "A tag assignment id is required." }, { status: 400 });
  }

  const actor = await requireApiRole("super_admin", "admin", "content");
  if ("error" in actor) return actor.error;

  const removed = await removeCourseTag({ courseTagId: parsed.data.courseTagId, actorEmail: actor.context.email });
  return NextResponse.json({
    removed,
    message: removed ? "Tag removed." : "The tag assignment could not be removed.",
  });
}
