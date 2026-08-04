import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";

export async function POST() {
  const actor = await requireApiRole("super_admin", "admin", "content");
  if ("error" in actor) return actor.error;

  return NextResponse.json(
    {
      code: "lms_not_connected",
      message: "LMS refresh is unavailable until the read-only LMS GET connector is configured.",
    },
    { status: 503 },
  );
}
