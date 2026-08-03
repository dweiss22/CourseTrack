import { NextResponse } from "next/server";
import { z } from "zod";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { searchWrikeTasksForCourseVersion } from "@/db";
import { demoUser, hasPermission } from "@/lib/permissions";

const searchSchema = z.object({
  searchText: z.string().trim().max(160).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const user = await getChatGPTUser();
  if (!user && process.env.NODE_ENV === "production") {
    return NextResponse.json({ message: "Authentication is required." }, { status: 401 });
  }
  if (!hasPermission(demoUser.role, "versions:manage")) {
    return NextResponse.json({ message: "Only version managers can search Wrike tasks." }, { status: 403 });
  }

  const parsed = searchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ message: "Review the Wrike search request." }, { status: 400 });
  }

  const result = await searchWrikeTasksForCourseVersion(id, parsed.data.searchText);
  return NextResponse.json(result);
}
