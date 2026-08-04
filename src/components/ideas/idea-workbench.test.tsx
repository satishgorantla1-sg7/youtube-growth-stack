import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IdeaWorkbench } from "./idea-workbench";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const run = {
  id: "11111111-1111-4111-8111-111111111111", prompt: "AI creator workflows", completedAt: "2026-08-03T10:00:00Z",
  evidence: [{ id: "22222222-2222-4222-8222-222222222222", title: "Primary research", url: "https://example.com/research", preview: "Creators want practical automation." }],
};

afterEach(cleanup);

describe("IdeaWorkbench", () => {
  beforeEach(() => {
    refresh.mockReset();
    vi.stubGlobal("crypto", { randomUUID: () => "33333333-3333-4333-8333-333333333333" });
    vi.stubGlobal("fetch", vi.fn());
  });

  it("does not generate until the user explicitly acts", () => {
    render(<IdeaWorkbench runs={[run]} ideas={[]} canGenerate />);
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByText(/deterministic preview analysis/i)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /primary research/i })).toBeChecked();
  });

  it("submits only selected evidence and renders cited scored results", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ideas: [{ title: "Evidence-led workflow", premise: "A practical creator workflow grounded in the selected source.", demandScore: 70, relevanceScore: 80, competitionScore: 45, confidenceScore: 75, evidenceSourceIds: [run.evidence[0].id] }], reused: false }), { status: 201, headers: { "Content-Type": "application/json" } }));
    render(<IdeaWorkbench runs={[run]} ideas={[]} canGenerate />);
    fireEvent.click(screen.getByRole("button", { name: /generate ideas/i }));
    await screen.findByText("Evidence-led workflow");
    expect(screen.getByRole("link", { name: /primary research/i })).toHaveAttribute("href", "https://example.com/research");
    expect(screen.getByLabelText("Demand score 70 out of 100")).toBeInTheDocument();
    const request = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body));
    expect(request.evidenceSourceIds).toEqual([run.evidence[0].id]);
    expect(refresh).toHaveBeenCalled();
  });

  it("reports a safe server error without showing a result", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: "invalid_evidence" }), { status: 400, headers: { "Content-Type": "application/json" } }));
    render(<IdeaWorkbench runs={[run]} ideas={[]} canGenerate />);
    fireEvent.click(screen.getByRole("button", { name: /generate ideas/i }));
    await waitFor(() => expect(screen.getByText(/no longer available/i)).toBeInTheDocument());
    expect(screen.queryByText("Just generated")).not.toBeInTheDocument();
  });

  it("disables generation for read-only members", () => {
    render(<IdeaWorkbench runs={[run]} ideas={[]} canGenerate={false} />);
    expect(screen.getByRole("button", { name: /generate ideas/i })).toBeDisabled();
    expect(screen.getByText(/owners, admins, and editors/i)).toBeInTheDocument();
  });
});
