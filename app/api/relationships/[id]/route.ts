import { NextResponse } from "next/server";
import { removeCourseRelationship } from "@/db";
import { apiError } from "@/lib/api-response";
import { requireApiRole } from "@/lib/auth";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole("super_admin", "admin", "content");
  if ("error" in auth) return auth.error;
  try { const { id } = await context.params; await removeCourseRelationship({ id, actor: auth.context }); return NextResponse.json({ removed: true, message: "Relationship removed." }); }
  catch (error) { return apiError(error); }
}
