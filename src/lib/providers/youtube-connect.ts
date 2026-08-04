import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/lib/supabase/database.types";
import { GoogleYouTubeOAuthProvider, YouTubeOAuthError, type YouTubeOwnedChannel, type YouTubeTokenSet } from "./youtube-oauth";
import { VersionedTokenCipher } from "./youtube-token-crypto";

type StateResult = { workspace_id: string; user_id: string };
export type SaveYouTubeConnectionInput = {
  workspaceId: string; oauthStateHash: string; encryptedCredentials: string;
  credentialVersion: string; scopes: string[]; accessTokenExpiresAt: string; channels: YouTubeOwnedChannel[];
};

export interface YouTubeOAuthRepository {
  assertProviderEnabled(workspaceId: string): Promise<void>;
  createOAuthState(workspaceId: string, approvalId: string, stateHash: string, expiresAt: string): Promise<void>;
  consumeOAuthState(stateHash: string): Promise<{ workspaceId: string; userId: string }>;
  saveConnection(input: SaveYouTubeConnectionInput): Promise<void>;
}

export interface YouTubeProviderQuotaRepository {
  reserveOwnedChannelDiscovery(workspaceId: string, requestIdempotencyKey: string): Promise<void>;
}

type RpcCaller = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

export class SupabaseYouTubeOAuthRepository implements YouTubeOAuthRepository {
  private readonly rpc: RpcCaller;
  constructor(client: SupabaseClient<Database>) { this.rpc = client.rpc.bind(client) as unknown as RpcCaller; }

  async assertProviderEnabled(workspaceId: string) {
    const result = await this.rpc("assert_youtube_provider_enabled", { target_workspace_id: workspaceId });
    if (result.error) throw mapRepositoryError(result.error.message);
  }

  async createOAuthState(workspaceId: string, approvalId: string, stateHash: string, expiresAt: string) {
    const result = await this.rpc("create_youtube_oauth_state", {
      target_workspace_id: workspaceId, target_approval_id: approvalId,
      target_state_hash: stateHash, target_expires_at: expiresAt,
    });
    if (result.error) throw mapRepositoryError(result.error.message);
  }

  async consumeOAuthState(stateHash: string) {
    const result = await this.rpc("consume_youtube_oauth_state", { target_state_hash: stateHash });
    if (result.error) throw mapRepositoryError(result.error.message);
    const row = (Array.isArray(result.data) ? result.data[0] : result.data) as StateResult | null;
    if (!row || !z.string().uuid().safeParse(row.workspace_id).success || !z.string().uuid().safeParse(row.user_id).success) throw new Error("oauth_state_invalid");
    return { workspaceId: row.workspace_id, userId: row.user_id };
  }

  async saveConnection(input: SaveYouTubeConnectionInput) {
    const result = await this.rpc("store_youtube_connection", {
      target_workspace_id: input.workspaceId, target_state_hash: input.oauthStateHash, target_provider: "youtube",
      target_encrypted_credentials: input.encryptedCredentials, target_credential_version: input.credentialVersion,
      target_scopes: input.scopes, target_expires_at: input.accessTokenExpiresAt, target_channels: input.channels,
    });
    if (result.error) throw mapRepositoryError(result.error.message);
  }
}

export class SupabaseYouTubeProviderQuotaRepository implements YouTubeProviderQuotaRepository {
  private readonly rpc: RpcCaller;
  constructor(client: SupabaseClient<Database>) { this.rpc = client.rpc.bind(client) as unknown as RpcCaller; }
  async reserveOwnedChannelDiscovery(workspaceId: string, requestIdempotencyKey: string) {
    const result = await this.rpc("reserve_youtube_provider_quota", {
      target_workspace_id: workspaceId, target_operation: "channels.list",
      target_quota_units: 1, request_idempotency_key: requestIdempotencyKey,
    });
    if (result.error) throw mapRepositoryError(result.error.message);
  }
}

const authorizationSchema = z.object({ workspaceId: z.string().uuid(), approvalId: z.string().uuid() }).strict();
export type YouTubeConnectDependencies = {
  repository: YouTubeOAuthRepository; quotaRepository: YouTubeProviderQuotaRepository;
  provider: GoogleYouTubeOAuthProvider; cipher: VersionedTokenCipher; authenticatedUserId: string;
  now?: () => Date; randomState?: () => string;
};

export async function beginYouTubeAuthorization(body: unknown, dependencies: Pick<YouTubeConnectDependencies, "repository" | "provider" | "now" | "randomState">) {
  const parsed = authorizationSchema.safeParse(body);
  if (!parsed.success) return { ok: false as const, status: 400, error: "invalid_authorization_request" };
  const state = dependencies.randomState?.() ?? randomBytes(32).toString("base64url");
  const now = dependencies.now?.() ?? new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60_000).toISOString();
  try {
    await dependencies.repository.assertProviderEnabled(parsed.data.workspaceId);
    await dependencies.repository.createOAuthState(parsed.data.workspaceId, parsed.data.approvalId, hashState(state), expiresAt);
    return { ok: true as const, status: 200, authorizationUrl: dependencies.provider.authorizationUrl(state), expiresAt };
  } catch (error) { return repositoryFailure(error); }
}

export async function completeYouTubeAuthorization(query: URLSearchParams, dependencies: YouTubeConnectDependencies) {
  const state = query.get("state");
  if (!state || state.length < 32 || state.length > 128) return { ok: false as const, status: 400, error: "oauth_state_invalid" };
  let consumed;
  try { consumed = await dependencies.repository.consumeOAuthState(hashState(state)); }
  catch (error) { return repositoryFailure(error); }
  if (consumed.userId !== dependencies.authenticatedUserId) return { ok: false as const, status: 403, error: "oauth_state_user_mismatch" };
  if (query.get("error")) return { ok: false as const, status: 400, error: "youtube_consent_declined" };
  const code = query.get("code");
  if (!code || code.length > 2048) return { ok: false as const, status: 400, error: "oauth_code_invalid" };

  let tokens: YouTubeTokenSet | null = null;
  try {
    await dependencies.repository.assertProviderEnabled(consumed.workspaceId);
    tokens = await dependencies.provider.exchangeCode(code);
    if (!tokens.refreshToken) throw new YouTubeOAuthError("youtube_refresh_token_missing");
    await dependencies.quotaRepository.reserveOwnedChannelDiscovery(consumed.workspaceId, `yt-connect:${hashState(state)}`);
    const channels = await dependencies.provider.ownedChannels(tokens.accessToken);
    const encryptedCredentials = dependencies.cipher.encrypt({ refreshToken: tokens.refreshToken, accessToken: tokens.accessToken, accessTokenExpiresAt: tokens.accessTokenExpiresAt });
    await dependencies.repository.saveConnection({ workspaceId: consumed.workspaceId, oauthStateHash: hashState(state), encryptedCredentials, credentialVersion: dependencies.cipher.activeVersion, scopes: tokens.scopes, accessTokenExpiresAt: tokens.accessTokenExpiresAt, channels });
    return { ok: true as const, status: 200, workspaceId: consumed.workspaceId };
  } catch (error) {
    const failure = error instanceof YouTubeOAuthError
      ? { ok: false as const, status: error.retryable ? 503 : 400, error: error.code }
      : repositoryFailure(error);
    if (!tokens?.refreshToken) return failure;
    try { await dependencies.provider.revoke(tokens.refreshToken); }
    catch (cleanupError) {
      if (!(cleanupError instanceof YouTubeOAuthError) || cleanupError.code !== "youtube_token_already_invalid") {
        return { ok: false as const, status: 503, error: "youtube_authorization_cleanup_unconfirmed" };
      }
    }
    return failure;
  }
}

function hashState(state: string) { return createHash("sha256").update(state, "utf8").digest("hex"); }
function mapRepositoryError(message: string) {
  const safe = ["authentication_required", "workspace_access_denied", "approval_required", "oauth_state_invalid", "oauth_state_expired", "oauth_state_replayed", "oauth_state_workspace_mismatch", "youtube_provider_disabled", "youtube_daily_quota_exceeded", "provider_rate_limit_exceeded"];
  return new Error(safe.find((code) => message.includes(code)) ?? "youtube_connection_storage_failed");
}
function repositoryFailure(error: unknown) {
  const code = error instanceof Error ? error.message : "youtube_connection_storage_failed";
  const statuses: Record<string, number> = { authentication_required: 401, workspace_access_denied: 403, approval_required: 409, oauth_state_invalid: 400, oauth_state_expired: 400, oauth_state_replayed: 409, oauth_state_workspace_mismatch: 403, youtube_provider_disabled: 503, youtube_daily_quota_exceeded: 429, provider_rate_limit_exceeded: 429 };
  return { ok: false as const, status: statuses[code] ?? 500, error: statuses[code] ? code : "youtube_connection_storage_failed" };
}
