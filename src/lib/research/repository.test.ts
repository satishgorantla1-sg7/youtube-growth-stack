import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ hasSupabaseConfig: vi.fn() }));

import { hasSupabaseConfig } from "@/lib/env";
import { MemoryResearchJobRepository } from "./memory-repository";
import { researchJobRepository } from "./repository";
import { SupabaseResearchJobRepository } from "./supabase-repository";

const mockedHasSupabaseConfig = vi.mocked(hasSupabaseConfig);

describe("researchJobRepository", () => {
  beforeEach(() => mockedHasSupabaseConfig.mockReset());

  it("uses durable Supabase storage whenever Supabase is configured", () => {
    mockedHasSupabaseConfig.mockReturnValue(true);

    expect(researchJobRepository()).toBeInstanceOf(SupabaseResearchJobRepository);
  });

  it("keeps the credential-free memory repository as a stable fallback", () => {
    mockedHasSupabaseConfig.mockReturnValue(false);

    const first = researchJobRepository();
    const second = researchJobRepository();

    expect(first).toBeInstanceOf(MemoryResearchJobRepository);
    expect(second).toBe(first);
  });
});
