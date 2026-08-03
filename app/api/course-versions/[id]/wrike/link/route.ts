import { NextResponse } from "next/server";
import { z } from "zod";
import { linkWrikeTaskToCourseVersion, unlinkWrikeTaskFromCourseVersion } from "@/db";
import { requireApiRole } from "@/lib/auth";

const linkSchema = z
  .object({
    permalink: z.string().trim().url().max(500).optional(),
    candidateTaskId: z.string().trim().min(1).max(80).optional(),
  })
  .refine((value) => Boolean(value.permalink) !== Boolean(value.candidateTaskId), {
    message: "Provide either a permalink or a candidateTaskId, not both.",
  });

const unlinkSchema = z.object({
  referenceId: z.string().trim().min(1),
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
    return NextResponse.json(
      { message: "Provide either a Wrike permalink or a selected candidate task id." },
      { status: 400 },
    );
  }

  try {
    const link = await linkWrikeTaskToCourseVersion({
      courseVersionId: id,
      permalink: parsed.data.permalink,
      candidateTaskId: parsed.data.candidateTaskId,
      actorEmail: actor.context.email,
    });
    return NextResponse.json({ link, message: "Wrike task linked. Wrike was not changed." });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Could not link this Wrike task." },
      { status: 409 },
    );
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
    return NextResponse.json({ message: "A reference id is required to unlink." }, { status: 400 });
  }

  const unlinked = await unlinkWrikeTaskFromCourseVersion(parsed.data.referenceId);
  return NextResponse.json({
    unlinked,
    message: unlinked
      ? "Wrike task unlinked. This only changed CourseTrack; Wrike was not modified."
      : "No active Wrike link was found for that reference.",
  });
}
