import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CourseDetail } from "@/components/course-detail/course-detail";
import type { AccreditationRecord, Course, FieldComparison } from "@/types/course";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={String(href)} {...props}>{children}</a> }));

const comparison: FieldComparison = {
  id: "comparison-title", fieldKey: "courseName", fieldLabel: "Course name", lmsRawValue: "LMS title",
  lmsNormalizedValue: "LMS title", contentMetadataRawValue: null, contentMetadataNormalizedValue: null,
  courseTrackNormalizedValue: "CourseTrack title", fieldScope: "shared", alignmentStatus: "Pending LMS update",
  lmsSourceTimestamp: "2026-08-01T00:00:00Z", metadataSourceTimestamp: null, confirmationActor: null,
  confirmationTime: null, confirmationNote: null, sourceValueHash: "hash", confirmedSourceHash: null,
  resolvedValue: null, selectedSource: null, comparisonStatus: "Conflict", resolutionReason: null, resolvedBy: null,
  resolvedAt: null, lastComparedAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-01T00:00:00Z", isComparable: true,
};

const activeAccreditation: AccreditationRecord = {
  id: "acc-active", organization: "State POST", jurisdiction: "Texas", status: "Approved", approvalNumber: "A-200",
  topicNumber: "T-2", creditHours: 2, effectiveDate: "2026-01-01", expirationDate: "2027-01-01", source: "uploaded",
  riskReasons: [], updatedAt: "2026-08-02T00:00:00Z", archivedAt: null, sourceDomain: "lms", sourceTransport: "uploaded",
  sourceNormalizedValues: {}, alignmentStatus: "In sync", confirmationActor: null, confirmationTime: null, confirmationNote: null,
};
const archivedAccreditation: AccreditationRecord = {
  ...activeAccreditation, id: "acc-archived", approvalNumber: "A-100", effectiveDate: "2025-01-01",
  expirationDate: "2025-12-31", source: "coursetrack", sourceDomain: "coursetrack", sourceTransport: "manual",
  alignmentStatus: "App only", archivedAt: "2026-01-03T00:00:00Z", updatedAt: "2026-01-03T00:00:00Z",
};

function course(overrides: Partial<Course> = {}): Course {
  return {
    id: "course-1", updatedAt: "2026-08-01T00:00:00Z", courseCode: "CT-1", lmsCourseId: "LMS-1",
    managementClassification: "Lexipol managed", monitoringEnabled: true, lmsLinkStatus: "linked", title: "CourseTrack title",
    shortTitle: "Short", description: "Description", learningAudience: "Learners", verticals: ["P1A"], primaryTopic: "Safety", tags: [],
    lifecycleStatus: "Published", publicationStatus: "Published", deliveryFormat: "Online", durationMinutes: 60,
    authoringTool: "Rise", stateCode: null, owner: "Owner", instructionalDesigner: null, currentVersion: "1.0",
    originalPublishDate: "2025-01-01", lastMajorRevisionDate: null, nextReviewDate: null, accreditationStatus: "Approved",
    nearestAccreditationExpiration: "2027-01-01", healthStatus: "Healthy", healthScore: 90, metadataCompletenessScore: 90,
    dataSource: "coursetrack", sourceSystem: "CourseTrack", retrievalStatus: "Retrieved", lastRetrievedAt: "2026-08-01T00:00:00Z",
    isSample: false, internalSummary: "Summary", versions: [], accreditations: [activeAccreditation, archivedAccreditation], flags: [], notes: [],
    revampProposal: null, lmsSnapshot: null, contentMetadata: null,
    resolvedFields: { courseName: null, durationMinutes: null, trainingCredits: null, published: null, description: null, publishedDate: null },
    fieldComparisons: [comparison], sourceTimestamps: { lmsRetrievedAt: null, contentMetadataImportedAt: null, topicsImportedAt: null, lastComparedAt: null },
    mappingWarnings: [], topicAssignments: [], tagAssignments: [], verticalAssignments: [], relationships: [], importHistory: [], retrievalHistory: [],
    auditHistory: [], conflictCount: 1, sourceDifferenceCount: 1, projectionOrigin: "coursetrack_created", hasManualOverrides: false,
    trainingCredits: { rawDisplay: "1 hour", amount: 1, unit: "hours" }, published: true, backendLink: null, frontendLink: null,
    updateType: null, contentUpdatedAt: null, contentNotes: null, importValidationErrors: [], ...overrides,
  };
}

const renderDetail = (value = course()) => render(<CourseDetail course={value} topicSuggestions={[]} tagSuggestions={[]} initialFavorite={false} canEditCourse canManageVersions canManageAccreditations isAdministrator lmsAuthorityMode="workbook" assignees={[]} userId="user-1" />);

describe("Course Detail inline workflow", () => {
  it("edits only the CourseTrack lane and renders the canonical database response", async () => {
    const original = course();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ course: course({ title: "Canonical saved title", updatedAt: "2026-08-02T00:00:00Z" }) }), { status: 200, headers: { "content-type": "application/json" } })));
    const user = userEvent.setup();
    renderDetail(original);
    expect(screen.queryByRole("button", { name: "Data Comparison" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "LMS Data" })).not.toBeInTheDocument();
    expect(screen.getByText("LMS title")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Explain Pending LMS update/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit Course name" }));
    const input = screen.getByDisplayValue("CourseTrack title");
    await user.clear(input); await user.type(input, "Draft title{Enter}");
    await waitFor(() => expect(screen.getAllByText("Canonical saved title").length).toBeGreaterThan(0));
    const body = JSON.parse(String((vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).body));
    expect(body).toEqual({ field: "title", value: "Draft title", expectedUpdatedAt: original.updatedAt });
  });

  it("retains the draft after a validation or concurrency failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Course changed since it was loaded." }), { status: 409, headers: { "content-type": "application/json" } })));
    const user = userEvent.setup(); renderDetail();
    await user.click(screen.getByRole("button", { name: "Edit Course name" }));
    const input = screen.getByDisplayValue("CourseTrack title");
    await user.clear(input); await user.type(input, "Keep this draft{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Course changed since it was loaded.");
    expect(screen.getByDisplayValue("Keep this draft")).toBeInTheDocument();
  });

  it("focuses select editors and lets Escape cancel without saving", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup(); renderDetail();
    const edit = screen.getByRole("button", { name: "Edit Monitoring enabled" });
    await user.click(edit);
    const editor = screen.getByRole("combobox", { name: "Edit Monitoring enabled" });
    expect(editor).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("combobox", { name: "Edit Monitoring enabled" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Monitoring enabled" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("groups active and archived accreditation and only offers permanent deletion for the archived CourseTrack entry", async () => {
    const user = userEvent.setup(); renderDetail();
    await user.click(screen.getByRole("tab", { name: "Accreditation" }));
    const accordion = screen.getByText("State POST").closest("details");
    expect(accordion).not.toBeNull();
    expect(within(accordion!).getByText(/2 records/)).toBeInTheDocument();
    expect(within(accordion!).getAllByText("A-200").length).toBeGreaterThan(0);
    expect(within(accordion!).getByRole("button", { name: "Delete permanently" })).toBeInTheDocument();
    expect(within(accordion!).getAllByText("Archived").length).toBeGreaterThan(0);
  });
});
