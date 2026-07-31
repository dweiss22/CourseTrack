import { NextResponse } from "next/server";
import { z } from "zod";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { getWrikeProvider } from "@/providers/wrike";

const querySchema = z.object({
  search: z.string().trim().max(160).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(12),
});

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user && process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { message: "Authentication is required to view Wrike work references." },
      { status: 401 },
    );
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    search: url.searchParams.get("search") || undefined,
    page: url.searchParams.get("page") ?? undefined,
    pageSize: url.searchParams.get("pageSize") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Review the Wrike task query." },
      { status: 400 },
    );
  }

  const provider = getWrikeProvider();
  try {
    const [tasks, health] = await Promise.all([
      provider.searchTasks(parsed.data),
      provider.healthCheck(),
    ]);
    return NextResponse.json({
      ...tasks,
      provider: health.providerName,
      providerStatus: health.status,
      readOnly: true,
      liveConnectionConfigured: health.providerName === "Live Wrike",
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Wrike task references could not be retrieved.",
        readOnly: true,
      },
      { status: 503 },
    );
  }
}
