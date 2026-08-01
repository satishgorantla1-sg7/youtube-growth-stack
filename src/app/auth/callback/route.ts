import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureWorkspace } from "@/lib/auth/workspace";
import { workspaceSchema } from "@/lib/auth/validation";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/auth/sign-in?error=missing-code", request.url));

  const supabase = await createClient();
  const exchanged = await supabase.auth.exchangeCodeForSession(code);
  if (exchanged.error) return NextResponse.redirect(new URL("/auth/sign-in?error=invalid-code", request.url));

  const metadata = exchanged.data.user.user_metadata as Record<string, unknown>;
  const workspace = workspaceSchema.safeParse({
    workspaceName: metadata.pending_workspace_name,
    workspaceSlug: metadata.pending_workspace_slug,
  });
  const ensured = await ensureWorkspace(supabase, workspace.success ? workspace.data : undefined);
  if (!ensured.workspaceId) return NextResponse.redirect(new URL("/onboarding?error=workspace", request.url));

  return NextResponse.redirect(new URL("/onboarding?stage=channel", request.url));
}
