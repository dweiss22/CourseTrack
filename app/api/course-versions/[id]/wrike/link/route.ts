import { NextResponse } from "next/server";
import { z } from "zod";
import { linkWrikeTaskToCourseVersion, unlinkWrikeTaskFromCourseVersion } from "@/db";
import { requireApiRole } from "@/lib/auth";
import { apiError, validationError } from "@/lib/api-response";

const linkSchema = z
  .object({
    permalink: z.string().trim().url().max(500).optional(),
    candidateTaskId: z.string().trim().min(1).max(80).optional(),
    expectedUpdatedAt: z.string().datetime().optional(),
  })
  .refine((value) => Boolean(value.permalink) !== Boolean(value.candidateTaskId), {
    message: "Provide either a permalink or a candidateTaskId, not both.",
  });

const unlinkSchema = z.object({
  referenceId: z.string().trim().min(1),
  expectedUpdatedAt: z.string().datetime(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const actor = await requireApiRole("super_admin", "admin", "content");
  if ("error" in actor) return actor.error;

  const parsed = linkSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return validationError("Provide either a Wrike permalink or a selected candidate task id.", parsed.error.issues);
  }

  try {
    const link = await linkWrikeTaskToCourseVersion({
      courseVersionId: id,
      permalink: parsed.data.permalink,
      candidateTaskId: parsed.data.candidateTaskId,
      expectedUpdatedAt: parsed.data.expectedUpdatedAt,
      actorId: actor.context.userId,
      actorEmail: actor.context.email,
    });
    return NextResponse.json({ link, message: "Wrike task linked. Wrike was not changed." });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  await context.params;
  const actor = await requireApiRole("super_admin", "admin", "content");
  if ("error" in actor) return actor.error;

  const parsed = unlinkSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return validationError("A reference id and concurrency token are required to unlink.", parsed.error.issues);
  }

  try {
    const unlinked = await unlinkWrikeTaskFromCourseVersion({ ...parsed.data, actorId: actor.context.userId, actorEmail: actor.context.email });
    return NextResponse.json({
      unlinked,
      message: unlinked
        ? "Wrike task unlinked. This only changed CourseTrack; Wrike was not modified."
        : "No active Wrike link was found for that reference.",
    });
  } catch (error) {
    return apiError(error);
  }
}
