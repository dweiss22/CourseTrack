import { NextResponse } from "next/server";
import { getWrikeSync } from "@/db";
import { requireApiAdmin } from "@/lib/auth";

export async function GET() {
  const actor = await requireApiAdmin();
  if ("error" in actor) return actor.error;

  const status = await getWrikeSync();
  return NextResponse.json(status);
}
