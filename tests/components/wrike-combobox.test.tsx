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
  lastSyncedAt: "2026-08-01T00:00:00Z", indexState: { status: "ready" as const, message: "Ready" },
};

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
});
