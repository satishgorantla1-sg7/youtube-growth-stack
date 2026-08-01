import { z } from "zod";

export const researchRequestSchema = z.object({
  prompt: z.string().trim().min(3).max(2_000),
  workspaceId: z.string().uuid().optional(),
  mode: z.enum(["quick", "deep"]).default("quick"),
  sources: z.array(z.enum(["youtube", "web"])).min(1).default(["youtube", "web"]),
  maxSources: z.number().int().min(1).max(25).optional(),
  idempotencyKey: z.string().trim().min(8).max(128),
});

export const approvalDecisionSchema = z.object({
  approvalId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(1_000).optional(),
});

export type ResearchRequest = z.infer<typeof researchRequestSchema>;
