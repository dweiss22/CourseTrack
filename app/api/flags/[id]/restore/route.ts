import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiError, validationError } from "@/lib/api-response";
import { restoreTaskCallout } from "@/db";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  if (typeof body.expectedUpdatedAt !== "string") return validationError("A concurrency token is required.");
  try {
    const { id } = await context.params;
    await restoreTaskCallout({ id, expectedUpdatedAt: body.expectedUpdatedAt, actor: auth.context });
    return NextResponse.json({ restored: true, message: "Task or callout restored." });
  } catch (error) {
    return apiError(error);
  }
}
