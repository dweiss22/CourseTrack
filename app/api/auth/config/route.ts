import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const rawUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  if (!rawUrl || !anonKey) {
    return NextResponse.json(
      { code: "auth_not_configured", message: "CourseTrack authentication is not configured." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return NextResponse.json(
      { code: "auth_not_configured", message: "CourseTrack authentication is not configured correctly." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  if (url.protocol !== "https:") {
    return NextResponse.json(
      { code: "auth_not_configured", message: "CourseTrack authentication is not configured correctly." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  return NextResponse.json(
    { url: url.toString().replace(/\/$/, ""), anonKey },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
