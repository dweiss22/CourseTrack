import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToWrike } from "@/db";
import { readWrikeEnvFallback } from "@/lib/wrike-env";
import { requireApiAdmin } from "@/lib/auth";
import { apiError, validationError } from "@/lib/api-response";

const connectSchema = z.object({
  token: z.string().trim().min(1).max(500).optional(),
  apiHost: z.string().trim().url().optional(),
});

export async function POST(request: Request) {
  const actor = await requireApiAdmin();
  if ("error" in actor) return actor.error;

  const parsed = connectSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return validationError("Review the Wrike connection request.", parsed.error.issues);
  }

  const fallback = readWrikeEnvFallback();
  const token = parsed.data.token || fallback.token;
  const apiHost = parsed.data.apiHost || fallback.apiHost;
  if (!token) {
    return validationError("Paste a Wrike permanent access token, or set WRIKE_PERMANENT_TOKEN.");
  }

  try {
    const connection = await connectToWrike({
      token,
      apiHost,
      actorId: actor.context.userId,
      actorEmail: actor.context.email,
    });
    return NextResponse.json({ connection, message: "Wrike connected." });
  } catch (error) {
    const response = apiError(error);
    return response.status === 500 ? NextResponse.json({ code: "service_unavailable", message: "Wrike could not be connected. Verify the token, permissions, and provider availability." }, { status: 503 }) : response;
  }
}
