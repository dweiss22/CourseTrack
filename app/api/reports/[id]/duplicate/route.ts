import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { apiError, validationError } from "@/lib/api-response";
import { duplicateReport, getReportDefinition } from "@/db/report-repository";

const schema = z.object({ name: z.string().trim().min(3).max(160) }).strict();
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(); if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return validationError("A report name is required.", parsed.error.issues);
  try { const source = await getReportDefinition((await context.params).id); if (!source) return NextResponse.json({ code: "not_found", message: "Report not found." }, { status: 404 }); return NextResponse.json({ report: await duplicateReport(source, parsed.data.name, auth.context), message: "Report duplicated." }, { status: 201 }); }
  catch (error) { return apiError(error); }
}
