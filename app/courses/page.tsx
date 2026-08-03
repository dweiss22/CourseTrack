import type { Metadata } from "next";
import {
  CourseLibrary,
  type CourseLibraryRecord,
} from "@/components/course-library/course-library";
import { getPortfolioSummaries } from "@/db";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Course Library",
  description: "Search and filter the CourseTrack course portfolio.",
};

export const dynamic = "force-dynamic";

export default async function CourseLibraryPage() {
  await requireUser();
  const courses = await getPortfolioSummaries();
  const records: CourseLibraryRecord[] = courses.map((course) => ({
    id: course.id,
    title: course.title,
    shortTitle: course.shortTitle,
    courseCode: course.courseCode,
    lmsCourseId: course.lmsCourseId,
    description: course.description,
    primaryVertical: course.primaryVertical,
    managementClassification: course.managementClassification,
    reconciliationStatus: course.reconciliationStatus,
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
    topicAssignments: course.topicAssignments,
    hasLmsSnapshot: course.hasLmsSnapshot,
    hasContentMetadata: course.hasContentMetadata,
    importValidationErrorCount: course.importValidationErrorCount,
  }));
  return <CourseLibrary courses={records} />;
}
