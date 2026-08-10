import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CourseLibrary, type CourseLibraryRecord } from "@/components/course-library/course-library";
import { DEFAULT_COURSE_LIBRARY_PREFERENCES } from "@/types/preferences";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a href={String(href)} {...props}>{children}</a> }));

const included: CourseLibraryRecord = {
  id: "included", title: "Critical Incident Leadership", shortTitle: "Incident Leadership",
  courseCode: "CT-100", lmsCourseId: "LMS-100", description: "Leadership course", primaryVertical: "P1A",
  managementClassification: "Lexipol managed", reconciliationStatus: "Matched between LMS and Content Metadata",
  retrievalStatus: "Retrieved", lastRetrievedAt: "2026-08-01T00:00:00Z", conflictCount: 0,
  healthStatus: "Healthy", lifecycleStatus: "Published", primaryTopic: "Leadership", tags: ["incident"],
  owner: "Alex Admin", durationMinutes: 60, dataSource: "uploaded", topicAssignments: [{ topic: "Leadership" }],
  hasLmsSnapshot: true, hasContentMetadata: true, importValidationErrorCount: 0,
};
const excluded: CourseLibraryRecord = { ...included, id: "excluded", title: "Outside Portfolio", courseCode: "CT-200", managementClassification: "Non-Lexipol excluded" };

describe("Course Library columns and portfolio scope", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ preferences: DEFAULT_COURSE_LIBRARY_PREFERENCES }), { status: 200, headers: { "content-type": "application/json" } }))));
  });

  it("defaults to Included portfolio and exposes hidden fields in mobile row details", () => {
    render(<CourseLibrary courses={[included, excluded]} initialFavoriteIds={[]} initialPreferences={DEFAULT_COURSE_LIBRARY_PREFERENCES} canEdit={false} />);
    expect(screen.getByText("1 courses")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Critical Incident Leadership" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Outside Portfolio" })).not.toBeInTheDocument();
    expect(screen.getByText(/Only courses marked Excluded from portfolio are omitted/)).toBeInTheDocument();
    expect(screen.getByText("Conflicts", { selector: "dt" })).toBeInTheDocument();
  });

  it("persists toggles, supports density presets, and returns focus on Escape and outside click", async () => {
    const user = userEvent.setup();
    render(<CourseLibrary courses={[included]} initialFavoriteIds={[]} initialPreferences={DEFAULT_COURSE_LIBRARY_PREFERENCES} canEdit={false} />);
    const columnsButton = screen.getByRole("button", { name: /Columns/ });
    await user.click(columnsButton);
    const popover = screen.getByRole("dialog", { name: "Choose Course Library columns" });
    const conflicts = within(popover).getByRole("checkbox", { name: "Conflicts" });
    expect(conflicts).not.toBeChecked();
    await user.click(conflicts);
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/preferences/course-library", expect.objectContaining({ method: "PUT", body: expect.stringContaining("conflictCount") })));
    await user.click(within(popover).getByRole("button", { name: "Show all" }));
    expect(within(popover).getAllByRole("checkbox").every((checkbox) => (checkbox as HTMLInputElement).checked)).toBe(true);
    await user.click(within(popover).getByRole("button", { name: "Essential" }));
    expect(within(popover).getAllByRole("checkbox").filter((checkbox) => (checkbox as HTMLInputElement).checked)).toHaveLength(3);
    expect(within(popover).getByRole("checkbox", { name: "Primary vertical" })).toBeChecked();
    expect(within(popover).getByRole("checkbox", { name: "Management" })).toBeChecked();
    expect(within(popover).getByRole("checkbox", { name: "Health" })).toBeChecked();
    await user.click(within(popover).getByRole("button", { name: "Reset to default" }));
    expect(within(popover).getByRole("checkbox", { name: "Conflicts" })).not.toBeChecked();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Choose Course Library columns" })).not.toBeInTheDocument();
    expect(columnsButton).toHaveFocus();
    await user.click(columnsButton);
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog", { name: "Choose Course Library columns" })).not.toBeInTheDocument();
    expect(columnsButton).toHaveFocus();
  });

  it("opens an accessible health explanation generated from shared constants", async () => {
    const user = userEvent.setup();
    const { container } = render(<CourseLibrary courses={[included]} initialFavoriteIds={[]} initialPreferences={DEFAULT_COURSE_LIBRARY_PREFERENCES} canEdit={false} />);
    await user.click(screen.getByRole("button", { name: "About CourseTrack Health Levels" }));
    expect(screen.getByRole("dialog", { name: "About CourseTrack Health Levels" })).toHaveAttribute("open");
    expect(within(screen.getByRole("dialog", { name: "About CourseTrack Health Levels" })).getByText("Healthy")).toBeInTheDocument();
    expect((await axe(container)).violations).toHaveLength(0);
  });
});
