import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth";
import { assignCourseTopic, getCourseRecord, removeCourseTopic } from "@/db";

const assignSchema = z.object({
  label: z.string().trim().min(1).max(120),
});

const removeSchema = z.object({
  courseTopicId: z.string().trim().min(1),
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
    return NextResponse.json({ message: "Enter a topic to assign." }, { status: 400 });
  }

  const actor = await requireApiRole("super_admin", "admin", "content");
  if ("error" in actor) return actor.error;

  const saved = await assignCourseTopic({ courseId: id, topicLabel: parsed.data.label, actorEmail: actor.context.email });
  return NextResponse.json({
    saved,
    message: saved
      ? "Topic assigned."
      : "The database binding is unavailable; the topic was not saved.",
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
    return NextResponse.json({ message: "A topic assignment id is required." }, { status: 400 });
  }

  const actor = await requireApiRole("super_admin", "admin", "content");
  if ("error" in actor) return actor.error;

  const removed = await removeCourseTopic({ courseTopicId: parsed.data.courseTopicId, actorEmail: actor.context.email });
  return NextResponse.json({
    removed,
    message: removed
      ? "Topic removed."
      : "The topic assignment could not be removed (it may be LMS or import sourced).",
  });
}
