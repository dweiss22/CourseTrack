import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { checkWrikeConnectionHealth } from "@/db";
import { demoUser, hasPermission } from "@/lib/permissions";

export async function GET() {
  const user = await getChatGPTUser();
  if (!user && process.env.NODE_ENV === "production") {
    return NextResponse.json({ message: "Authentication is required." }, { status: 401 });
  }
  if (!hasPermission(demoUser.role, "administration:manage")) {
    return NextResponse.json({ message: "Only administrators can check Wrike health." }, { status: 403 });
  }

  try {
    const connection = await checkWrikeConnectionHealth();
    return NextResponse.json({ connection });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "The Wrike health check failed." },
      { status: 502 },
    );
  }
}
