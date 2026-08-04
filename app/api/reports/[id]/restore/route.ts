import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiError, validationError } from "@/lib/api-response";
import { getReportDefinition, setReportArchived } from "@/db/report-repository";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(); if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({})); if (typeof body.expectedUpdatedAt !== "string") return validationError("A concurrency token is required.");
  try { const id = (await context.params).id; const current = await getReportDefinition(id, true); if (!current) return NextResponse.json({ code: "not_found", message: "Report not found." }, { status: 404 }); if (current.ownerId !== auth.context.userId && !["admin", "super_admin"].includes(auth.context.role)) return NextResponse.json({ code: "forbidden", message: "Only the owner or an administrator can restore this report." }, { status: 403 }); return NextResponse.json({ report: await setReportArchived({ id, archived: false, expectedUpdatedAt: body.expectedUpdatedAt, actor: auth.context }), message: "Report restored." }); }
  catch (error) { return apiError(error); }
}
