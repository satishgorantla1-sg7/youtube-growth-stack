import {
  ApprovalRow,
  ChannelRow,
  DashboardDataSource,
  IdeaRow,
  PackageListItem,
  PageState,
  ProjectRow,
  ResearchListItem,
  UsageRow,
  WorkspaceRow,
  isDataError,
} from "./contracts";

function state<T>(data: T, empty: boolean): PageState<T> {
  return empty ? { kind: "empty", data } : { kind: "ready", data };
}

export function selectActiveDashboardChannel(channels: ChannelRow[]): ChannelRow | null {
  return channels.find((channel) => channel.is_selected && ["active", "connected"].includes(channel.connection_state)) ?? null;
}

export async function loadResearchPage(source: DashboardDataSource, workspaceId: string): Promise<PageState<ResearchListItem[]>> {
  const runs = await source.researchRuns(workspaceId);
  if (isDataError(runs)) return { kind: "error", message: runs.error };
  const sources = await source.researchSources(workspaceId, runs.data.map((run) => run.id));
  if (isDataError(sources)) return { kind: "error", message: sources.error };
  const counts = new Map<string, number>();
  sources.data.forEach((item) => counts.set(item.research_run_id, (counts.get(item.research_run_id) ?? 0) + 1));
  const data = runs.data.map((run) => ({ ...run, sourceCount: counts.get(run.id) ?? 0 }));
  return state(data, data.length === 0);
}

export async function loadIdeasPage(source: DashboardDataSource, workspaceId: string): Promise<PageState<IdeaRow[]>> {
  const response = await source.ideas(workspaceId);
  return isDataError(response) ? { kind: "error", message: response.error } : state(response.data, response.data.length === 0);
}

export async function loadPackagesPage(source: DashboardDataSource, workspaceId: string): Promise<PageState<PackageListItem[]>> {
  const packages = await source.packages(workspaceId);
  if (isDataError(packages)) return { kind: "error", message: packages.error };
  const ideas = await source.ideasById(workspaceId, [...new Set(packages.data.map((item) => item.idea_id))]);
  if (isDataError(ideas)) return { kind: "error", message: ideas.error };
  const titles = new Map(ideas.data.map((idea) => [idea.id, idea.title]));
  const data = packages.data.map((item) => ({ ...item, ideaTitle: titles.get(item.idea_id) ?? null }));
  return state(data, data.length === 0);
}

export async function loadApprovalsPage(source: DashboardDataSource, workspaceId: string): Promise<PageState<ApprovalRow[]>> {
  const response = await source.approvals(workspaceId);
  return isDataError(response) ? { kind: "error", message: response.error } : state(response.data, response.data.length === 0);
}

export async function loadPerformancePage(source: DashboardDataSource, workspaceId: string): Promise<PageState<ChannelRow[]>> {
  const response = await source.channels(workspaceId);
  return isDataError(response) ? { kind: "error", message: response.error } : state(response.data, response.data.length === 0);
}

export async function loadProjectsPage(source: DashboardDataSource, workspaceId: string): Promise<PageState<ProjectRow[]>> {
  const response = await source.projects(workspaceId);
  return isDataError(response) ? { kind: "error", message: response.error } : state(response.data, response.data.length === 0);
}

export async function loadUsagePage(source: DashboardDataSource, workspaceId: string): Promise<PageState<{ entries: UsageRow[]; totalCredits: number }>> {
  const response = await source.usage(workspaceId);
  if (isDataError(response)) return { kind: "error", message: response.error };
  const data = { entries: response.data, totalCredits: response.data.reduce((sum, item) => sum + item.credits, 0) };
  return state(data, response.data.length === 0);
}

export async function loadSettingsPage(source: DashboardDataSource, workspaceId: string): Promise<PageState<{ workspace: WorkspaceRow; channels: ChannelRow[] }>> {
  const [workspace, channels] = await Promise.all([source.workspace(workspaceId), source.channels(workspaceId)]);
  if (isDataError(workspace)) return { kind: "error", message: workspace.error };
  if (isDataError(channels)) return { kind: "error", message: channels.error };
  return { kind: "ready", data: { workspace: workspace.data, channels: channels.data } };
}
