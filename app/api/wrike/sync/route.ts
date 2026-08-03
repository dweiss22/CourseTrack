import { NextResponse } from "next/server";
import { triggerWrikeSync } from "@/db";
import { getWrikeSyncCronSecret } from "@/lib/wrike-env";
import { requireWrikePermission } from "@/lib/wrike-authz";

function isAuthorizedCronCaller(request: Request): boolean {
  const secret = getWrikeSyncCronSecret();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  const isCron = isAuthorizedCronCaller(request);
  let triggeredBy = "scheduled";

  if (!isCron) {
    const actor = await requireWrikePermission("administration:manage");
    if ("error" in actor) return actor.error;
    triggeredBy = `manual:${actor.email}`;
  }

  try {
    const run = await triggerWrikeSync(triggeredBy);
    return NextResponse.json({ run });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "The Wrike sync could not run." },
      { status: 502 },
    );
  }
}
