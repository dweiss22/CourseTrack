import type {
  LmsAccreditation,
  LmsCategory,
  LmsCourse,
  LmsCourseQueryParams,
  LmsCourseStatistics,
  LmsProviderHealth,
  PaginatedLmsCourseResponse,
} from "./lms-types";

/**
 * LMS business data is intentionally read-only.
 *
 * Mutation methods do not belong in this contract. Token acquisition may use
 * provider-required HTTP methods, but it remains isolated in server-side auth.
 */
export interface ReadOnlyLmsProvider {
  getCourses(
    params?: LmsCourseQueryParams,
  ): Promise<PaginatedLmsCourseResponse>;
  getCourseById(externalCourseId: string): Promise<LmsCourse | null>;
  getCourseAccreditations(
    externalCourseId: string,
  ): Promise<LmsAccreditation[]>;
  getCourseStatistics(
    externalCourseId: string,
  ): Promise<LmsCourseStatistics | null>;
  getCourseCategories(): Promise<LmsCategory[]>;
  healthCheck(): Promise<LmsProviderHealth>;
}
