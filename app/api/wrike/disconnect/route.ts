import { NextResponse } from "next/server";
import { disconnectFromWrike } from "@/db";
import { requireApiAdmin } from "@/lib/auth";

export async function POST() {
  const actor = await requireApiAdmin();
  if ("error" in actor) return actor.error;

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
