import type { Metadata } from "next";
import { TopicsTagsWorkspace } from "@/components/portfolio-workspaces";
import { getAllTags, getAllTopics } from "@/db";
import { requirePageRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Topics & Tags" };

export const dynamic = "force-dynamic";

export default async function TopicsTagsPage() {
  await requirePageRole("super_admin", "admin", "content");
  const [topics, tags] = await Promise.all([
    getAllTopics(),
    getAllTags(),
  ]);
  return <TopicsTagsWorkspace topics={topics} tags={tags} />;
}
