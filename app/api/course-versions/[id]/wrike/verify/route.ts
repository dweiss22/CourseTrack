import { NextResponse } from "next/server";
import { z } from "zod";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { verifyWrikeTaskLink } from "@/db";
import { demoUser, hasPermission } from "@/lib/permissions";

const verifySchema = z.object({
  referenceId: z.string().trim().min(1),
});

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user && process.env.NODE_ENV === "production") {
    return NextResponse.json({ message: "Authentication is required." }, { status: 401 });
  }
  if (!hasPermission(demoUser.role, "versions:manage")) {
    return NextResponse.json({ message: "Only version managers can verify Wrike links." }, { status: 403 });
  }

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
