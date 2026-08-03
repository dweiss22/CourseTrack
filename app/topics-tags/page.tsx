import type { Metadata } from "next";
import { TopicsTagsWorkspace } from "@/components/portfolio-workspaces";
import { getAllTags, getAllTopics, getCourseIndex } from "@/db";

export const metadata: Metadata = { title: "Topics & Tags" };

export const dynamic = "force-dynamic";

export default async function TopicsTagsPage() {
  const [topics, tags, courseIndex] = await Promise.all([
    getAllTopics(),
    getAllTags(),
    getCourseIndex(),
  ]);
  return <TopicsTagsWorkspace topics={topics} tags={tags} courseIndex={courseIndex} />;
}
