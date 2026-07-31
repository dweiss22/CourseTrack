import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CourseDetail } from "@/components/course-detail/course-detail";
import { getCourse, sampleCourses } from "@/lib/sample-data";

export function generateStaticParams() {
  return sampleCourses.map((course) => ({ id: course.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const course = getCourse(id);
  return {
    title: course?.title ?? "Course not found",
    description: course?.description,
  };
}

export default async function CourseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const course = getCourse(id);
  if (!course) notFound();
  return <CourseDetail course={course} />;
}
