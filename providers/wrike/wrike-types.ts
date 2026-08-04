export interface WrikeTaskQuery {
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface WrikeTask {
  externalTaskId: string;
  title: string;
  projectId: string | null;
  projectTitle: string | null;
  status: string | null;
  assigneeNames: string[];
  dueDate: string | null;
  permalink: string | null;
  retrievedAt: string;
  providerName: "Live Wrike";
  rawPayload: Record<string, unknown>;
}

export interface PaginatedWrikeTaskResponse {
  items: WrikeTask[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}

export interface WrikeProviderHealth {
  providerName: "Live Wrike";
  status: "available" | "degraded" | "unavailable" | "not-configured";
  checkedAt: string;
  message: string;
}
