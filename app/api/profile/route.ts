import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { updateMyDisplayName } from "@/db";

const updateSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
});

export async function PATCH(request: Request) {
  const actor = await requireApiUser();
  if ("error" in actor) return actor.error;

  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ message: "Enter a display name." }, { status: 400 });
  }

  try {
    await updateMyDisplayName({ userId: actor.context.userId, displayName: parsed.data.displayName });
    return NextResponse.json({ message: "Display name updated." });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Could not update your display name." },
      { status: 502 },
    );
  }
}
