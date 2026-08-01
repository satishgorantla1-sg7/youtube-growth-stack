import { beforeEach, describe, expect, it } from "vitest";
import { consumeVoiceRateLimit, resetVoiceRateLimitsForTests } from "./access";

describe("voice request limits", () => {
  beforeEach(() => resetVoiceRateLimitsForTests());

  it("allows five realtime sessions per identity and rejects the sixth", () => {
    for (let index = 0; index < 5; index += 1) {
      expect(consumeVoiceRateLimit("workspace:user:realtime", "realtime", 1_000).allowed).toBe(true);
    }
    const blocked = consumeVoiceRateLimit("workspace:user:realtime", "realtime", 1_000);
    expect(blocked.allowed).toBe(false);
    if (!blocked.allowed) expect(blocked.retryAfter).toBe(60);
  });

  it("isolates identities and reopens the window", () => {
    for (let index = 0; index < 5; index += 1) consumeVoiceRateLimit("one", "realtime", 1_000);
    expect(consumeVoiceRateLimit("two", "realtime", 1_000).allowed).toBe(true);
    expect(consumeVoiceRateLimit("one", "realtime", 61_001).allowed).toBe(true);
  });
});
