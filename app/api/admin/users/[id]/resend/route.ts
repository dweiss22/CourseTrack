import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiAdmin } from "@/lib/auth";
import { resendRecoveryEmail } from "@/db";

const resendSchema = z.object({
  email: z.string().trim().email(),
});

export async function POST(request: Request) {
  const actor = await requireApiAdmin();
  if ("error" in actor) return actor.error;

  const parsed = resendSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ message: "A valid email is required." }, { status: 400 });
  }

  try {
    const redirectTo = `${new URL(request.url).origin}/auth/callback?next=/update-password`;
    await resendRecoveryEmail({ email: parsed.data.email, redirectTo });
    return NextResponse.json({ message: "Setup/reset email sent." });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Could not resend this email." },
      { status: 502 },
    );
  }
}
