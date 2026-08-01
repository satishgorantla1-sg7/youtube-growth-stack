import { z } from "zod";

export const researchRequestSchema = z.object({
  prompt: z.string().trim().min(3).max(2_000),
  workspaceId: z.string().uuid().optional(),
  mode: z.enum(["quick", "deep"]).default("quick"),
  sources: z.array(z.enum(["youtube", "web"])).min(1).default(["youtube", "web"]),
});

export const approvalDecisionSchema = z.object({
  approvalId: z.string().min(1),
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(1_000).optional(),
});

export type ResearchRequest = z.infer<typeof researchRequestSchema>;
