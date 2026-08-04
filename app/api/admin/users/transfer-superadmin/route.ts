import { NextResponse } from "next/server";
import { z } from "zod";
import { transferSuperAdminRole } from "@/db";
import { requireApiSuperAdmin } from "@/lib/auth";

const transferSchema = z.object({
  targetUserId: z.string().uuid(),
  confirmationEmail: z.string().trim().email(),
});

export async function POST(request: Request) {
  const actor = await requireApiSuperAdmin();
  if ("error" in actor) return actor.error;

  const parsed = transferSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Choose a successor and enter their email exactly." },
      { status: 400 },
    );
  }

  try {
    const result = await transferSuperAdminRole({
      actorId: actor.context.userId,
      targetId: parsed.data.targetUserId,
      confirmationEmail: parsed.data.confirmationEmail,
    });
    return NextResponse.json({
      ...result,
      message: `Superadmin authority transferred to ${result.newSuperAdmin.email}.`,
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Could not transfer superadmin authority." },
      { status: 409 },
    );
  }
}
