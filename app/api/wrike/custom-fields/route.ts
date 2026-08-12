import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { getWrikeCustomFieldDefinitions } from "@/db";
import { logServerFailure } from "@/lib/server-observability";

/**
 * Read-only view of the Wrike account custom-field catalogue, normalized to
 * {id, title, type}. Gated by the same roles as Wrike task search.
 *
 * Deliberately narrow: no access token, no raw provider payload, and no other
 * account data ever leaves this route, and failures return a fixed message
 * rather than echoing anything Wrike said.
 */
export async function GET() {
  const actor = await requireApiRole("super_admin", "admin", "content");
  if ("error" in actor) return actor.error;

  try {
    const definitions = await getWrikeCustomFieldDefinitions();
    return NextResponse.json({ definitions });
  } catch (error) {
    const incidentId = logServerFailure(
      { route: "/api/wrike/custom-fields", operation: "listWrikeCustomFieldDefinitions" },
      error,
    );
    return NextResponse.json(
      {
        code: "provider_unavailable",
        message: "Wrike custom fields are unavailable right now.",
        incidentId,
      },
      { status: 503 },
    );
  }
}
