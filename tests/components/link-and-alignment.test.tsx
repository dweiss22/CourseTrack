import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AlignmentGlossary, AlignmentStatusBadge } from "@/components/alignment-help";
import { LmsLinkActions } from "@/components/lms-link-actions";
import { ALIGNMENT_DEFINITIONS } from "@/lib/alignment-status";
import { normalizedHttpUrl } from "@/lib/external-url";

describe("LMS link actions", () => {
  it("allows only HTTP(S), opens safely, and never renders the backend URL as text", () => {
    const backend = "https://admin.example.test/restricted/123";
    render(<LmsLinkActions backendLink={backend} frontendLink="javascript:alert(1)" courseName="Safety" />);
    const action = screen.getByRole("link", { name: "Open LMS backend for Safety in a new tab" });
    expect(action).toHaveAttribute("href", backend);
    expect(action).toHaveAttribute("target", "_blank");
    expect(action).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.queryByText(backend)).not.toBeInTheDocument();
    expect(screen.getByText("Invalid course link")).toBeInTheDocument();
    expect(normalizedHttpUrl("ftp://example.test/file")).toBeNull();
  });
});

describe("alignment explanations", () => {
  it("uses the exact centralized definitions and supports focus, click, and Escape", async () => {
    const user = userEvent.setup();
    render(<><AlignmentStatusBadge status="Pending LMS update" /><AlignmentGlossary /></>);
    const trigger = screen.getByRole("button", { name: /Explain Pending LMS update/ });
    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip")).toHaveTextContent(ALIGNMENT_DEFINITIONS["Pending LMS update"]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Alignment glossary/ }));
    expect(screen.getByRole("dialog", { name: "Alignment status glossary" })).toHaveTextContent(ALIGNMENT_DEFINITIONS["Mapping required"]);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
