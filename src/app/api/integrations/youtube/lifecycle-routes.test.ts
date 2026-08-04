import { describe, expect, it } from "vitest";
import { POST as selectChannel } from "./channels/select/route";
import { POST as requestSync } from "./sync/route";
import { POST as disconnect } from "./disconnect/route";

describe("YouTube lifecycle route boundaries", () => {
  it.each([
    ["selection", selectChannel, "/api/integrations/youtube/channels/select"],
    ["sync", requestSync, "/api/integrations/youtube/sync"],
    ["disconnect", disconnect, "/api/integrations/youtube/disconnect"],
  ] as const)("requires JSON for %s before authentication", async (_label, handler, path) => {
    const response = await handler(new Request(`https://app.example${path}`, { method: "POST", body: "opaque" }));
    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toEqual({ error: "json_required" });
  });
});
