import { hasSupabaseConfig } from "@/lib/env";
import type { ResearchJobRepository } from "./contracts";
import { MemoryResearchJobRepository } from "./memory-repository";
import { SupabaseResearchJobRepository } from "./supabase-repository";

const demoRepository = new MemoryResearchJobRepository();

export function researchJobRepository(): ResearchJobRepository {
  return hasSupabaseConfig() ? new SupabaseResearchJobRepository() : demoRepository;
}
