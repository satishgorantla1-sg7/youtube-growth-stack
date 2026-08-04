import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const youtubeReadonlyScope = "https://www.googleapis.com/auth/youtube.readonly" as const;

export const createYoutubeApprovalSchema = z.object({
  workspaceId: z.string().uuid(),
}).strict();

export const decideYoutubeApprovalSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().min(1).max(500).optional(),
}).strict();

const pendingApprovalSchema = z.object({
  approvalId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  state: z.literal("pending"),
  riskSummary: z.string().min(1).max(1_000),
  scope: z.literal(youtubeReadonlyScope),
  requestedAt: z.string().datetime({ offset: true }),
});

const decidedApprovalSchema = z.object({
  approvalId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  state: z.enum(["approved", "rejected"]),
  decidedAt: z.string().datetime({ offset: true }),
});

export type YoutubeApprovalErrorCode =
  | "authentication_required"
  | "youtube_approval_forbidden"
  | "approval_not_pending"
  | "youtube_approval_unavailable";

export class YoutubeApprovalError extends Error {
  constructor(readonly code: YoutubeApprovalErrorCode) {
    super(code);
    this.name = "YoutubeApprovalError";
  }
}

type RpcResult = Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
type YoutubeApprovalClient = {
  auth: { getUser: () => Promise<{ data: { user: unknown | null }; error: unknown | null }> };
  rpc: (name: string, args: Record<string, unknown>) => RpcResult;
};

function mapRpcError(error: { message?: string; code?: string }): YoutubeApprovalError {
  const message = error.message ?? "";
  if (message.includes("authentication_required")) return new YoutubeApprovalError("authentication_required");
  if (message.includes("youtube_approval_forbidden") || error.code === "42501") {
    return new YoutubeApprovalError("youtube_approval_forbidden");
  }
  if (message.includes("approval_not_pending")) return new YoutubeApprovalError("approval_not_pending");
  return new YoutubeApprovalError("youtube_approval_unavailable");
}

export async function authorizeYoutubeApprovalRequest(): Promise<YoutubeApprovalClient> {
  let client: YoutubeApprovalClient;
  try {
    client = await createClient() as unknown as YoutubeApprovalClient;
  } catch {
    throw new YoutubeApprovalError("youtube_approval_unavailable");
  }
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new YoutubeApprovalError("authentication_required");
  return client;
}

export async function createYoutubeConnectionApproval(client: YoutubeApprovalClient, workspaceId: string) {
  const { data, error } = await client.rpc("create_youtube_connection_approval", {
    target_workspace_id: workspaceId,
  });
  if (error) throw mapRpcError(error);
  const parsed = pendingApprovalSchema.safeParse(data);
  if (!parsed.success) throw new YoutubeApprovalError("youtube_approval_unavailable");
  return parsed.data;
}

export async function decideYoutubeConnectionApproval(
  client: YoutubeApprovalClient,
  approvalId: string,
  input: z.infer<typeof decideYoutubeApprovalSchema>,
) {
  const { data, error } = await client.rpc("decide_youtube_connection_approval", {
    target_approval_id: approvalId,
    approval_decision: input.decision,
    approval_note: input.note,
  });
  if (error) throw mapRpcError(error);
  const parsed = decidedApprovalSchema.safeParse(data);
  if (!parsed.success) throw new YoutubeApprovalError("youtube_approval_unavailable");
  return parsed.data;
}
