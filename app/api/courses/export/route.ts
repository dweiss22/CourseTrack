import { COURSE_EXPORT_COLUMNS, csvCell, getCourseExportBatch, getCourseLibraryPage } from "@/db";
import { apiError } from "@/lib/api-response";
import { requireApiUser } from "@/lib/auth";
import { createCourseExportCsvStream } from "@/lib/course-export-stream";
import { managementClassificationFilters, type ManagementClassificationFilter } from "@/types/course";

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if ("error" in auth) return auth.error;
  const params = new URL(request.url).searchParams;
  const classification = params.get("classification") ?? "Lexipol Managed";
  if (!managementClassificationFilters.includes(classification as ManagementClassificationFilter)) return new Response("Invalid management classification.", { status: 400 });
  const lmsLink = params.get("lmsLink") ?? "";
  if (!["", "linked", "not_linked"].includes(lmsLink)) return new Response("Invalid LMS link status.", { status: 400 });
  const query = {
    search: params.get("search") ?? "", vertical: params.get("vertical") ?? "", lifecycle: params.get("lifecycle") ?? "",
    health: params.get("health") ?? "", classification: classification as ManagementClassificationFilter,
    workQueue: params.get("workQueue") ?? "", lmsLink: lmsLink as "" | "linked" | "not_linked",
    sort: params.get("sort") ?? "title", descending: params.get("descending") === "true",
  };
  try {
    const stream = createCourseExportCsvStream(query, { columns: COURSE_EXPORT_COLUMNS, csvCell, getPage: getCourseLibraryPage, getBatch: getCourseExportBatch, pageSize: 200 });
    return new Response(stream, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=course-library.csv", "cache-control": "no-store" } });
  } catch (error) { return apiError(error); }
}
