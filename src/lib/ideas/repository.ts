import { z } from "zod";
import type { GeneratedIdea, IdeaGenerationRepository } from "./generation";

type RpcResult = { data: unknown; error: { message?: string; code?: string } | null };
export type IdeaRpcClient = { rpc(name: string, args: Record<string, unknown>): Promise<RpcResult> };
const beginResult = z.object({ id: z.string().uuid(), workspaceId: z.string().uuid(), researchRunId: z.string().uuid(), state: z.enum(["generating", "completed", "failed"]), created: z.boolean() }).strict();

export class IdeaRepositoryError extends Error {
  constructor(readonly code: "completed_research_required" | "idea_generation_forbidden" | "idea_generation_conflict" | "idea_persistence_failed") { super(code) }
}
function mapped(error: RpcResult["error"]): IdeaRepositoryError {
  const message = error?.message ?? "";
  if (message.includes("completed_research_required")) return new IdeaRepositoryError("completed_research_required");
  if (message.includes("idea_generation_forbidden")) return new IdeaRepositoryError("idea_generation_forbidden");
  if (message.includes("idempotency_conflict")) return new IdeaRepositoryError("idea_generation_conflict");
  return new IdeaRepositoryError("idea_persistence_failed");
}
export async function beginIdeaGeneration(client: IdeaRpcClient, input: {
  workspaceId: string; researchRunId: string; requestedBy: string; idempotencyKey: string;
  maxIdeas: number; modelVersion: string; promptVersion: string;
}) {
  const { data, error } = await client.rpc("begin_idea_generation", {
    target_workspace_id: input.workspaceId, target_research_run_id: input.researchRunId,
    target_requested_by: input.requestedBy, request_idempotency_key: input.idempotencyKey,
    request_max_ideas: input.maxIdeas, request_model_version: input.modelVersion,
    request_prompt_version: input.promptVersion,
  });
  if (error) throw mapped(error);
  const parsed = beginResult.safeParse(data);
  if (!parsed.success) throw new IdeaRepositoryError("idea_persistence_failed");
  return parsed.data;
}
export class SupabaseIdeaGenerationRepository implements IdeaGenerationRepository {
  constructor(private readonly client: IdeaRpcClient) {}
  async persist(generationRunId: string, ideas: GeneratedIdea[]) {
    const { error } = await this.client.rpc("persist_generated_ideas", { target_generation_run_id: generationRunId, generated_ideas: ideas });
    if (error) throw mapped(error);
  }
  async fail(generationRunId: string, errorCode: string) {
    const { error } = await this.client.rpc("fail_idea_generation", { target_generation_run_id: generationRunId, failure_code: errorCode });
    if (error) throw mapped(error);
  }
}
