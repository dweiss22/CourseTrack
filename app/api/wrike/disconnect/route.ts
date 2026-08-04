import { NextResponse } from "next/server";
import { disconnectFromWrike } from "@/db";
import { requireApiAdmin } from "@/lib/auth";
import { apiError } from "@/lib/api-response";

export async function POST() {
  const actor = await requireApiAdmin();
  if ("error" in actor) return actor.error;

  try {
    await disconnectFromWrike(actor.context.userId, actor.context.email);
    return NextResponse.json({ message: "Wrike disconnected. No changes were made in Wrike." });
  } catch (error) {
    return apiError(error);
  }
}
