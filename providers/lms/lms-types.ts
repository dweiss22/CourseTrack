export interface LmsCourseQueryParams {
  search?: string;
  page?: number;
  pageSize?: number;
  changedSince?: string;
}

export interface LmsCourse {
  externalCourseId: string;
  title: string;
  description: string | null;
  durationMinutes: number | null;
  publicationStatus: string;
  categoryIds: string[];
  courseUrl: string | null;
  retrievedAt: string;
  providerName: string;
  rawPayload: Record<string, unknown>;
  normalized: NormalizedLmsPayload;
  mappingWarnings: string[];
}

export interface LmsCourseVersion {
  externalVersionId: string;
  versionLabel: string;
  publicationDate: string | null;
  retrievedAt: string;
}

export interface LmsAccreditation {
  externalAccreditationId: string;
  organizationName: string;
  status: string;
  expirationDate: string | null;
  jurisdiction: string | null;
  approvalNumber: string | null;
  topicNumber: string | null;
  effectiveDate: string | null;
  rawValues: LmsAccreditationSnapshot["rawValues"];
  mappingWarnings: string[];
  retrievedAt: string;
}

export interface LmsCourseStatistics {
  enrollmentCount: number | null;
  completionCount: number | null;
  retrievedAt: string;
}

export interface LmsCategory {
  externalCategoryId: string;
  name: string;
}

export interface LmsProviderHealth {
  providerName: string;
  status: "available" | "degraded" | "unavailable" | "not-configured";
  checkedAt: string;
  message: string;
}

export interface PaginatedLmsCourseResponse {
  items: LmsCourse[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
}
import type {
  LmsAccreditationSnapshot,
  NormalizedLmsPayload,
} from "@/types/course";
