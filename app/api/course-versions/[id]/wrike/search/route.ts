import { NextResponse } from "next/server";
import { z } from "zod";
import { searchWrikeTasksForCourseVersion } from "@/db";
import { requireApiRole } from "@/lib/auth";
import { apiError, validationError } from "@/lib/api-response";

const searchSchema = z.object({
  searchText: z.string().trim().min(2).max(160).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const actor = await requireApiRole("super_admin", "admin", "content");
  if ("error" in actor) {
    if (actor.error.status === 401) return actor.error;
    return NextResponse.json({ code: "forbidden", state: { status: "permission_denied", message: "Accreditation users may view existing Wrike Task Links but cannot search or change them." }, items: [], total: 0, hasMore: false }, { status: 403 });
  }

  const parsed = searchSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return validationError("Enter at least two characters to search Wrike tasks.", parsed.error.issues);
  }

  try { return NextResponse.json(await searchWrikeTasksForCourseVersion(id, parsed.data.searchText)); }
  catch (error) {
    if (error instanceof Error && /not found/i.test(error.message)) return apiError(error);
    return NextResponse.json({ code: "service_unavailable", state: { status: "provider_failure", message: "The synchronized Wrike index could not be searched. Try again or review the connection in Administration." }, items: [], total: 0, hasMore: false }, { status: 503 });
  }
}
