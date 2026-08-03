import { NextResponse } from "next/server";
import { z } from "zod";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { assignTopicToCourses, getCoursesForTopic, removeCourseTopic } from "@/db";
import { demoUser } from "@/lib/permissions";

const assignSchema = z.object({
  label: z.string().trim().min(1).max(120),
  courseIds: z.array(z.string().trim().min(1)).min(1),
});

const removeSchema = z.object({
  assignmentIds: z.array(z.string().trim().min(1)).min(1),
});

async function requireActorEmail(): Promise<string | NextResponse> {
  const user = await getChatGPTUser();
  if (!user && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { message: "Authentication is required to edit topics." },
      { status: 401 },
    );
  }
  return user?.email ?? demoUser.email;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const courses = await getCoursesForTopic(id);
  return NextResponse.json({ courses });
}

export async function POST(request: Request) {
  const parsed = assignSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ message: "Select a topic label and at least one course." }, { status: 400 });
  }

  const actorEmail = await requireActorEmail();
  if (actorEmail instanceof NextResponse) return actorEmail;

  const assignedCount = await assignTopicToCourses({
    topicLabel: parsed.data.label,
    courseIds: parsed.data.courseIds,
    actorEmail,
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

  const actorEmail = await requireActorEmail();
  if (actorEmail instanceof NextResponse) return actorEmail;

  let removedCount = 0;
  for (const assignmentId of parsed.data.assignmentIds) {
    const removed = await removeCourseTopic({ courseTopicId: assignmentId, actorEmail });
    if (removed) removedCount += 1;
  }
  return NextResponse.json({
    removedCount,
    message: `${removedCount} of ${parsed.data.assignmentIds.length} course(s) removed from this topic.`,
  });
}
