import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GrowthWorkspace } from "./growth-workspace";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("GrowthWorkspace truthful dashboard", () => {
  it("does not invent channel, credit, idea, approval, or readiness claims", () => {
    render(<GrowthWorkspace />);

    expect(screen.getByText("No channel connected")).toBeInTheDocument();
    expect(screen.getByText("Idea data is unavailable")).toBeInTheDocument();
    expect(screen.getByText("Approval data is unavailable")).toBeInTheDocument();
    expect(screen.getByText("Usage data is not available yet.")).toBeInTheDocument();
    expect(screen.getByText("Status unavailable")).toBeInTheDocument();
    expect(screen.queryByText(/Satish Builds AI/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/All systems ready/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/62 of 100/i)).not.toBeInTheDocument();
  });

  it("renders supplied tenant-scoped summaries and marks demo mode", () => {
    render(
      <GrowthWorkspace
        mode="demo"
        dashboard={{
          channel: { name: "Verified channel", status: "connected" },
          ideas: [{ id: "idea-1", title: "Evidence-backed idea", score: 82, signal: "Relevant signal" }],
          approvals: [{ id: "approval-1", title: "Review research", kind: "research", summary: "Bounded plan" }],
          activity: { sourcesAnalysed: 4, packagesGenerated: 0, bestSignal: null },
        }}
        usage={{ usedCredits: 4, creditLimit: 20 }}
        readiness={{ status: "configuration_required", label: "Provider setup required" }}
        navigationCounts={{ approvals: 1 }}
      />,
    );

    expect(screen.getByText("Demo data")).toBeInTheDocument();
    expect(screen.getByText("Verified channel")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Evidence-backed idea/i })).toHaveAttribute("href", "/ideas/idea-1");
    expect(screen.getByText("Review research")).toBeInTheDocument();
    expect(screen.getByText("Provider setup required")).toBeInTheDocument();
  });
});
