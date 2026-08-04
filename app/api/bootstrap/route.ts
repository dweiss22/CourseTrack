import { NextResponse } from "next/server";
import { ensureDatabase } from "@/db";

export async function GET() {
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
        available: false,
        configured: true,
        seeded: false,
        courseCount: 0,
        databaseProvider: "Unavailable",
        lmsProvider: "Not connected",
        mode: "unavailable",
        message:
          error instanceof Error
            ? error.message
            : "Database initialization was unavailable.",
      },
      { status: 503 },
    );
  }
}
