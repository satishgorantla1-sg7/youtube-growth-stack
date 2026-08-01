import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as decideApproval } from "./route";
import { POST as createResearch } from "../research/route";

function jsonRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function createDemoApproval() {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");

  const response = await createResearch(jsonRequest("/api/research", {
    prompt: "Find three durable YouTube ideas about AI productivity",
    mode: "quick",
    sources: ["youtube", "web"],
    maxSources: 10,
    idempotencyKey: `approval-route-${crypto.randomUUID()}`,
  }));

  expect(response.status).toBe(201);
  return response.json() as Promise<{ approvalId: string; runId: string; state: string }>;
}

describe("POST /api/approvals", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("queues a demo research run only after explicit approval", async () => {
    const run = await createDemoApproval();
    expect(run.state).toBe("awaiting_approval");

    const response = await decideApproval(jsonRequest("/api/approvals", {
      approvalId: run.approvalId,
      decision: "approved",
    }));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      approvalId: run.approvalId,
      runId: run.runId,
      state: "queued",
    });
    expect(result.jobId).toEqual(expect.any(String));
  });

  it("cancels a rejected demo run without creating a job", async () => {
    const run = await createDemoApproval();

    const response = await decideApproval(jsonRequest("/api/approvals", {
      approvalId: run.approvalId,
      decision: "rejected",
      note: "The proposed scope is too broad.",
    }));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result).toMatchObject({
      approvalId: run.approvalId,
      runId: run.runId,
      state: "cancelled",
    });
    expect(result).not.toHaveProperty("jobId");
  });

  it("does not allow the same approval to be decided twice", async () => {
    const run = await createDemoApproval();
    const request = () => jsonRequest("/api/approvals", {
      approvalId: run.approvalId,
      decision: "approved",
    });

    expect((await decideApproval(request())).status).toBe(200);
    const replay = await decideApproval(request());

    expect(replay.status).toBe(409);
    await expect(replay.json()).resolves.toEqual({ error: "approval_not_pending" });
  });
});
