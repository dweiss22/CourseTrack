import { NextResponse } from "next/server";
import { z } from "zod";
import { connectToWrike } from "@/db";
import { readWrikeEnvFallback } from "@/lib/wrike-env";
import { requireWrikePermission } from "@/lib/wrike-authz";

const connectSchema = z.object({
  token: z.string().trim().min(1).max(500).optional(),
  apiHost: z.string().trim().url().optional(),
});

export async function POST(request: Request) {
  const actor = await requireWrikePermission("administration:manage");
  if ("error" in actor) return actor.error;

  const parsed = connectSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ message: "Review the Wrike connection request." }, { status: 400 });
  }

  const fallback = readWrikeEnvFallback();
  const token = parsed.data.token || fallback.token;
  const apiHost = parsed.data.apiHost || fallback.apiHost;
  if (!token) {
    return NextResponse.json(
      { message: "Paste a Wrike permanent access token, or set WRIKE_PERMANENT_TOKEN." },
      { status: 400 },
    );
  }

  try {
    const connection = await connectToWrike({
      token,
      apiHost,
      actorEmail: actor.email,
    });
    return NextResponse.json({ connection, message: "Wrike connected." });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Could not connect to Wrike." },
      { status: 502 },
    );
  }
}
