import { NextResponse } from "next/server";
import { ensureDatabase, SAMPLE_COURSE_COUNT } from "@/db";

export async function GET() {
  try {
    const result = await ensureDatabase();
    return NextResponse.json({
      ...result,
      lmsProvider: "Mock LMS",
      mode: "sample",
    });
  } catch (error) {
    return NextResponse.json(
      {
        available: false,
        configured: true,
        seeded: false,
        courseCount: SAMPLE_COURSE_COUNT,
        databaseProvider: "Sample fallback",
        lmsProvider: "Mock LMS",
        mode: "sample-fallback",
        message:
          error instanceof Error
            ? error.message
            : "Database initialization was unavailable.",
      },
      { status: 200 },
    );
  }
}
