import { NextResponse } from "next/server";
import { getWrikeSync } from "@/db";
import { requireWrikePermission } from "@/lib/wrike-authz";

export async function GET() {
  const actor = await requireWrikePermission("administration:manage");
  if ("error" in actor) return actor.error;

  const status = await getWrikeSync();
  return NextResponse.json(status);
}
