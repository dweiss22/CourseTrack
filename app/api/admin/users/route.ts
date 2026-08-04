import { NextResponse } from "next/server";
import { z } from "zod";
import { APPLICATION_ROLES, requireApiAdmin } from "@/lib/auth";
import { createUser, listUsers } from "@/db";

const listQuerySchema = z.object({
  role: z.enum(APPLICATION_ROLES).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

const createSchema = z.object({
  email: z.string().trim().email(),
  displayName: z.string().trim().min(1).max(120),
  role: z.enum(["admin", "accreditation", "content"]),
});

export async function GET(request: Request) {
  const actor = await requireApiAdmin();
  if ("error" in actor) return actor.error;

  const url = new URL(request.url);
  const parsed = listQuerySchema.safeParse({
    role: url.searchParams.get("role") || undefined,
    status: url.searchParams.get("status") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ message: "Review the user list filters." }, { status: 400 });
  }

  const users = await listUsers(parsed.data);
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const actor = await requireApiAdmin();
  if ("error" in actor) return actor.error;

  const parsed = createSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Enter a valid email, display name, and role." },
      { status: 400 },
    );
  }

  try {
    const redirectTo = `${new URL(request.url).origin}/auth/callback?next=/update-password`;
    const user = await createUser({
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      role: parsed.data.role,
      actorId: actor.context.userId,
      actorRole: actor.context.role,
      redirectTo,
    });
    return NextResponse.json({ user, message: "User created. A setup email was sent." });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Could not create this user." },
      { status: 409 },
    );
  }
}
