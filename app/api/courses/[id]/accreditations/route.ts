import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { apiError, mutationMetadata, validationError } from "@/lib/api-response";
import { accreditationSchema } from "@/lib/workflow-validation";
import { saveAccreditation } from "@/db";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole("super_admin", "admin", "accreditation");
  if ("error" in auth) return auth.error;
  const parsed = accreditationSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return validationError("Review the accreditation fields.", parsed.error.issues);
  try {
    const { id } = await context.params;
    const record = await saveAccreditation({ ...parsed.data, courseAppId: id, actor: auth.context });
    return NextResponse.json({ record, ...mutationMetadata(auth.context.userId, record.updatedAt), message: "Accreditation created." }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
