import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { serverEnv } from "@/lib/env";

export const youtubeWorkerStatusSchema = z.object({
  status: z.enum(["healthy", "stale", "not_seen"]),
  lastSeenAt: z.string().datetime({ offset: true }).nullable(),
}).strict();

export type YouTubeWorkerStatus = z.infer<typeof youtubeWorkerStatusSchema>;
export type YouTubeWorkerHeartbeatStatus = "starting" | "idle" | "working" | "completed" | "failed" | "stopping";
type RpcClient = { rpc(name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }> };

export class SupabaseYouTubeWorkerHeartbeatRepository {
  constructor(private readonly client: RpcClient) {}

  async record(workerInstanceId: string, status: YouTubeWorkerHeartbeatStatus): Promise<void> {
    const { error } = await this.client.rpc("record_worker_heartbeat", {
      target_worker_kind: "youtube_sync",
      target_worker_instance_id: workerInstanceId,
      target_status: status,
    });
    if (error) throw new Error("youtube_worker_heartbeat_failed");
  }

  async status(): Promise<YouTubeWorkerStatus> {
    const { data, error } = await this.client.rpc("get_youtube_worker_status");
    if (error) throw new Error("youtube_worker_status_unavailable");
    return youtubeWorkerStatusSchema.parse(data);
  }
}

export type PublicYouTubeWorkerReadiness = {
  topology: "external_long_running_worker";
  status: "configuration_required" | "healthy" | "stale" | "not_seen" | "unavailable";
};

async function within<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => { timeout = setTimeout(() => reject(new Error("youtube_worker_status_timeout")), timeoutMs); }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
export async function readProductionYouTubeWorkerReadiness(): Promise<PublicYouTubeWorkerReadiness> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = serverEnv().SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { topology: "external_long_running_worker", status: "configuration_required" };
  try {
    const client = createSupabaseClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const status = await within(new SupabaseYouTubeWorkerHeartbeatRepository(client as unknown as RpcClient).status(), 2_000);
    return { topology: "external_long_running_worker", status: status.status };
  } catch {
    return { topology: "external_long_running_worker", status: "unavailable" };
  }
}
