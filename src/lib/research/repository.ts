import { hasSupabaseConfig, isDemoMode } from "@/lib/env";
import type { ResearchJobRepository } from "./contracts";
import { MemoryResearchJobRepository } from "./memory-repository";
import { SupabaseResearchJobRepository } from "./supabase-repository";

const demoRepository = new MemoryResearchJobRepository();

export function researchJobRepository(): ResearchJobRepository {
  return isDemoMode() || !hasSupabaseConfig() ? demoRepository : new SupabaseResearchJobRepository();
}
