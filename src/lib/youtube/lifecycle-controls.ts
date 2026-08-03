import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const selectYoutubeChannelSchema = z.object({
  workspaceId: z.string().uuid(),
  channelId: z.string().uuid(),
}).strict();

export const requestYoutubeSyncSchema = z.object({
  workspaceId: z.string().uuid(),
  channelId: z.string().uuid(),
  idempotencyKey: z.string().min(8).max(200),
  maxPages: z.number().int().min(1).max(10).default(5),
  maxItems: z.number().int().min(1).max(500).default(250),
}).strict();

export const youtubeDisconnectSchema = z.object({
  workspaceId: z.string().uuid(),
  approvalId: z.string().uuid(),
}).strict();

const selectedSchema = z.object({
  workspaceId: z.string().uuid(), channelId: z.string().uuid(),
  externalId: z.string().min(1), selected: z.literal(true),
});
const syncSchema = z.object({
  id: z.string().uuid(), workspaceId: z.string().uuid(), connectionId: z.string().uuid(),
  channelId: z.string().uuid(), state: z.enum(["queued", "running", "completed", "failed", "cancelled"]),
  maxPages: z.number().int().min(1).max(10), maxItems: z.number().int().min(1).max(500),
  correlationId: z.string().uuid(), created: z.boolean(),
});
const pendingApprovalSchema = z.object({
  approvalId: z.string().uuid(), workspaceId: z.string().uuid(), state: z.literal("pending"),
  riskSummary: z.string().min(1).max(1_000), requestedAt: z.string().datetime({ offset: true }),
});
const approvedSchema = z.object({
  approvalId: z.string().uuid(), workspaceId: z.string().uuid(), state: z.literal("approved"),
  purpose: z.literal("revoke"), decidedAt: z.string().datetime({ offset: true }),
  decidedBy: z.string().uuid(),
});

type RpcError = { message?: string; code?: string };
type LifecycleClient = {
  auth: { getUser(): Promise<{ data: { user: unknown | null }; error: unknown | null }> };
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: RpcError | null }>;
};

export type YoutubeLifecycleErrorCode =
  | "authentication_required" | "youtube_lifecycle_forbidden" | "approval_required"
  | "approval_not_pending" | "youtube_sync_disabled" | "youtube_sync_conflict"
  | "youtube_lifecycle_unavailable";

export class YoutubeLifecycleError extends Error {
  constructor(readonly code: YoutubeLifecycleErrorCode) { super(code); this.name = "YoutubeLifecycleError"; }
}

export async function authorizeYoutubeLifecycleRequest(): Promise<LifecycleClient> {
  let client: LifecycleClient;
  try { client = await createClient() as unknown as LifecycleClient; }
  catch { throw new YoutubeLifecycleError("youtube_lifecycle_unavailable"); }
  const user = await client.auth.getUser();
  if (user.error || !user.data.user) throw new YoutubeLifecycleError("authentication_required");
  return client;
}

export async function selectYoutubeChannel(client: LifecycleClient, input: z.infer<typeof selectYoutubeChannelSchema>) {
  const { data, error } = await client.rpc("select_youtube_channel", {
    target_workspace_id: input.workspaceId, target_channel_id: input.channelId,
  });
  if (error) throw mapRpcError(error);
  const parsed = selectedSchema.safeParse(data);
  if (!parsed.success) throw new YoutubeLifecycleError("youtube_lifecycle_unavailable");
  return parsed.data;
}

export async function requestYoutubeSync(client: LifecycleClient, input: z.infer<typeof requestYoutubeSyncSchema>) {
  const { data, error } = await client.rpc("request_youtube_sync", {
    target_workspace_id: input.workspaceId, target_channel_id: input.channelId,
    target_idempotency_key: input.idempotencyKey,
    target_max_pages: input.maxPages, target_max_items: input.maxItems,
  });
  if (error) throw mapRpcError(error);
  const parsed = syncSchema.safeParse(data);
  if (!parsed.success) throw new YoutubeLifecycleError("youtube_lifecycle_unavailable");
  return parsed.data;
}

export async function createYoutubeRevocationApproval(client: LifecycleClient, workspaceId: string) {
  const { data, error } = await client.rpc("create_youtube_revocation_approval", { target_workspace_id: workspaceId });
  if (error) throw mapRpcError(error);
  const parsed = pendingApprovalSchema.safeParse(data);
  if (!parsed.success) throw new YoutubeLifecycleError("youtube_lifecycle_unavailable");
  return parsed.data;
}

/** Re-validates current owner/admin membership through the authenticated RPC immediately before service-role revocation. */
export async function authorizeApprovedRevocation(client: LifecycleClient, approvalId: string) {
  const currentUser = await client.auth.getUser();
  const parsedUser = z.object({ id: z.string().uuid() }).safeParse(currentUser.data.user);
  if (currentUser.error || !parsedUser.success) {
    throw new YoutubeLifecycleError("authentication_required");
  }
  const { data, error } = await client.rpc("decide_youtube_connection_approval", {
    target_approval_id: approvalId, approval_decision: "approved", approval_note: null,
  });
  if (error) throw mapRpcError(error);
  const parsed = approvedSchema.safeParse(data);
  if (!parsed.success) throw new YoutubeLifecycleError("approval_required");
  if (parsed.data.decidedBy !== parsedUser.data.id) {
    throw new YoutubeLifecycleError("youtube_lifecycle_forbidden");
  }
  return parsed.data;
}

function mapRpcError(error: RpcError) {
  const message = error.message ?? "";
  if (message.includes("authentication_required")) return new YoutubeLifecycleError("authentication_required");
  if (message.includes("approval_required") || message.includes("approval_already_used")) return new YoutubeLifecycleError("approval_required");
  if (message.includes("approval_not_pending")) return new YoutubeLifecycleError("approval_not_pending");
  if (message.includes("youtube_sync_disabled")) return new YoutubeLifecycleError("youtube_sync_disabled");
  if (message.includes("youtube_sync_idempotency_conflict")) return new YoutubeLifecycleError("youtube_sync_conflict");
  if (error.code === "42501" || message.includes("forbidden")) return new YoutubeLifecycleError("youtube_lifecycle_forbidden");
  return new YoutubeLifecycleError("youtube_lifecycle_unavailable");
}
