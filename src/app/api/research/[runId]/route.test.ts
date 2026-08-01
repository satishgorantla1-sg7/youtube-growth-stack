import { afterEach, describe, expect, it, vi } from "vitest";
import type { ResearchSource } from "@/lib/providers/types";
import { researchJobRepository } from "@/lib/research/repository";
import { runWorkerOnce } from "@/lib/research/worker";
import { GET } from "./route";

describe("GET /api/research/[runId]", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("returns completed deterministic evidence in credential-free demo mode", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", "true");
    const repository = researchJobRepository();
    const run = await repository.createOrGet({
      prompt: "Find gaps in AI productivity",
      mode: "quick",
      sources: ["youtube", "web"],
      maxSources: 10,
      idempotencyKey: `status-route-${crypto.randomUUID()}`,
    });
    await repository.decideApproval({ approvalId: run.approvalId, decision: "approved" });
    const evidence: ResearchSource[] = [{
      provider: "demo",
      type: "web",
      title: "Demo evidence",
      url: "https://example.com/demo-evidence",
      text: "Bounded deterministic evidence",
      capturedAt: new Date().toISOString(),
      provenance: { adapter: "test" },
    }];
    await runWorkerOnce(repository, "test-worker", async () => evidence);

    const response = await GET(new Request(`http://localhost/api/research/${run.id}`), {
      params: Promise.resolve({ runId: run.id }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      runId: run.id,
      state: "completed",
      sources: [{ provider: "demo", title: "Demo evidence", url: "https://example.com/demo-evidence" }],
    });
  });
});
