import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CourseDetail } from "@/components/course-detail/course-detail";
import { getActiveAssignees, getAllTags, getAllTopics, getCourseRecord, getFavorite, getLmsAuthorityMode } from "@/db";
import { requireUser } from "@/lib/auth";

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
  const authContext = await requireUser();
  const { id } = await params;
  const [course, allTopics, allTags, initialFavorite, assignees, lmsAuthorityMode] = await Promise.all([
    getCourseRecord(id),
    getAllTopics(),
    getAllTags(),
    getFavorite(id, authContext.userId),
    getActiveAssignees(),
    getLmsAuthorityMode(),
  ]);
  if (!course) notFound();
  return (
    <CourseDetail
      course={course}
      topicSuggestions={allTopics.map((topic) => topic.label)}
      tagSuggestions={allTags.map((tag) => tag.label)}
      initialFavorite={initialFavorite}
      canEditCourse={["super_admin", "admin", "content"].includes(authContext.role)}
      canManageVersions={["super_admin", "admin", "content"].includes(authContext.role)}
      canManageAccreditations={["super_admin", "admin", "accreditation"].includes(authContext.role)}
      isAdministrator={["super_admin", "admin"].includes(authContext.role)}
      lmsAuthorityMode={lmsAuthorityMode}
      assignees={assignees}
    />
  );
}
