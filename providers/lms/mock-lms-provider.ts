import { sampleCourses } from "@/lib/sample-data";
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

export type MockLmsMode = "healthy" | "warnings" | "outage";

export class MockLmsProvider implements ReadOnlyLmsProvider {
  constructor(private readonly mode: MockLmsMode = "healthy") {}

  private get availableCourses() {
    return sampleCourses.filter((course) => course.lmsSnapshot);
  }

  async getCourses(
    params: LmsCourseQueryParams = {},
  ): Promise<PaginatedLmsCourseResponse> {
    this.assertAvailable();
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 25));
    const search = params.search?.trim().toLowerCase();
    const filtered = search
      ? this.availableCourses.filter((course) =>
          [course.title, course.courseCode, course.lmsCourseId ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(search),
        )
      : this.availableCourses;
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
    const course = this.availableCourses.find(
      (candidate) =>
        candidate.lmsCourseId === externalCourseId ||
        `MOCK-${candidate.id}` === externalCourseId,
    );
    return course ? this.toLmsCourse(course) : null;
  }

  async getCourseAccreditations(
    externalCourseId: string,
  ): Promise<LmsAccreditation[]> {
    this.assertAvailable();
    const course = this.availableCourses.find(
      (candidate) => candidate.lmsCourseId === externalCourseId,
    );
    return (
      course?.lmsSnapshot?.normalized.accreditations.map((record) => ({
        externalAccreditationId: `${externalCourseId}-ACC-${record.index + 1}`,
        organizationName: record.issuingBody ?? "Unknown issuing body",
        status: record.endDate && record.endDate < "2026-07-30" ? "Expired" : "Approved",
        expirationDate: record.endDate,
        jurisdiction: record.state,
        approvalNumber: record.accreditationNumber,
        topicNumber: record.topicNumber,
        effectiveDate: record.startDate,
        rawValues: record.rawValues,
        mappingWarnings: record.mappingWarnings,
        retrievedAt: this.retrievedAt,
      })) ?? []
    );
  }

  async getCourseStatistics(
    externalCourseId: string,
  ): Promise<LmsCourseStatistics | null> {
    this.assertAvailable();
    const courseIndex = this.availableCourses.findIndex(
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
    return [...new Set(this.availableCourses.flatMap((course) => course.lmsSnapshot?.normalized.publicTopics ?? []))].map(
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
    const courseIndex = this.availableCourses.indexOf(course);
    const snapshot = course.lmsSnapshot;
    if (!snapshot) {
      throw new Error("Content Metadata-only records are not returned by the mock LMS provider.");
    }
    const scenarioWarnings =
      this.mode === "warnings"
        ? [
            ...(courseIndex === 0
              ? ["A source row without a Course ID was rejected and reported as a validation error."]
              : []),
            ...(course.title === "Invalid LMS Duration Scenario"
              ? ["Invalid LMS duration requires review."]
              : []),
          ]
        : [];
    return {
      externalCourseId: snapshot.lmsCourseId,
      title: snapshot.normalized.courseName ?? course.title,
      description: snapshot.normalized.courseDescription,
      durationMinutes: snapshot.normalized.durationMinutes,
      publicationStatus: course.publicationStatus,
      categoryIds: [
        ...snapshot.normalized.publicTopics,
        ...snapshot.normalized.privateTopics,
      ],
      courseUrl: course.contentMetadata?.frontendLink ?? null,
      retrievedAt: this.retrievedAt,
      providerName: "Mock LMS",
      rawPayload: snapshot.rawPayload,
      normalized: snapshot.normalized,
      mappingWarnings: [
        ...snapshot.mappingWarnings,
        ...course.mappingWarnings.filter((warning) =>
          /site|duration|course id|accreditation|date|metadata/i.test(warning),
        ),
        ...scenarioWarnings,
      ],
    };
  }
}
