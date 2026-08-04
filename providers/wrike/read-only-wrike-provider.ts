import type {
  PaginatedWrikeTaskResponse,
  WrikeProviderHealth,
  WrikeTask,
  WrikeTaskQuery,
} from "./wrike-types";

/**
 * Wrike is a read-only Task Link source for CourseTrack versions.
 * Linking a task changes CourseTrack only; no Wrike mutation methods belong here.
 */
export interface ReadOnlyWrikeProvider {
  searchTasks(query?: WrikeTaskQuery): Promise<PaginatedWrikeTaskResponse>;
  getTaskById(externalTaskId: string): Promise<WrikeTask | null>;
  healthCheck(): Promise<WrikeProviderHealth>;
}
