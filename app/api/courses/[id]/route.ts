import { NextResponse } from "next/server";
import { z } from "zod";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  getCourseRecord,
  updateInternalCourseMetadata,
} from "@/db";
import { demoUser } from "@/lib/permissions";

const updateSchema = z.object({
  internalSummary: z.string().trim().min(10).max(1_200),
  owner: z.string().trim().min(2).max(120).nullable(),
  nextReviewDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const course = await getCourseRecord(id);
  if (!course) {
    return NextResponse.json({ message: "Course not found." }, { status: 404 });
  }
  return NextResponse.json({ course });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const course = await getCourseRecord(id);
  if (!course) {
    return NextResponse.json({ message: "Course not found." }, { status: 404 });
  }

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Review the internal metadata fields.", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const user = await getChatGPTUser();
  if (!user && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { message: "Authentication is required to edit CourseTrack metadata." },
      { status: 401 },
    );
  }
  const saved = await updateInternalCourseMetadata({
    courseId: id,
    actorEmail: user?.email ?? demoUser.email,
    ...parsed.data,
  });

  return NextResponse.json({
    saved,
    course: { ...course, ...parsed.data },
    message: saved
      ? "Internal CourseTrack metadata saved. LMS data was not changed."
      : "The database binding is unavailable; no LMS data was changed.",
  });
}
