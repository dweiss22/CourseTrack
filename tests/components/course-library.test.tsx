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
  backendLink: "https://admin.example.test/courses/101", frontendLink: "https://learn.example.test/courses/101",
};
const unclassified: CourseLibraryRecord = { ...included, id: "unclassified", title: "Outside Portfolio", courseCode: "CT-200", managementClassification: "Unclassified", hasContentMetadata: false };

describe("Course Library columns and management filters", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ preferences: DEFAULT_COURSE_LIBRARY_PREFERENCES }), { status: 200, headers: { "content-type": "application/json" } }))));
  });

  it("defaults to All courses, exposes exactly three management options, and shows every record", () => {
    render(<CourseLibrary courses={[included, unclassified]} initialTotal={2} initialFavoriteIds={[]} initialPreferences={DEFAULT_COURSE_LIBRARY_PREFERENCES} canEdit={false} />);
    const filter = screen.getByRole("combobox", { name: "Filter by management classification" });
    expect(filter).toHaveValue("All courses");
    expect(within(filter).getAllByRole("option").map((option) => option.textContent)).toEqual([
      "All courses", "Lexipol Managed", "Unclassified",
    ]);
    expect(screen.getByText("2 courses")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Critical Incident Leadership" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Outside Portfolio" })).toBeInTheDocument();
    expect(screen.getByText(/uploaded master metadata or an explicit CourseTrack assignment/)).toBeInTheDocument();
    expect(screen.getAllByText("Conflicts", { selector: "dt" })).toHaveLength(2);
  });

  it("combines management filtering with search and server counts", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (!url.startsWith("/api/courses?")) return Promise.resolve(new Response(JSON.stringify({ preferences: DEFAULT_COURSE_LIBRARY_PREFERENCES }), { status: 200 }));
      const params = new URLSearchParams(url.split("?")[1]);
      const managed = params.get("classification") === "Lexipol Managed";
      return Promise.resolve(new Response(JSON.stringify({ items: [managed ? included : unclassified], total: 1 }), { status: 200, headers: { "content-type": "application/json" } }));
    }));
    render(<CourseLibrary courses={[included, unclassified]} initialTotal={2} initialFavoriteIds={[]} initialPreferences={DEFAULT_COURSE_LIBRARY_PREFERENCES} canEdit={false} />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by management classification" }), "Unclassified");
    await waitFor(() => expect(screen.queryByRole("link", { name: "Critical Incident Leadership" })).not.toBeInTheDocument());
    expect(screen.getByRole("link", { name: "Outside Portfolio" })).toBeInTheDocument();
    expect(screen.getByText("1 courses")).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Search course library" }), "Outside");
    await waitFor(() => expect(fetch).toHaveBeenLastCalledWith(
      expect.stringMatching(/classification=Unclassified.*search=Outside|search=Outside.*classification=Unclassified/),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    ));

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by management classification" }), "Lexipol Managed");
    await waitFor(() => expect(screen.getByRole("link", { name: "Critical Incident Leadership" })).toBeInTheDocument());
  });

  it("resets pagination when the management filter changes", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ items: [unclassified], total: 26 }), { status: 200, headers: { "content-type": "application/json" } }))));
    render(<CourseLibrary courses={[included]} initialTotal={26} initialFavoriteIds={[]} initialPreferences={DEFAULT_COURSE_LIBRARY_PREFERENCES} canEdit={false} />);
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("page=2"), expect.any(Object)));
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by management classification" }), "Unclassified");
    await waitFor(() => expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining("page=1"), expect.any(Object)));
    expect(screen.getAllByText(/Page 1/).length).toBeGreaterThan(0);
  });

  it("resets pagination for search changes and restores All courses on remount", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ items: [included], total: 26 }), { status: 200, headers: { "content-type": "application/json" } }))));
    const view = render(<CourseLibrary courses={[included]} initialTotal={26} initialFavoriteIds={[]} initialPreferences={DEFAULT_COURSE_LIBRARY_PREFERENCES} canEdit={false} />);
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("page=2"), expect.any(Object)));
    await user.type(screen.getByRole("textbox", { name: "Search course library" }), "leadership");
    await waitFor(() => expect(fetch).toHaveBeenLastCalledWith(
      expect.stringMatching(/page=1.*search=leadership|search=leadership.*page=1/),
      expect.any(Object),
    ));
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by management classification" }), "Unclassified");
    view.unmount();
    render(<CourseLibrary courses={[included]} initialTotal={26} initialFavoriteIds={[]} initialPreferences={DEFAULT_COURSE_LIBRARY_PREFERENCES} canEdit={false} />);
    expect(screen.getByRole("combobox", { name: "Filter by management classification" })).toHaveValue("All courses");
    expect(screen.getByRole("textbox", { name: "Search course library" })).toHaveValue("");
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
