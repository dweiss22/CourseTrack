import { NextResponse } from "next/server";
import { checkWrikeConnectionHealth } from "@/db";
import { requireWrikePermission } from "@/lib/wrike-authz";

export async function GET() {
  const actor = await requireWrikePermission("administration:manage");
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
