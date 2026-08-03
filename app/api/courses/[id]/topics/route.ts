import { NextResponse } from "next/server";
import { z } from "zod";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { assignCourseTopic, getCourseRecord, removeCourseTopic } from "@/db";
import { demoUser } from "@/lib/permissions";

const assignSchema = z.object({
  label: z.string().trim().min(1).max(120),
});

const removeSchema = z.object({
  courseTopicId: z.string().trim().min(1),
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

  const actorEmail = await requireActorEmail();
  if (actorEmail instanceof NextResponse) return actorEmail;

  const saved = await assignCourseTopic({ courseId: id, topicLabel: parsed.data.label, actorEmail });
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

  const actorEmail = await requireActorEmail();
  if (actorEmail instanceof NextResponse) return actorEmail;

  const removed = await removeCourseTopic({ courseTopicId: parsed.data.courseTopicId, actorEmail });
  return NextResponse.json({
    removed,
    message: removed
      ? "Topic removed."
      : "The topic assignment could not be removed (it may be LMS or import sourced).",
  });
}
