import type { Metadata } from "next";
import {
  CourseLibrary,
  type CourseLibraryRecord,
} from "@/components/course-library/course-library";
import { getCourseLibraryPage, getFavoriteCourseIds } from "@/db";
import { requireUser } from "@/lib/auth";
import { getCourseLibraryPreferences } from "@/db/preference-repository";
import { withServerOperation } from "@/lib/server-observability";

export const metadata: Metadata = {
  title: "Course Library",
  description: "Search and filter the CourseTrack course portfolio.",
};

export const dynamic = "force-dynamic";

export default async function CourseLibraryPage() {
  const auth = await requireUser();
  const [page, favoriteCourseIds, preferences] = await withServerOperation(
    { route: "/courses", operation: "load course library" },
    () => Promise.all([
      getCourseLibraryPage({ page: 1, pageSize: 25, classification: "Lexipol Managed" }),
      getFavoriteCourseIds(auth.userId),
      getCourseLibraryPreferences(auth.userId),
    ]),
  );
  const records: CourseLibraryRecord[] = page.items.map((course) => ({
    id: course.id,
    title: course.title,
    shortTitle: course.shortTitle,
    courseCode: course.courseCode,
    lmsCourseId: course.lmsCourseId,
    description: course.description,
    verticals: course.verticals,
    managementClassification: course.managementClassification,
    lmsLinkStatus: course.lmsLinkStatus,
    retrievalStatus: course.retrievalStatus,
    lastRetrievedAt: course.lastRetrievedAt,
    conflictCount: course.conflictCount,
    healthStatus: course.healthStatus,
    lifecycleStatus: course.lifecycleStatus,
    primaryTopic: course.primaryTopic,
    tags: course.tags,
    owner: course.owner,
    durationMinutes: course.durationMinutes,
    dataSource: course.dataSource,
    updateType: course.updateType,
    topicAssignments: course.topicAssignments,
    hasLmsSnapshot: course.hasLmsSnapshot,
    hasContentMetadata: course.hasContentMetadata,
    importValidationErrorCount: course.importValidationErrorCount,
    backendLink: course.backendLink,
    frontendLink: course.frontendLink,
  }));
  return <CourseLibrary courses={records} initialTotal={page.total} initialFavoriteIds={favoriteCourseIds} initialPreferences={preferences} canEdit={["super_admin", "admin", "content"].includes(auth.role)} userId={auth.userId} />;
}
