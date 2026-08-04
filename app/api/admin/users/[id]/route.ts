import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/auth";
import { changeUserRole } from "@/db";

const updateSchema = z
  .object({
    role: z.enum(["admin", "accreditation", "content"]).optional(),
    status: z.enum(["active", "disabled"]).optional(),
  })
  .refine((value) => Boolean(value.role) || Boolean(value.status), {
    message: "Provide a role and/or a status to update.",
  });

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const actor = await requireApiAdmin();
  if ("error" in actor) return actor.error;

  const parsed = updateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ message: "Provide a role and/or a status to update." }, { status: 400 });
  }

  try {
    const user = await changeUserRole({
      targetId: id,
      actorId: actor.context.userId,
      actorRole: actor.context.role,
      newRole: parsed.data.role,
      newStatus: parsed.data.status,
    });
    return NextResponse.json({ user, message: "User updated." });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Could not update this user." },
      { status: 409 },
    );
  }
}
