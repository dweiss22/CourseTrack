import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { apiError, validationError } from "@/lib/api-response";
import { getCourseLibraryPreferences, saveCourseLibraryPreferences } from "@/db/preference-repository";
import { courseLibraryOptionalColumns } from "@/types/preferences";

const schema = z.object({ visibleColumns: z.array(z.enum(courseLibraryOptionalColumns)).max(courseLibraryOptionalColumns.length) }).strict();

export async function GET() {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;
  try {
    return NextResponse.json({ preferences: await getCourseLibraryPreferences(auth.context.userId) });
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;
  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return validationError("Review the Course Library preferences.", parsed.error.issues);
  try {
    return NextResponse.json({ preferences: await saveCourseLibraryPreferences(parsed.data, auth.context) });
  } catch (error) {
    return apiError(error);
  }
}
