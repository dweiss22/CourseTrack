import { NextResponse } from "next/server";
import { ensureDatabase } from "@/db";
import { requireApiUser } from "@/lib/auth";

export async function GET() {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;
  try {
    const result = await ensureDatabase();
    return NextResponse.json({
      ...result,
      lmsProvider: "Not connected",
      mode: "database",
    });
  } catch (error) {
    return NextResponse.json(
      {
        code: "service_unavailable",
        available: false,
        configured: true,
        dataPresent: false,
        courseCount: 0,
        databaseProvider: "Unavailable",
        lmsProvider: "Not connected",
        mode: "unavailable",
        message:
          error instanceof Error
            ? error.message
            : "Database migrations or import configuration are unavailable.",
      },
      { status: 503 },
    );
  }
}
