import { NextResponse } from "next/server";
import { z } from "zod";
import { searchWrikeTasksForCourseVersion } from "@/db";
import { requireApiRole } from "@/lib/auth";

const searchSchema = z.object({
  searchText: z.string().trim().max(160).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const actor = await requireApiRole("super_admin", "admin", "content");
  if ("error" in actor) return actor.error;

  const parsed = searchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ message: "Review the Wrike search request." }, { status: 400 });
  }

  const result = await searchWrikeTasksForCourseVersion(id, parsed.data.searchText);
  return NextResponse.json(result);
}
