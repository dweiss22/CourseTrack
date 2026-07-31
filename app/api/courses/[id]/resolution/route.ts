import { NextResponse } from "next/server";
import { z } from "zod";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getCourseRecord, persistFieldResolution } from "@/db";
import { demoUser } from "@/lib/permissions";
import { applyFieldResolution } from "@/lib/source-normalization";

const resolutionSchema = z.object({
  fieldKey: z.string().trim().min(1).max(80),
  action: z.enum([
    "Use LMS value",
    "Keep Content Team value",
    "Clear resolution and review again",
  ]),
  reason: z.string().trim().max(500).nullable().optional(),
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

  const parsed = resolutionSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Review the field-resolution request." },
      { status: 400 },
    );
  }
  const comparison = course.fieldComparisons.find(
    (item) => item.fieldKey === parsed.data.fieldKey,
  );
  if (!comparison) {
    return NextResponse.json(
      { message: "The requested source-comparison field was not found." },
      { status: 404 },
    );
  }

  const user = await getChatGPTUser();
  if (!user && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { message: "Authentication is required to resolve source fields." },
      { status: 401 },
    );
  }
  const actorEmail = user?.email ?? demoUser.email;
  const resolvedAt = new Date().toISOString();
  const resolution = applyFieldResolution(
    comparison,
    parsed.data.action,
    actorEmail,
    resolvedAt,
    parsed.data.reason ?? null,
  );
  const saved = await persistFieldResolution({
    courseId: id,
    actorEmail,
    fieldKey: comparison.fieldKey,
    selectedSource: resolution.comparison.selectedSource,
    resolvedValue: resolution.comparison.resolvedValue,
    resolutionReason: resolution.comparison.resolutionReason,
    resolvedAt,
  });

  return NextResponse.json({
    saved,
    comparison: resolution.comparison,
    audit: resolution.audit,
    readOnlyLms: true,
    message: saved
      ? "CourseTrack resolution saved and audited. LMS and Content Metadata source values were not changed."
      : "Sample resolution applied for this session. LMS and Content Metadata source values were not changed.",
  });
}
