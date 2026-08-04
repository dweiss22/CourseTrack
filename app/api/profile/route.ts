import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { updateMyProfile } from "@/db";

const updateSchema = z.object({
  firstName: z.string().trim().max(80),
  lastName: z.string().trim().max(80),
  displayName: z.string().trim().min(1).max(120),
  jobTitle: z.string().trim().max(120),
  department: z.string().trim().max(120),
  timezone: z.string().trim().min(1).max(80),
});

export async function PATCH(request: Request) {
  const actor = await requireApiUser();
  if ("error" in actor) return actor.error;

  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ message: "Check the profile fields and enter a display name." }, { status: 400 });
  }

  try {
    await updateMyProfile({ userId: actor.context.userId, ...parsed.data });
    return NextResponse.json({ message: "Profile updated.", profile: parsed.data });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Could not update your profile." },
      { status: 502 },
    );
  }
}
