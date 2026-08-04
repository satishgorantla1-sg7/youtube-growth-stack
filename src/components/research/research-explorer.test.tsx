import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ResearchDetail, ResearchHistory } from "./research-explorer";

afterEach(cleanup);
const filters = { page: 1, state: "all" as const, projectId: null, from: null, to: null };
const base = { id: "00000000-0000-4000-8000-000000000001", projectId: null, projectName: null, prompt: "Find durable AI workflow patterns", mode: "deep", state: "completed" as const, sourceCount: 1, estimatedCredits: 4, actualCredits: 3, createdAt: "2026-08-01T10:00:00Z", completedAt: "2026-08-01T10:03:00Z", errorCode: null };

describe("ResearchHistory", () => {
  it("renders filterable metadata links without source content", () => {
    render(<ResearchHistory filters={filters} result={{ items: [base], projects: [], page: 1, hasPrevious: false, hasNext: true }} />);
    expect(screen.getByRole("link", { name: /find durable ai workflow patterns/i })).toHaveAttribute("href", `/research/${base.id}`);
    expect(screen.getByText("1 source")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Previous" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("link", { name: "Next" })).toHaveAttribute("href", "/research?page=2");
  });
  it("marks long prompts and channel URLs for safe wrapping", () => {
    const prompt = "Okay, can I search this YouTube channel for ideas? https://www.youtube.com/channel/UCwg1ilsns02BK1nG8Vo5Cwg";
    render(<ResearchHistory filters={filters} result={{ items: [{ ...base, prompt }], projects: [], page: 1, hasPrevious: false, hasNext: false }} />);

    expect(screen.getByRole("heading", { name: prompt })).toHaveClass("research-run-title");
  });
  it("shows a truthful filtered empty state", () => {
    render(<ResearchHistory filters={filters} result={{ items: [], projects: [], page: 1, hasPrevious: false, hasNext: false }} />);
    expect(screen.getByRole("heading", { name: "No matching research" })).toBeInTheDocument();
  });
});

describe("ResearchDetail", () => {
  it("shows bounded evidence and safe source links", () => {
    render(<ResearchDetail run={{ ...base, startedAt: "2026-08-01T10:00:10Z", updatedAt: "2026-08-01T10:03:00Z", evidenceLimited: false, evidence: [{ id: "source-1", provider: "firecrawl", sourceType: "web", url: "https://example.com/article", title: "Primary evidence", capturedAt: "2026-08-01T10:01:00Z", provenance: { query: "AI workflow" }, preview: "A concise, server-bounded preview." }] }} />);
    expect(screen.getByRole("heading", { name: "Primary evidence" })).toBeInTheDocument();
    expect(screen.getByText("A concise, server-bounded preview.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open source/i })).toHaveAttribute("rel", "noreferrer");
  });
  it("keeps lifecycle mutations unavailable to non-managers", () => {
    render(<ResearchDetail run={{ ...base, state: "dead_letter", errorCode: "lease_expired_at_max_attempts", startedAt: null, updatedAt: base.createdAt, evidenceLimited: false, evidence: [] }} />);
    expect(screen.getByRole("button", { name: "Request retry approval" })).toBeDisabled();
    expect(screen.getByText(/only a workspace owner or admin/i)).toBeInTheDocument();
  });
  it("shows approval, cancellation, and credit state truthfully", () => {
    const detail = { ...base, actualCredits: null, startedAt: null, updatedAt: base.createdAt, evidenceLimited: false, evidence: [] };
    const { rerender } = render(<ResearchDetail run={{ ...detail, state: "awaiting_approval" }} canManage />);
    expect(screen.getByText(/no research is queued and no credits are reserved or consumed/i)).toBeInTheDocument();
    expect(screen.getByText("Estimated credits")).toBeInTheDocument();
    rerender(<ResearchDetail run={{ ...detail, state: "cancelling" }} canManage />);
    expect(screen.getByText(/in-flight work is stopping/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancel run" })).not.toBeInTheDocument();
  });
});
