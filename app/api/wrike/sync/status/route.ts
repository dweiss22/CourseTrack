import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getWrikeSync } from "@/db";
import { demoUser, hasPermission } from "@/lib/permissions";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user && process.env.NODE_ENV === "production") {
    return NextResponse.json({ message: "Authentication is required." }, { status: 401 });
  }
  if (!hasPermission(demoUser.role, "administration:manage")) {
    return NextResponse.json({ message: "Only administrators can view Wrike sync status." }, { status: 403 });
  }

  const status = await getWrikeSync();
  return NextResponse.json(status);
}
