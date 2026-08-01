import { afterEach, describe, expect, it } from "vitest";
import { serverEnv } from "./env";

const originalRealtimeModel = process.env.OPENAI_REALTIME_MODEL;

describe("server voice environment", () => {
  afterEach(() => {
    if (originalRealtimeModel === undefined) delete process.env.OPENAI_REALTIME_MODEL;
    else process.env.OPENAI_REALTIME_MODEL = originalRealtimeModel;
  });

  it("uses the supported GA Realtime model alias by default", () => {
    delete process.env.OPENAI_REALTIME_MODEL;
    expect(serverEnv().OPENAI_REALTIME_MODEL).toBe("gpt-realtime");
  });
});
