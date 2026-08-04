import { describe, expect, it } from "vitest";
import type { DashboardDataSource } from "./contracts";
import { loadIdeasPage, loadPackagesPage, loadResearchPage, loadUsagePage, selectActiveDashboardChannel } from "./loaders";

const ok = <T,>(data: T) => Promise.resolve({ data, error: null } as const);

function source(overrides: Partial<DashboardDataSource> = {}): DashboardDataSource {
  return {
    researchRuns: () => ok([]),
    researchSources: () => ok([]),
    ideas: () => ok([]),
    packages: () => ok([]),
    ideasById: () => ok([]),
    approvals: () => ok([]),
    latestYoutubeSync: () => ok(null),
    youtubeWorkerStatus: () => ok({ status: "not_seen", lastSeenAt: null }),
    channels: () => ok([]),
    projects: () => ok([]),
    usage: () => ok([]),
    workspace: () => ok({ id: "workspace-1", name: "Studio", slug: "studio", plan: "starter", daily_credit_limit: 100 }),
    navigationCounts: () => ok({ research: 0, ideas: 0, packages: 0, approvals: 0 }),
    ...overrides,
  };
}

describe("dashboard page loaders", () => {
  it("returns explicit empty states instead of invented records", async () => {
    await expect(loadIdeasPage(source(), "workspace-1")).resolves.toEqual({ kind: "empty", data: [] });
    await expect(loadResearchPage(source(), "workspace-1")).resolves.toEqual({ kind: "empty", data: [] });
  });

  it("shapes populated research and package records", async () => {
    const research = await loadResearchPage(source({
      researchRuns: () => ok([{
        id: "run-1", prompt: "AI productivity", mode: "deep", state: "completed", estimated_credits: 4,
        actual_credits: 3, created_at: "2026-08-01T10:00:00Z", completed_at: "2026-08-01T10:01:00Z", error_code: null,
      }]),
      researchSources: () => ok([
        { id: "source-1", research_run_id: "run-1" },
        { id: "source-2", research_run_id: "run-1" },
      ]),
    }), "workspace-1");
    expect(research).toMatchObject({ kind: "ready", data: [{ id: "run-1", sourceCount: 2 }] });

    const packages = await loadPackagesPage(source({
      packages: () => ok([{
        id: "package-1", idea_id: "idea-1", version: 2, state: "draft",
        created_at: "2026-08-01T10:00:00Z", updated_at: "2026-08-01T11:00:00Z",
      }]),
      ideasById: () => ok([{ id: "idea-1", title: "A useful video" }]),
    }), "workspace-1");
    expect(packages).toMatchObject({ kind: "ready", data: [{ id: "package-1", ideaTitle: "A useful video" }] });
  });

  it("fails the whole view model when a tenant query fails", async () => {
    const failure = source({ ideas: () => Promise.resolve({ data: null, error: "RLS query unavailable" }) });
    await expect(loadIdeasPage(failure, "workspace-1")).resolves.toEqual({ kind: "error", message: "RLS query unavailable" });
  });

  it("aggregates only the returned usage ledger entries", async () => {
    const loaded = await loadUsagePage(source({
      usage: () => ok([
        { id: 1, provider: "firecrawl", operation: "search", credits: 2, provider_cost_usd: 0.02, created_at: "2026-08-01T10:00:00Z" },
        { id: 2, provider: "apify", operation: "scrape", credits: 3, provider_cost_usd: null, created_at: "2026-08-01T11:00:00Z" },
      ]),
    }), "workspace-1");
    expect(loaded).toMatchObject({ kind: "ready", data: { totalCredits: 5 } });
  });

  it("shows only the explicitly selected active channel on the dashboard", () => {
    const channels = [
      { id: "old", title: "Expired channel", handle: "@old", connection_state: "reconnect_required", last_synced_at: null, is_selected: true },
      { id: "candidate", title: "Unselected active", handle: "@candidate", connection_state: "active", last_synced_at: null, is_selected: false },
      { id: "current", title: "Current channel", handle: "@current", connection_state: "active", last_synced_at: null, is_selected: true },
    ];
    expect(selectActiveDashboardChannel(channels)?.id).toBe("current");
    expect(selectActiveDashboardChannel(channels.slice(0, 2))).toBeNull();
  });
});
