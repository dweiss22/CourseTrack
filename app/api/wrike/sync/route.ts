import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { triggerWrikeSync } from "@/db";
import { getWrikeSyncCronSecret } from "@/lib/wrike-env";
import { demoUser, hasPermission } from "@/lib/permissions";

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
    const user = await getChatGPTUser();
    if (!user && process.env.NODE_ENV === "production") {
      return NextResponse.json({ message: "Authentication is required." }, { status: 401 });
    }
    if (!hasPermission(demoUser.role, "administration:manage")) {
      return NextResponse.json({ message: "Only administrators can run a Wrike sync." }, { status: 403 });
    }
    triggeredBy = `manual:${user?.email ?? demoUser.email}`;
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
