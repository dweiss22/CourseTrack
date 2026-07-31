import type { Metadata } from "next";
import { CourseLibrary } from "@/components/course-library/course-library";

export const metadata: Metadata = {
  title: "Course Library",
  description: "Search and filter the CourseTrack course portfolio.",
};

export default function CourseLibraryPage() {
  return <CourseLibrary />;
}
