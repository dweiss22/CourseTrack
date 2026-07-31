import {
  Dashboard,
  type DashboardCourse,
} from "@/components/dashboard/dashboard";
import {
  getPortfolioCourses,
  getRecentRetrievalRuns,
} from "@/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [courses, retrievalRuns] = await Promise.all([
    getPortfolioCourses(),
    getRecentRetrievalRuns(),
  ]);
  const records: DashboardCourse[] = courses.map((course) => ({
    id: course.id,
    title: course.title,
    primaryVertical: course.primaryVertical,
    managementClassification: course.managementClassification,
    healthStatus: course.healthStatus,
    nextReviewDate: course.nextReviewDate,
    owner: course.owner,
    metadataCompletenessScore: course.metadataCompletenessScore,
    reconciliationStatus: course.reconciliationStatus,
    retrievalStatus: course.retrievalStatus,
    conflictCount: course.conflictCount,
    flagCount: course.flags.length,
    hasLmsSnapshot: Boolean(course.lmsSnapshot),
    hasContentMetadata: Boolean(course.contentMetadata),
    importValidationErrorCount: course.importValidationErrors.length,
  }));
  return <Dashboard courses={records} retrievalRuns={retrievalRuns} />;
}
