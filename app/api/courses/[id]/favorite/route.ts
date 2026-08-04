import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth";
import { apiError, validationError } from "@/lib/api-response";
import { setFavorite } from "@/db";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;
  const body = await request.json().catch(() => ({}));
  if (typeof body.favorite !== "boolean") return validationError("Favorite must be true or false.");
  try {
    const { id } = await context.params;
    const saved = await setFavorite({ courseId: id, favorite: body.favorite, actor: auth.context });
    if (!saved) return NextResponse.json({ code: "not_found", message: "Course not found." }, { status: 404 });
    return NextResponse.json({ favorite: body.favorite, message: body.favorite ? "Course added to favorites." : "Course removed from favorites." });
  } catch (error) {
    return apiError(error);
  }
}
