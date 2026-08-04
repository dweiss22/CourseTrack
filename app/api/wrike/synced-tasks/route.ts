import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiRole } from "@/lib/auth";
import { searchWrikeTasks } from "@/db";

const querySchema = z.object({
  query: z.string().trim().max(160).optional(),
  sourceFolderId: z.string().trim().max(80).optional(),
  customStatusId: z.string().trim().max(80).optional(),
  responsibleId: z.string().trim().max(80).optional(),
  updatedAfter: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(25).default(10),
});

// Searches the locally synchronized Wrike task index only. Never triggers a
// sync — see POST /api/wrike/sync for that.
export async function GET(request: Request) {
  const actor = await requireApiRole("super_admin", "admin", "content");
  if ("error" in actor) return NextResponse.json({ state: { status: "permission_denied", message: "You may view existing Wrike Task Links but cannot search the synchronized index." }, items: [], total: 0, hasMore: false }, { status: actor.error.status });

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    query: url.searchParams.get("query") || undefined,
    sourceFolderId: url.searchParams.get("sourceFolderId") || undefined,
    customStatusId: url.searchParams.get("customStatusId") || undefined,
    responsibleId: url.searchParams.get("responsibleId") || undefined,
    updatedAfter: url.searchParams.get("updatedAfter") || undefined,
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ message: "Review the Wrike task search request." }, { status: 400 });
  }

  const result = await searchWrikeTasks(parsed.data);
  return NextResponse.json(result);
}
