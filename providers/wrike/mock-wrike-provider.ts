import { sampleWrikeTasks } from "@/lib/sample-wrike-data";
import type { ReadOnlyWrikeProvider } from "./read-only-wrike-provider";
import type {
  PaginatedWrikeTaskResponse,
  WrikeProviderHealth,
  WrikeTask,
  WrikeTaskQuery,
} from "./wrike-types";

export class MockWrikeProvider implements ReadOnlyWrikeProvider {
  async searchTasks(query: WrikeTaskQuery = {}): Promise<PaginatedWrikeTaskResponse> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 12));
    const search = query.search?.trim().toLowerCase();
    const filtered = search
      ? sampleWrikeTasks.filter((task) =>
          [
            task.externalTaskId,
            task.title,
            task.projectTitle ?? "",
            task.status ?? "",
            ...task.assigneeNames,
          ]
            .join(" ")
            .toLowerCase()
            .includes(search),
        )
      : sampleWrikeTasks;
    const start = (page - 1) * pageSize;
    return {
      items: filtered.slice(start, start + pageSize),
      page,
      pageSize,
      total: filtered.length,
      hasMore: start + pageSize < filtered.length,
    };
  }

  async getTaskById(externalTaskId: string): Promise<WrikeTask | null> {
    return (
      sampleWrikeTasks.find((task) => task.externalTaskId === externalTaskId) ??
      null
    );
  }

  async healthCheck(): Promise<WrikeProviderHealth> {
    return {
      providerName: "Mock Wrike",
      status: "available",
      checkedAt: "2026-07-31T14:00:00.000Z",
      message:
        "Deterministic sample projects and tasks are available. No live Wrike connection is active.",
    };
  }
}
