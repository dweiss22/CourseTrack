import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth";
import { getCourseRecord, persistFieldResolution } from "@/db";
import { applyFieldResolution } from "@/lib/source-normalization";
import { apiError, mutationMetadata, validationError } from "@/lib/api-response";

const resolutionSchema = z.object({
  fieldKey: z.string().trim().min(1).max(80),
  action: z.enum([
    "Use LMS value",
    "Keep Content Team value",
    "Clear resolution and review again",
  ]),
  reason: z.string().trim().max(500).nullable().optional(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
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

  const parsed = resolutionSchema.safeParse(
    await request.json().catch(() => ({})),
  );
  if (!parsed.success) {
    return validationError("Review the field-resolution request.", parsed.error.issues);
  }
  const comparison = course.fieldComparisons.find(
    (item) => item.fieldKey === parsed.data.fieldKey,
  );
  if (!comparison) {
    return NextResponse.json(
      { code: "not_found", message: "The requested source-comparison field was not found." },
      { status: 404 },
    );
  }

  const actorEmail = actor.context.email;
  const resolvedAt = new Date().toISOString();
  const resolution = applyFieldResolution(
    comparison,
    parsed.data.action,
    actorEmail,
    resolvedAt,
    parsed.data.reason ?? null,
  );
  try {
    await persistFieldResolution({
      courseId: id,
      actorId: actor.context.userId,
      actorEmail,
      fieldKey: comparison.fieldKey,
      selectedSource: resolution.comparison.selectedSource,
      resolutionReason: resolution.comparison.resolutionReason,
      expectedUpdatedAt: parsed.data.expectedUpdatedAt,
    });
    const updatedCourse = await getCourseRecord(id);
    const updatedComparison = updatedCourse?.fieldComparisons.find((item) => item.fieldKey === comparison.fieldKey);
    if (!updatedCourse || !updatedComparison) throw new Error("The updated course comparison could not be reloaded.");
    return NextResponse.json({
      saved: true,
      comparison: updatedComparison,
      course: updatedCourse,
      resolutionAudit: resolution.audit,
      readOnlyLms: true,
      ...mutationMetadata(actor.context.userId, updatedComparison.updatedAt),
      message: parsed.data.action === "Use LMS value"
        ? "The LMS value was copied into the CourseTrack projection. The LMS snapshot was not changed."
        : "The source comparison resolution was saved and audited.",
    });
  } catch (error) {
    return apiError(error);
  }
}
