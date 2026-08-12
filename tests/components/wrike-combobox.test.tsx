import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { WrikeTaskLinkControl } from "@/components/wrike-task-link-control";
import type { CourseVersion } from "@/types/course";

const version: CourseVersion = {
  id: "version-1", versionNumber: "1.0", versionType: "Initial Release", publicationDate: "2026-01-01",
  isCurrent: true, versionStatus: "Published", managedBy: "CourseTrack", createdAt: "2026-01-01T00:00:00Z",
  createdBy: "Alex Admin", releaseNotes: "Initial", authoringTool: "Rise", packageStandard: "SCORM", wrikeTaskReferences: [],
};
const candidate = {
  wrikeTaskId: "IEAA", title: "Critical incident update", status: "Active", permalink: "https://www.wrike.com/open.htm?id=1",
  wrikeUpdatedDate: "2026-08-01T00:00:00Z", sourceFolders: [{ folderId: "F1", folderName: "Course Production" }],
  projectTitles: ["Course Production"], assigneeNames: ["Taylor Editor"], dueDate: "2026-08-20",
  reportingYear: "2026",
  customFields: [
    { id: "IEACW7ABJUAAAAAA", name: "Reporting Year", type: "Text", value: "2026" },
    { id: "IEACW7ABJUAAAAAB", name: "Course Owner", type: "DropDown", value: "Content team" },
  ],
  lastSyncedAt: "2026-08-01T00:00:00Z", indexState: { status: "ready" as const, message: "Ready" },
};
const candidateWithoutYear = {
  ...candidate, wrikeTaskId: "IEAB", title: "Legacy refresh", reportingYear: null, customFields: [],
};
// Deploy-skew guard: a response cached before this feature shipped has neither
// new property, and the option must still render.
function withoutNewFields(source: typeof candidate): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...source };
  delete copy.reportingYear;
  delete copy.customFields;
  return copy;
}
const legacyCandidate = withoutNewFields({ ...candidate, wrikeTaskId: "IEAC", title: "Archived rollout" });

function searchResponse(items: unknown[]) {
  return new Response(JSON.stringify({ items, state: { status: "ready", message: "Ready" } }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("Wrike Task Link combobox", () => {
  it("debounces synchronized-index search, supports keyboard selection, and retains the selected stable task", async () => {
    const onReferencesChange = vi.fn();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [candidate], state: { status: "ready", message: "Ready" } }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ link: { id: "link-1", wrikeTaskId: "IEAA", taskTitle: candidate.title, permalink: candidate.permalink, taskStatus: candidate.status, projectTitle: "Course Production", assigneeNames: candidate.assigneeNames, dueDate: candidate.dueDate, updatedAt: "2026-08-04T00:00:00Z" } }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<WrikeTaskLinkControl version={version} canManage onReferencesChange={onReferencesChange} />);
    await user.click(screen.getByRole("button", { name: "Link Wrike task" }));
    const input = screen.getByRole("combobox", { name: "Wrike Task Link" });
    await user.type(input, "critical");
    expect(await screen.findByRole("option", { name: /Critical incident update/ })).toBeInTheDocument();
    await user.keyboard("{ArrowDown}{Enter}");
    expect(input).toHaveValue(candidate.title);
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Link task" }));
    await waitFor(() => expect(onReferencesChange).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body))).toMatchObject({ candidateTaskId: "IEAA" });
  });

  it("switches valid Wrike URLs into direct-link mode without searching", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    render(<WrikeTaskLinkControl version={version} canManage onReferencesChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Link Wrike task" }));
    await user.type(screen.getByRole("combobox"), "https://www.wrike.com/open.htm?id=123");
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    expect(screen.getByText(/Direct-link mode:/, { selector: "p" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders through a body portal and restores trigger focus when Escape closes it", async () => {
    const user = userEvent.setup(); vi.stubGlobal("fetch", vi.fn());
    render(<div data-testid="host"><WrikeTaskLinkControl version={version} canManage onReferencesChange={vi.fn()} /></div>);
    const trigger = screen.getByRole("button", { name: "Link Wrike task" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Link Wrike task" });
    expect(dialog.parentElement).toBe(document.body);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Link Wrike task" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("labels the reporting year, falls back to a neutral value, and never renders raw custom-field ids", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(searchResponse([candidate, candidateWithoutYear, legacyCandidate])));
    const user = userEvent.setup();
    render(<WrikeTaskLinkControl version={version} canManage onReferencesChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Link Wrike task" }));
    await user.type(screen.getByRole("combobox", { name: "Wrike Task Link" }), "update");

    const withYear = await screen.findByRole("option", { name: /Critical incident update/ });
    expect(withYear).toHaveTextContent("Reporting year: 2026");

    // Missing and absent values both use the existing neutral treatment.
    expect(screen.getByRole("option", { name: /Legacy refresh/ })).toHaveTextContent("Reporting year: not set");
    expect(screen.getByRole("option", { name: /Archived rollout/ })).toHaveTextContent("Reporting year: not set");

    // Custom-field ids, placeholder labels, and unresolved values stay out of
    // the user-facing result -- only the Wrike task id itself is shown.
    expect(screen.queryByText(/IEACW7ABJUAAAAA/)).toBeNull();
    expect(screen.queryByText(/Unknown field|Unidentified field|Field </i)).toBeNull();
    expect(screen.queryByText(/Course Owner/)).toBeNull();
  });

  it("keeps candidates stacked and free of horizontal overflow at a narrow viewport", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(searchResponse([candidate])));
    const user = userEvent.setup();
    render(<WrikeTaskLinkControl version={version} canManage onReferencesChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Link Wrike task" }));
    await user.type(screen.getByRole("combobox", { name: "Wrike Task Link" }), "update");
    await screen.findByRole("option", { name: /Critical incident update/ });

    // The option's metadata lines are block-level spans in a grid column, so
    // they wrap rather than forcing the list wider than its container.
    const optionButton = screen.getByRole("option", { name: /Critical incident update/ }).querySelector("button");
    expect(optionButton).not.toBeNull();
    expect(optionButton?.querySelectorAll("span")).toHaveLength(3);
    expect(optionButton?.querySelector(".wrike-candidate-reporting-year")).not.toBeNull();
    for (const element of optionButton!.querySelectorAll("span, strong")) {
      expect((element as HTMLElement).style.width).toBe("");
    }
  });
});
