import type { Metadata } from "next";
import { CourseLibrary } from "@/components/course-library/course-library";
import { getPortfolioCourses } from "@/db";

export const metadata: Metadata = {
  title: "Course Library",
  description: "Search and filter the CourseTrack course portfolio.",
};

export const dynamic = "force-dynamic";

export default async function CourseLibraryPage() {
  const courses = await getPortfolioCourses();
  return <CourseLibrary courses={courses} />;
}
