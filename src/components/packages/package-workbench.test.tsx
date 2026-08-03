// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PackageWorkbench } from "./package-workbench";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const idea = { id: "71000000-5000-4000-8000-000000000001", title: "Evidence-led growth", premise: "A grounded premise", status: "approved", evidenceCount: 1 };
const packageVersion = {
  id: "71000000-6000-4000-8000-000000000001", ideaId: idea.id, ideaTitle: idea.title, version: 1, state: "awaiting_approval", sourcePackageId: null,
  titles: ["An evidence-led title"], thumbnailConcepts: [{ concept: "Evidence", visualDescription: "Evidence next to assumptions", overlayText: "PROOF" }],
  hooks: ["The evidence changes the answer."], outline: [{ section: "Evidence", purpose: "Explain the finding" }], script: "A complete saved script.",
  evidence: [{ id: "71000000-4000-4000-8000-000000000001", title: "Verified source", url: "https://example.com/source", preview: "A bounded source preview" }],
  modelVersion: "preview-v1", promptVersion: "package-v1", createdAt: "2026-08-03T10:00:00Z", updatedAt: "2026-08-03T10:00:00Z",
  pendingApprovalId: "71000000-7000-4000-8000-000000000001",
};

describe("PackageWorkbench", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(cleanup);
  it("shows approved-idea generation and immutable evidence provenance", () => {
    render(<PackageWorkbench approvedIdeas={[idea]} reviewIdeas={[]} packages={[packageVersion]} canGenerate canDecide/>);
    expect(screen.getByRole("option", { name: /Evidence-led growth/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Verified source/ })).toHaveAttribute("href", "https://example.com/source");
    expect(screen.getAllByText(/preview-v1/)).toHaveLength(2);
  });
  it("keeps export visibly disabled and non-executable", () => {
    render(<PackageWorkbench approvedIdeas={[idea]} reviewIdeas={[]} packages={[]} canGenerate canDecide/>);
    expect(screen.getByRole("button", { name: "Export" })).toBeDisabled();
    expect(screen.getByText(/separate approval-gated capability/)).toBeInTheDocument();
  });
  it("shows approval decisions only to owners and admins", () => {
    const { rerender } = render(<PackageWorkbench approvedIdeas={[idea]} reviewIdeas={[]} packages={[packageVersion]} canGenerate canDecide={false}/>);
    expect(screen.queryByRole("button", { name: /Approve version/ })).not.toBeInTheDocument();
    rerender(<PackageWorkbench approvedIdeas={[idea]} reviewIdeas={[]} packages={[packageVersion]} canGenerate canDecide/>);
    expect(screen.getByRole("button", { name: /Approve version/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reject & create draft/ })).toBeInTheDocument();
  });
  it("offers the idea approval prerequisite only to owners and admins", () => {
    const draft = { ...idea, status: "candidate" };
    const { rerender } = render(<PackageWorkbench approvedIdeas={[]} reviewIdeas={[draft]} packages={[]} canGenerate canDecide={false}/>);
    expect(screen.queryByRole("button", { name: /Approve idea/ })).not.toBeInTheDocument();
    rerender(<PackageWorkbench approvedIdeas={[]} reviewIdeas={[draft]} packages={[]} canGenerate canDecide/>);
    expect(screen.getByRole("button", { name: /Approve idea/ })).toBeEnabled();
  });
});
