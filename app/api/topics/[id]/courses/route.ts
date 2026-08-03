import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth";
import { assignTopicToCourses, getCoursesForTopic, removeCourseTopic } from "@/db";

const assignSchema = z.object({
  label: z.string().trim().min(1).max(120),
  courseIds: z.array(z.string().trim().min(1)).min(1),
});

const removeSchema = z.object({
  assignmentIds: z.array(z.string().trim().min(1)).min(1),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const actor = await requireApiRole("super_admin", "admin", "content");
  if ("error" in actor) return actor.error;

  const { id } = await context.params;
  const courses = await getCoursesForTopic(id);
  return NextResponse.json({ courses });
}

export async function POST(request: Request) {
  const parsed = assignSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ message: "Select a topic label and at least one course." }, { status: 400 });
  }

  const actor = await requireApiRole("super_admin", "admin", "content");
  if ("error" in actor) return actor.error;

  const assignedCount = await assignTopicToCourses({
    topicLabel: parsed.data.label,
    courseIds: parsed.data.courseIds,
    actorEmail: actor.context.email,
  });
  return NextResponse.json({
    assignedCount,
    message: `${assignedCount} of ${parsed.data.courseIds.length} course(s) assigned to this topic.`,
  });
}

export async function DELETE(request: Request) {
  const parsed = removeSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ message: "Select at least one assignment to remove." }, { status: 400 });
  }

  const actor = await requireApiRole("super_admin", "admin", "content");
  if ("error" in actor) return actor.error;

  let removedCount = 0;
  for (const assignmentId of parsed.data.assignmentIds) {
    const removed = await removeCourseTopic({ courseTopicId: assignmentId, actorEmail: actor.context.email });
    if (removed) removedCount += 1;
  }
  return NextResponse.json({
    removedCount,
    message: `${removedCount} of ${parsed.data.assignmentIds.length} course(s) removed from this topic.`,
  });
}
