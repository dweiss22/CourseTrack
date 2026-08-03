import { NextResponse } from "next/server";
import { checkWrikeConnectionHealth } from "@/db";
import { requireApiAdmin } from "@/lib/auth";

export async function GET() {
  const actor = await requireApiAdmin();
  if ("error" in actor) return actor.error;

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
