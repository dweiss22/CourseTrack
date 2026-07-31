import type { ReadOnlyLmsProvider } from "./read-only-lms-provider";
import type {
  LmsAccreditation,
  LmsCategory,
  LmsCourse,
  LmsCourseQueryParams,
  LmsCourseStatistics,
  LmsProviderHealth,
  PaginatedLmsCourseResponse,
} from "./lms-types";

const notConfigured = (): never => {
  throw new Error(
    "The live LMS provider is not configured. Documented endpoint paths, authentication, pagination, and field mappings are required before activation.",
  );
};

/**
 * Configuration-only placeholder. Actual endpoint paths are intentionally not
 * invented and LMS mutation methods are intentionally absent.
 */
export class LiveLmsProvider implements ReadOnlyLmsProvider {
  async getCourses(
    params?: LmsCourseQueryParams,
  ): Promise<PaginatedLmsCourseResponse> {
    void params;
    return notConfigured();
  }

  async getCourseById(externalCourseId: string): Promise<LmsCourse | null> {
    void externalCourseId;
    return notConfigured();
  }

  async getCourseAccreditations(
    externalCourseId: string,
  ): Promise<LmsAccreditation[]> {
    void externalCourseId;
    return notConfigured();
  }

  async getCourseStatistics(
    externalCourseId: string,
  ): Promise<LmsCourseStatistics | null> {
    void externalCourseId;
    return notConfigured();
  }

  async getCourseCategories(): Promise<LmsCategory[]> {
    return notConfigured();
  }

  async healthCheck(): Promise<LmsProviderHealth> {
    return {
      providerName: "Live LMS",
      status: "not-configured",
      checkedAt: new Date().toISOString(),
      message:
        "Waiting for documented LMS base URL, authentication, endpoint, pagination, rate-limit, and mapping details.",
    };
  }
}
