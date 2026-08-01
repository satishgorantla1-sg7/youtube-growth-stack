import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type StoredYouTubeConnection = { encryptedCredentials: string; credentialVersion: string };
export type RefreshLease = StoredYouTubeConnection & { leaseToken: string; workspaceId: string };
export interface YouTubeTokenLifecycleRepository {
  acquireRefreshLease(workspaceId: string, leaseToken: string, leaseExpiresAt: string): Promise<RefreshLease | null>;
  completeRefresh(workspaceId: string, leaseToken: string, encryptedCredentials: string, credentialVersion: string, expiresAt: string): Promise<void>;
  requireReconnect(workspaceId: string, leaseToken: string, reason: string): Promise<void>;
  acquireRevocationLease(workspaceId: string, approvalId: string, leaseToken: string, leaseExpiresAt: string): Promise<RefreshLease | null>;
  completeRevocation(workspaceId: string, leaseToken: string): Promise<void>;
}
const leaseSchema = z.object({ workspace_id: z.string().uuid(), lease_token: z.string().uuid(), encrypted_credentials: z.string().min(1), credential_version: z.string().min(1) });
type RpcCaller = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

/** Construct only with a trusted server client. The RPC contract must remain service-role-only. */
export class SupabaseYouTubeTokenLifecycleRepository implements YouTubeTokenLifecycleRepository {
  private readonly rpc: RpcCaller;
  constructor(client: SupabaseClient<Database>) { this.rpc = client.rpc.bind(client) as unknown as RpcCaller; }
  acquireRefreshLease(workspaceId: string, leaseToken: string, leaseExpiresAt: string) {
    return this.acquire("lease_youtube_token_refresh", workspaceId, leaseToken, leaseExpiresAt);
  }
  acquireRevocationLease(workspaceId: string, approvalId: string, leaseToken: string, leaseExpiresAt: string) {
    return this.acquire("lease_youtube_revocation", workspaceId, leaseToken, leaseExpiresAt, approvalId);
  }
  async completeRefresh(workspaceId: string, leaseToken: string, encryptedCredentials: string, credentialVersion: string, expiresAt: string) {
    await this.call("complete_youtube_token_refresh", { target_workspace_id: workspaceId, target_lease_token: leaseToken, target_encrypted_credentials: encryptedCredentials, target_credential_version: credentialVersion, target_expires_at: expiresAt });
  }
  async requireReconnect(workspaceId: string, leaseToken: string, reason: string) {
    await this.call("mark_youtube_reconnect_required", { target_workspace_id: workspaceId, target_lease_token: leaseToken, target_reason: reason });
  }
  async completeRevocation(workspaceId: string, leaseToken: string) {
    await this.call("complete_youtube_revocation", { target_workspace_id: workspaceId, target_lease_token: leaseToken });
  }
  private async acquire(name: string, workspaceId: string, leaseToken: string, leaseExpiresAt: string, approvalId?: string) {
    const args: Record<string, unknown> = { target_workspace_id: workspaceId, target_lease_token: leaseToken, target_lease_expires_at: leaseExpiresAt };
    if (approvalId) args.target_approval_id = approvalId;
    const result = await this.call(name, args);
    const row = Array.isArray(result) ? result[0] : result;
    if (row === null) return null;
    const parsed = leaseSchema.safeParse(row);
    if (!parsed.success) throw new Error("youtube_token_lease_invalid");
    return { workspaceId: parsed.data.workspace_id, leaseToken: parsed.data.lease_token, encryptedCredentials: parsed.data.encrypted_credentials, credentialVersion: parsed.data.credential_version };
  }
  private async call(name: string, args: Record<string, unknown>) {
    const result = await this.rpc(name, args);
    if (result.error) throw new Error("youtube_token_lifecycle_storage_failed");
    return result.data;
  }
}
export function newLeaseToken() { return randomUUID(); }
