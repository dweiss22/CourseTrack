import { NextResponse } from "next/server";
import {
  deploymentHealthSnapshot,
  deploymentHealthStatus,
} from "@/lib/deployment-readiness.mjs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const snapshot = await deploymentHealthSnapshot();
  return NextResponse.json(snapshot, {
    status: deploymentHealthStatus(snapshot),
    headers: { "Cache-Control": "private, no-store" },
  });
}
