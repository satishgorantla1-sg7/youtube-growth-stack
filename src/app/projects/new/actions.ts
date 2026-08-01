"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { ensureWorkspace } from "@/lib/auth/workspace";
import { hasSupabaseConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

const projectSchema = z.object({
  name: z.string().trim().min(1).max(100),
  niche: z.string().trim().max(160).optional(),
});

export async function createProject(formData: FormData) {
  if (!hasSupabaseConfig()) redirect("/projects/new?error=demo");
  const parsed = projectSchema.safeParse({ name: formData.get("name"), niche: formData.get("niche") || undefined });
  if (!parsed.success) redirect("/projects/new?error=invalid");
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/auth/sign-in?next=%2Fprojects%2Fnew");
  const membership = await ensureWorkspace(client);
  if (!membership.workspaceId) redirect("/onboarding");
  const member = await client.from("workspace_members").select("role").eq("workspace_id", membership.workspaceId).eq("user_id", user.id).single();
  if (!member.data || !["owner", "admin", "editor"].includes(member.data.role)) redirect("/projects/new?error=forbidden");
  const created = await client.from("projects").insert({
    workspace_id: membership.workspaceId,
    name: parsed.data.name,
    niche: parsed.data.niche ?? null,
    created_by: user.id,
  });
  if (created.error) redirect("/projects/new?error=save");
  redirect("/projects/new?created=1");
}
