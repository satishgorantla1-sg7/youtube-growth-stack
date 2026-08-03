import { WorkspaceShell } from "@/components/workspace";
import { PageStateNotice } from "@/app/_components/workspace-page";
import { IdeaWorkbench } from "@/components/ideas/idea-workbench";
import { getWorkspacePageSession } from "@/lib/dashboard/server";
import { loadIdeasWorkspace } from "@/lib/ideas/explorer";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Ideas · YouTube Growth Stack" };
export const dynamic = "force-dynamic";

export default async function IdeasPage() {
  const session = await getWorkspacePageSession("/ideas");
  let workspace = { runs: [], ideas: [] } as Awaited<ReturnType<typeof loadIdeasWorkspace>>;
  let unavailable = false;
  if (session.mode === "connected" && session.workspaceId) {
    try { workspace = await loadIdeasWorkspace(await createClient(), session.workspaceId); }
    catch { unavailable = true; }
  }
  return <WorkspaceShell activePath="/ideas" title="Idea Library" description="Evidence-grounded ideas saved for this workspace." displayName={session.displayName} workspaceName={session.workspaceName} signOutAction={session.signOutAction} navigationCounts={session.navigationCounts} mode={session.mode}>
    {session.mode === "demo" ? <PageStateNotice title="Demo mode"><p>Connect Supabase and complete research to generate evidence-grounded ideas. No sample records are presented as customer data.</p></PageStateNotice> : null}
    {unavailable ? <PageStateNotice title="Ideas are unavailable" tone="error"><p>We could not load the completed research and saved ideas for this workspace. Try again shortly.</p></PageStateNotice> : null}
    {session.mode === "connected" && !unavailable ? <IdeaWorkbench runs={workspace.runs} ideas={workspace.ideas} canGenerate={["owner", "admin", "editor"].includes(session.role ?? "member")}/> : null}
  </WorkspaceShell>;
}
