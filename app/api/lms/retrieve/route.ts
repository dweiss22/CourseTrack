import { NextResponse } from "next/server";
import { z } from "zod";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { recordRetrievalRun } from "@/db";
import { demoUser } from "@/lib/permissions";
import { sampleCourses } from "@/lib/sample-data";
import {
  MockLmsProvider,
  type MockLmsMode,
} from "@/providers/lms/mock-lms-provider";

const requestSchema = z.object({
  mode: z.enum(["healthy", "warnings", "outage"]).default("healthy"),
  courseId: z.string().optional(),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid mock retrieval request." },
      { status: 400 },
    );
  }

  const user = await getChatGPTUser();
  if (!user && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { message: "Authentication is required to run an LMS retrieval." },
      { status: 401 },
    );
  }
  const actorEmail = user?.email ?? demoUser.email;
  const provider = new MockLmsProvider(parsed.data.mode as MockLmsMode);
  const requested = parsed.data.courseId
    ? 1
    : sampleCourses.filter((course) => course.lmsSnapshot).length;

  try {
    const response = parsed.data.courseId
      ? await provider.getCourseById(parsed.data.courseId)
      : await provider.getCourses({ pageSize: 100 });
    const warnings =
      parsed.data.mode === "warnings"
        ? 2
        : "items" in (response ?? {}) &&
            Array.isArray((response as { items?: unknown[] }).items)
          ? (response as { items: { mappingWarnings: string[] }[] }).items.filter(
              (course) => course.mappingWarnings.length > 0,
            ).length
          : 0;
    const status = warnings > 0 ? "Retrieved with Warnings" : "Retrieved";
    const received =
      response && "items" in response ? response.items.length : response ? 1 : 0;
    const message =
      warnings > 0
        ? "Mock retrieval completed with mapping warnings. Prior snapshots were preserved."
        : "Mock LMS data retrieved successfully. This was a read-only operation.";

    const runId = await recordRetrievalRun({
      actorEmail,
      status,
      message,
      requested,
      received,
      failed: 0,
    });

    return NextResponse.json({
      runId,
      status,
      message,
      recordsRequested: requested,
      recordsReceived: received,
      readOnly: true,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Mock LMS retrieval failed. Prior snapshots were preserved.";
    const runId = await recordRetrievalRun({
      actorEmail,
      status: "Retrieval Failed",
      message,
      requested,
      received: 0,
      failed: requested,
    });
    return NextResponse.json(
      {
        runId,
        status: "Retrieval Failed",
        message,
        recordsReceived: 0,
        readOnly: true,
        preservedPriorSnapshot: true,
      },
      { status: 503 },
    );
  }
}
