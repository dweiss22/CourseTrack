import {
  Dashboard,
  type DashboardCourse,
} from "@/components/dashboard/dashboard";
import {
  getPortfolioSummaries,
  getRecentRetrievalRuns,
} from "@/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [courses, retrievalRuns] = await Promise.all([
    getPortfolioSummaries(),
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
    flagCount: course.flagCount,
    hasLmsSnapshot: course.hasLmsSnapshot,
    hasContentMetadata: course.hasContentMetadata,
    importValidationErrorCount: course.importValidationErrorCount,
  }));
  return <Dashboard courses={records} retrievalRuns={retrievalRuns} />;
}
