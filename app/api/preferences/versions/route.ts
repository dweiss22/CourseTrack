import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { apiError, validationError } from "@/lib/api-response";
import { getVersionsTablePreferences, saveVersionsTablePreferences } from "@/db/preference-repository";
import { versionsOptionalColumns } from "@/types/preferences";

const schema = z.object({ visibleColumns: z.array(z.enum(versionsOptionalColumns)).max(versionsOptionalColumns.length) }).strict();
export async function GET() { const auth = await requireApiUser(); if ("error" in auth) return auth.error; try { return NextResponse.json({ preferences: await getVersionsTablePreferences(auth.context.userId) }); } catch (error) { return apiError(error); } }
export async function PUT(request: Request) { const auth = await requireApiUser(); if ("error" in auth) return auth.error; const parsed = schema.safeParse(await request.json().catch(() => ({}))); if (!parsed.success) return validationError("Review the Versions table preferences.", parsed.error.issues); try { return NextResponse.json({ preferences: await saveVersionsTablePreferences(parsed.data, auth.context) }); } catch (error) { return apiError(error); } }
