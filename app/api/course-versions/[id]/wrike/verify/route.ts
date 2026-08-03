import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyWrikeTaskLink } from "@/db";
import { requireApiRole } from "@/lib/auth";

const verifySchema = z.object({
  referenceId: z.string().trim().min(1),
});

export async function POST(request: Request) {
  const actor = await requireApiRole("super_admin", "admin", "content");
  if ("error" in actor) return actor.error;

  const parsed = verifySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ message: "A reference id is required to verify." }, { status: 400 });
  }

  try {
    const link = await verifyWrikeTaskLink(parsed.data.referenceId);
    return NextResponse.json({ link, message: "Wrike link verified." });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Could not verify this Wrike link." },
      { status: 409 },
    );
  }
}
