import { sampleCourses } from "@/lib/sample-data";
import type { ReadOnlyLmsProvider } from "./read-only-lms-provider";
import type {
  LmsAccreditation,
  LmsCategory,
  LmsCourse,
  LmsCourseQueryParams,
  LmsCourseStatistics,
  LmsCourseVersion,
  LmsProviderHealth,
  PaginatedLmsCourseResponse,
} from "./lms-types";

export type MockLmsMode = "healthy" | "warnings" | "outage";

export class MockLmsProvider implements ReadOnlyLmsProvider {
  constructor(private readonly mode: MockLmsMode = "healthy") {}

  async getCourses(
    params: LmsCourseQueryParams = {},
  ): Promise<PaginatedLmsCourseResponse> {
    this.assertAvailable();
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
    const search = params.search?.trim().toLowerCase();
    const filtered = search
      ? sampleCourses.filter((course) =>
          [course.title, course.courseCode, course.lmsCourseId ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(search),
        )
      : sampleCourses;
    const start = (page - 1) * pageSize;

    return {
      items: filtered.slice(start, start + pageSize).map((course) => this.toLmsCourse(course)),
      page,
      pageSize,
      total: filtered.length,
      hasMore: start + pageSize < filtered.length,
    };
  }

  async getCourseById(externalCourseId: string): Promise<LmsCourse | null> {
    this.assertAvailable();
    const course = sampleCourses.find(
      (candidate) =>
        candidate.lmsCourseId === externalCourseId ||
        `MOCK-${candidate.id}` === externalCourseId,
    );
    return course ? this.toLmsCourse(course) : null;
  }

  async getCourseVersions(
    externalCourseId: string,
  ): Promise<LmsCourseVersion[]> {
    this.assertAvailable();
    const course = sampleCourses.find(
      (candidate) => candidate.lmsCourseId === externalCourseId,
    );
    return (
      course?.versions.map((version) => ({
        externalVersionId: `${externalCourseId}-${version.id}`,
        versionLabel: version.versionNumber,
        publicationDate: version.publicationDate,
        retrievedAt: this.retrievedAt,
      })) ?? []
    );
  }

  async getCourseAccreditations(
    externalCourseId: string,
  ): Promise<LmsAccreditation[]> {
    this.assertAvailable();
    const course = sampleCourses.find(
      (candidate) => candidate.lmsCourseId === externalCourseId,
    );
    return (
      course?.accreditations.map((record) => ({
        externalAccreditationId: `${externalCourseId}-${record.id}`,
        organizationName: record.organization,
        status: record.status,
        expirationDate: record.expirationDate,
        retrievedAt: this.retrievedAt,
      })) ?? []
    );
  }

  async getCourseStatistics(
    externalCourseId: string,
  ): Promise<LmsCourseStatistics | null> {
    this.assertAvailable();
    const courseIndex = sampleCourses.findIndex(
      (candidate) => candidate.lmsCourseId === externalCourseId,
    );
    if (courseIndex < 0) return null;
    return {
      enrollmentCount: 240 + courseIndex * 37,
      completionCount: 180 + courseIndex * 29,
      retrievedAt: this.retrievedAt,
    };
  }

  async getCourseCategories(): Promise<LmsCategory[]> {
    this.assertAvailable();
    return [...new Set(sampleCourses.map((course) => course.primaryTopic))].map(
      (name, index) => ({
        externalCategoryId: `MOCK-CAT-${index + 1}`,
        name,
      }),
    );
  }

  async healthCheck(): Promise<LmsProviderHealth> {
    return {
      providerName: "Mock LMS",
      status: this.mode === "outage" ? "unavailable" : this.mode === "warnings" ? "degraded" : "available",
      checkedAt: this.retrievedAt,
      message:
        this.mode === "outage"
          ? "Simulated provider outage. Prior snapshots remain available."
          : this.mode === "warnings"
            ? "Provider is available with sample mapping warnings."
            : "Mock LMS provider is available.",
    };
  }

  private get retrievedAt(): string {
    return new Date().toISOString();
  }

  private assertAvailable(): void {
    if (this.mode === "outage") {
      throw new Error(
        "Simulated LMS outage. No data was deleted and the prior snapshot remains active.",
      );
    }
  }

  private toLmsCourse(course: (typeof sampleCourses)[number]): LmsCourse {
    const courseIndex = sampleCourses.indexOf(course);
    return {
      externalCourseId: course.lmsCourseId ?? `MOCK-${course.id}`,
      title: course.title,
      description: course.description,
      durationMinutes: course.durationMinutes,
      publicationStatus: course.publicationStatus,
      categoryIds: [course.primaryTopic],
      courseUrl: course.lmsCourseId
        ? `https://example.invalid/lms/courses/${course.lmsCourseId}`
        : null,
      retrievedAt: this.retrievedAt,
      providerName: "Mock LMS",
      mappingWarnings:
        this.mode === "warnings" && courseIndex < 2
          ? ["Sample record requires LMS mapping review."]
          : [],
    };
  }
}
