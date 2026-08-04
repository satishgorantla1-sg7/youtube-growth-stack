import type { ResearchRequest } from "@/lib/schemas";
import type { ResearchPlan } from "./contracts";

export function createResearchPlan(input: ResearchRequest): ResearchPlan {
  const defaultLimit = input.mode === "deep" ? 25 : 10;
  const maxSources = Math.min(input.maxSources ?? defaultLimit, 25);
  const batches = Math.ceil(maxSources / 5);
  const modeMultiplier = input.mode === "deep" ? 2 : 1;
  const estimatedCredits = Math.min(100, batches * input.sources.length * modeMultiplier);
  return { prompt: input.prompt, mode: input.mode, sources: input.sources, maxSources, estimatedCredits };
}

export function researchCreditsForUnits(units: number, mode: ResearchPlan["mode"]): number {
  const boundedUnits = Math.min(Math.max(Math.trunc(units), 0), 25);
  if (boundedUnits === 0) return 0;
  return Math.ceil(boundedUnits / 5) * (mode === "deep" ? 2 : 1);
}
