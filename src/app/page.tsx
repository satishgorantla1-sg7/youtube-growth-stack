import { GrowthWorkspace, type GrowthWorkspaceDashboard } from "@/components/growth-workspace";
import { isDataError, type ResearchSourceRow } from "@/lib/dashboard/contracts";
import { getWorkspacePageSession } from "@/lib/dashboard/server";
import { researchReadiness } from "@/lib/research/orchestrator";

export default async function Home() {
  const session = await getWorkspacePageSession("/");
  const readiness = researchReadiness();
  if (!session.source || !session.workspaceId) {
    return <GrowthWorkspace displayName={session.displayName} workspaceName={session.workspaceName} signOutAction={session.signOutAction} mode="demo" dashboard={{ channel: null, ideas: [], approvals: [], activity: null }} readiness={{ status: "ready", label: "Demo mode ready" }} />;
  }

  const [channels, ideas, approvals, usageRows, workspace, runs, packages] = await Promise.all([
    session.source.channels(session.workspaceId),
    session.source.ideas(session.workspaceId),
    session.source.approvals(session.workspaceId),
    session.source.usage(session.workspaceId),
    session.source.workspace(session.workspaceId),
    session.source.researchRuns(session.workspaceId),
    session.source.packages(session.workspaceId),
  ]);
  const successfulRuns = isDataError(runs) ? [] : runs.data.filter((run) => run.state === "completed");
  const sources = successfulRuns.length
    ? await session.source.researchSources(session.workspaceId, successfulRuns.map((run) => run.id))
    : { data: [] as ResearchSourceRow[], error: null };

  let dashboard: GrowthWorkspaceDashboard | null = null;
  if (!isDataError(channels) && !isDataError(ideas) && !isDataError(approvals) && !isDataError(packages) && !isDataError(sources)) {
    dashboard = {
      channel: channels.data[0] ? { name: channels.data[0].title, status: channels.data[0].connection_state === "connected" ? "connected" : "needs_attention" } : null,
      ideas: ideas.data.slice(0, 3).map((idea) => ({ id: idea.id, title: idea.title, score: idea.score, signal: null })),
      approvals: approvals.data.filter((approval) => approval.state === "pending").slice(0, 3).map((approval) => ({
        id: approval.id,
        title: approval.entity_type === "research_plan" ? "Research plan" : approval.entity_type === "content_package" ? "Content package" : "Workspace approval",
        kind: approval.entity_type === "research_plan" ? "research" : approval.entity_type === "content_package" ? "content_package" : "other",
        summary: approval.risk_summary,
      })),
      activity: { sourcesAnalysed: sources.data.length, packagesGenerated: packages.data.length, bestSignal: null },
    };
  }
  const usage = isDataError(usageRows) || isDataError(workspace) ? null : {
    usedCredits: usageRows.data.reduce((total, entry) => total + entry.credits, 0),
    creditLimit: workspace.data.daily_credit_limit,
  };

  return <GrowthWorkspace
    displayName={session.displayName}
    workspaceName={session.workspaceName}
    workspaceId={session.workspaceId}
    signOutAction={session.signOutAction}
    dashboard={dashboard}
    usage={usage}
    navigationCounts={session.navigationCounts}
    mode="connected"
    readiness={readiness.ready ? { status: "ready", label: "Research providers ready" } : { status: "configuration_required", label: `Setup required: ${readiness.missing.join(", ")}` }}
  />;
}
