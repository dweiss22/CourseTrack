import { NextResponse } from "next/server";
import { getAllTags } from "@/db";

export async function GET() {
  const tags = await getAllTags();
  return NextResponse.json({ tags });
}
