import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiError } from "@/lib/api-response";
import { searchCourseIndex } from "@/db";

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;
  const query = new URL(request.url).searchParams.get("q") ?? "";
  try { return NextResponse.json({ items: await searchCourseIndex(query) }); }
  catch (error) { return apiError(error); }
}
