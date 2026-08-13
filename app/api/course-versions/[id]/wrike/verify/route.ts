import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyWrikeTaskLink } from "@/db";
import { requireApiRole } from "@/lib/auth";
import { apiError, validationError } from "@/lib/api-response";

const verifySchema = z.object({
  referenceId: z.string().trim().min(1),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
});

export async function POST(request: Request) {
  const actor = await requireApiRole("super_admin", "admin", "content");
  if ("error" in actor) return actor.error;

  const parsed = verifySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return validationError("A reference id and concurrency token are required to verify.", parsed.error.issues);
  }

  try {
    const link = await verifyWrikeTaskLink({ ...parsed.data, actorId: actor.context.userId, actorEmail: actor.context.email });
    return NextResponse.json({ link, message: "Wrike link verified." });
  } catch (error) {
    return apiError(error);
  }
}
