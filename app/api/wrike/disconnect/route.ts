import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { disconnectFromWrike } from "@/db";
import { demoUser, hasPermission } from "@/lib/permissions";

export async function POST() {
  const user = await getChatGPTUser();
  if (!user && process.env.NODE_ENV === "production") {
    return NextResponse.json({ message: "Authentication is required." }, { status: 401 });
  }
  if (!hasPermission(demoUser.role, "administration:manage")) {
    return NextResponse.json({ message: "Only administrators can disconnect Wrike." }, { status: 403 });
  }

  try {
    await disconnectFromWrike();
    return NextResponse.json({ message: "Wrike disconnected. No changes were made in Wrike." });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Could not disconnect Wrike." },
      { status: 502 },
    );
  }
}
