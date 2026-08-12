import { NextResponse } from "next/server";
import { triggerWrikeSync } from "@/db";
import { getWrikeSyncCronSecret } from "@/lib/wrike-env";
import { requireApiAdmin } from "@/lib/auth";
import { apiError } from "@/lib/api-response";

function isAuthorizedCronCaller(request: Request): boolean {
  const secret = getWrikeSyncCronSecret();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  const isCron = isAuthorizedCronCaller(request);
  let triggeredBy = "scheduled";
  let actorId: string | null = null;

  if (!isCron) {
    const actor = await requireApiAdmin();
    if ("error" in actor) return actor.error;
    triggeredBy = `manual:${actor.context.email}`;
    actorId = actor.context.userId;
  }

  try {
    const run = await triggerWrikeSync(triggeredBy, actorId);
    return NextResponse.json({ run, message: "Wrike synchronization completed." });
  } catch (error) {
    // Overlapping runs are an expected outcome, not a failure: scheduled
    // delivery is best effort and an admin can trigger one at any time.
    if (error instanceof Error && /already running/i.test(error.message)) {
      return NextResponse.json({ code: "conflict", message: "A Wrike synchronization is already running." }, { status: 409 });
    }
    const response = apiError(error);
    return response.status === 500 ? NextResponse.json({ code: "service_unavailable", message: "The Wrike synchronization could not run." }, { status: 503 }) : response;
  }
}
