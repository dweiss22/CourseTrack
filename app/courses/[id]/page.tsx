import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CourseDetail } from "@/components/course-detail/course-detail";
import { getAllTags, getAllTopics, getCourseRecord } from "@/db";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const course = await getCourseRecord(id);
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
  const [course, allTopics, allTags] = await Promise.all([
    getCourseRecord(id),
    getAllTopics(),
    getAllTags(),
  ]);
  if (!course) notFound();
  return (
    <CourseDetail
      course={course}
      topicSuggestions={allTopics.map((topic) => topic.label)}
      tagSuggestions={allTags.map((tag) => tag.label)}
    />
  );
}
