import { Dashboard } from "@/components/dashboard/dashboard";
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
  return <Dashboard courses={courses} retrievalRuns={retrievalRuns} />;
}
