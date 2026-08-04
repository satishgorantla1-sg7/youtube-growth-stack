import { z } from "zod";

export const IDEA_GENERATION_MAX = 10;
const score = z.number().finite().min(0).max(100);
const reason = z.string().trim().min(3).max(500);

export const generatedIdeaSchema = z.object({
  title: z.string().trim().min(3).max(160),
  premise: z.string().trim().min(10).max(2_000),
  demandScore: score, demandReason: reason,
  relevanceScore: score, relevanceReason: reason,
  competitionScore: score, competitionReason: reason,
  confidenceScore: score, confidenceReason: reason,
  evidenceSourceIds: z.array(z.string().uuid()).min(1).max(10),
}).strict();

export const generatedIdeasSchema = z.array(generatedIdeaSchema).min(1).max(IDEA_GENERATION_MAX);
export type GeneratedIdea = z.infer<typeof generatedIdeaSchema>;
export type IdeaEvidence = { id: string; title: string | null; content: string | null; url: string };
export type IdeaGenerationRequest = {
  generationRunId: string; workspaceId: string; researchRunId: string;
  maxIdeas: number; evidence: IdeaEvidence[];
};
export interface IdeaGenerationProvider { generate(input: IdeaGenerationRequest, signal: AbortSignal): Promise<unknown> }
export interface IdeaGenerationRepository {
  persist(generationRunId: string, ideas: GeneratedIdea[]): Promise<void>;
  fail(generationRunId: string, errorCode: string): Promise<void>;
}
export class IdeaGenerationError extends Error {
  constructor(readonly code: "invalid_generation_request" | "invalid_ai_output" | "invalid_evidence" | "generation_timeout" | "generation_failed") { super(code) }
}

export async function generateEvidenceGroundedIdeas(
  provider: IdeaGenerationProvider, repository: IdeaGenerationRepository,
  input: IdeaGenerationRequest, timeoutMs = 30_000,
): Promise<GeneratedIdea[]> {
  const request = z.object({
    generationRunId: z.string().uuid(), workspaceId: z.string().uuid(), researchRunId: z.string().uuid(),
    maxIdeas: z.number().int().min(1).max(IDEA_GENERATION_MAX),
    evidence: z.array(z.object({ id: z.string().uuid(), title: z.string().nullable(), content: z.string().nullable(), url: z.string().url() }).strict()).min(1).max(25),
  }).strict().safeParse(input);
  if (!request.success || timeoutMs < 100 || timeoutMs > 60_000) throw new IdeaGenerationError("invalid_generation_request");

  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new IdeaGenerationError("generation_timeout"));
    }, timeoutMs);
  });
  try {
    const raw = await Promise.race([provider.generate(request.data, controller.signal), timeout]);
    const parsed = generatedIdeasSchema.safeParse(raw);
    if (!parsed.success || parsed.data.length > request.data.maxIdeas) throw new IdeaGenerationError("invalid_ai_output");
    const allowed = new Set(request.data.evidence.map(({ id }) => id));
    if (parsed.data.some((idea) => new Set(idea.evidenceSourceIds).size !== idea.evidenceSourceIds.length
      || idea.evidenceSourceIds.some((id) => !allowed.has(id)))) throw new IdeaGenerationError("invalid_evidence");
    await repository.persist(request.data.generationRunId, parsed.data);
    return parsed.data;
  } catch (error) {
    const normalized = error instanceof IdeaGenerationError ? error
      : controller.signal.aborted ? new IdeaGenerationError("generation_timeout") : new IdeaGenerationError("generation_failed");
    await repository.fail(request.data.generationRunId, normalized.code).catch(() => undefined);
    throw normalized;
  } finally {
    clearTimeout(timer!);
  }
}
