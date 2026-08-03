import { NextResponse } from "next/server";
import { getAllTopics } from "@/db";

export async function GET() {
  const topics = await getAllTopics();
  return NextResponse.json({ topics });
}
