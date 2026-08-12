import { NextResponse } from "next/server";
import { createCourseProjection, getCourseLibraryPage } from "@/db";
import { apiError, validationError } from "@/lib/api-response";
import { requireApiRole, requireApiUser } from "@/lib/auth";
import { courseCreateSchema } from "@/lib/workflow-validation";
import { managementClassificationFilters, type ManagementClassificationFilter } from "@/types/course";

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;
  const params = new URL(request.url).searchParams;
  const requestedClassification = params.get("classification") ?? "Lexipol Managed";
  if (!managementClassificationFilters.includes(requestedClassification as ManagementClassificationFilter)) {
    return validationError("Management classification must be All courses, Lexipol Managed, or Unmanaged.");
  }
  try {
    return NextResponse.json(await getCourseLibraryPage({
      page: Number(params.get("page") ?? 1), pageSize: Number(params.get("pageSize") ?? 25),
      search: params.get("search") ?? "", vertical: params.get("vertical") ?? "", lifecycle: params.get("lifecycle") ?? "",
      health: params.get("health") ?? "", classification: requestedClassification as ManagementClassificationFilter, workQueue: params.get("workQueue") ?? "",
      lmsLink: (params.get("lmsLink") ?? "") as "" | "linked" | "not_linked",
      sort: params.get("sort") ?? "title", descending: params.get("descending") === "true",
    }));
  } catch (error) { return apiError(error); }
}

export async function POST(request: Request) {
  const auth = await requireApiRole("super_admin", "admin", "content");
  if ("error" in auth) return auth.error;
  const parsed = courseCreateSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return validationError("Review the course fields.", parsed.error.issues);
  try {
    const course = await createCourseProjection({ ...parsed.data, actor: auth.context });
    return NextResponse.json({ course, message: "Course created." }, { status: 201 });
  } catch (error) { return apiError(error); }
}
