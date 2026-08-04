import "./package-workbench.css";
import { WorkspaceShell } from "@/components/workspace";
import { PageStateNotice } from "@/app/_components/workspace-page";
import { PackageWorkbench } from "@/components/packages/package-workbench";
import { getWorkspacePageSession } from "@/lib/dashboard/server";
import { loadPackagesWorkspace } from "@/lib/packages/explorer";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Packages · YouTube Growth Stack" };
export const dynamic = "force-dynamic";

export default async function PackagesPage() {
  const session = await getWorkspacePageSession("/packages");
  let workspace = { approvedIdeas: [], reviewIdeas: [], packages: [] } as Awaited<ReturnType<typeof loadPackagesWorkspace>>;
  let unavailable = false;
  if (session.mode === "connected" && session.workspaceId) {
    try { workspace = await loadPackagesWorkspace(await createClient(), session.workspaceId); }
    catch { unavailable = true; }
  }
  const canGenerate = ["owner", "admin", "editor"].includes(session.role ?? "member");
  const canDecide = ["owner", "admin"].includes(session.role ?? "member");
  return <WorkspaceShell activePath="/packages" title="Content Packages" description="Build, review, and preserve evidence-grounded package versions." displayName={session.displayName} workspaceName={session.workspaceName} signOutAction={session.signOutAction} navigationCounts={session.navigationCounts} mode={session.mode}>
    {session.mode === "demo" ? <PageStateNotice title="Demo mode"><p>Connect Supabase to generate and review saved packages. Demo mode does not invent package history.</p></PageStateNotice> : null}
    {unavailable ? <PageStateNotice title="Packages are unavailable" tone="error"><p>We could not load this workspace’s approved ideas or package history. Try again shortly.</p></PageStateNotice> : null}
    {session.mode === "connected" && !unavailable ? <PackageWorkbench approvedIdeas={workspace.approvedIdeas} reviewIdeas={workspace.reviewIdeas} packages={workspace.packages} canGenerate={canGenerate} canDecide={canDecide}/> : null}
  </WorkspaceShell>;
}
