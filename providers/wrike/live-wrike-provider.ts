import type { ReadOnlyWrikeProvider } from "./read-only-wrike-provider";
import type {
  PaginatedWrikeTaskResponse,
  WrikeProviderHealth,
  WrikeTask,
  WrikeTaskQuery,
} from "./wrike-types";

const notConfigured = (): never => {
  throw new Error(
    "The live Wrike provider is not configured. Documented API endpoints, authentication, task fields, project relationships, pagination, and rate limits are required before activation.",
  );
};

/** Configuration-only placeholder; no Wrike API behavior is invented. */
export class LiveWrikeProvider implements ReadOnlyWrikeProvider {
  async searchTasks(query: WrikeTaskQuery = {}): Promise<PaginatedWrikeTaskResponse> {
    void query;
    return notConfigured();
  }

  async getTaskById(externalTaskId: string): Promise<WrikeTask | null> {
    void externalTaskId;
    return notConfigured();
  }

  async healthCheck(): Promise<WrikeProviderHealth> {
    return {
      providerName: "Live Wrike",
      status: "not-configured",
      checkedAt: new Date().toISOString(),
      message:
        "Waiting for documented Wrike endpoints, authentication, task fields, project relationships, pagination, and rate limits.",
    };
  }
}
