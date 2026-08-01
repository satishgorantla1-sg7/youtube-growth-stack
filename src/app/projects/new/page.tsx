import { WorkspaceShell } from "@/components/workspace";
import { PageStateNotice, RecordCard, RecordList, formatDate } from "@/app/_components/workspace-page";
import { loadProjectsPage } from "@/lib/dashboard/loaders";
import { getWorkspacePageSession } from "@/lib/dashboard/server";
import { createProject } from "./actions";

export const metadata = { title: "New project · YouTube Growth Stack" };
export const dynamic = "force-dynamic";

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ created?: string; error?: string }> }) {
  const params = await searchParams;
  const session = await getWorkspacePageSession("/projects/new");
  const state = session.source && session.workspaceId ? await loadProjectsPage(session.source, session.workspaceId) : { kind: "empty", data: [] } as const;
  const canCreate = session.mode === "connected" && ["owner", "admin", "editor"].includes(session.role);
  return <WorkspaceShell activePath="/projects/new" title="Projects" description="Create a workspace-owned project to organize research and ideas." displayName={session.displayName} workspaceName={session.workspaceName} signOutAction={session.signOutAction} navigationCounts={session.navigationCounts} mode={session.mode}>
    {params.created ? <PageStateNotice title="Project created" tone="info"><p>The project is now available to this workspace.</p></PageStateNotice> : null}
    {params.error ? <PageStateNotice title="Project was not created" tone="error"><p>{params.error === "forbidden" ? "Your workspace role cannot create projects." : params.error === "demo" ? "Project creation is unavailable in demo mode." : "Review the form and try again."}</p></PageStateNotice> : null}
    {canCreate ? <section className="panel"><h2>Create project</h2><form action={createProject} className="auth-form"><label>Project name<input name="name" required maxLength={100} /></label><label>Niche or audience<input name="niche" maxLength={160} /></label><button type="submit" className="auth-submit">Create project</button></form></section> : <PageStateNotice title="Project creation unavailable"><p>{session.mode === "demo" ? "Connect Supabase to create tenant projects." : "An owner, admin, or editor role is required."}</p></PageStateNotice>}
    {state.kind === "error" ? <PageStateNotice title="Projects are unavailable" tone="error"><p>We could not load workspace projects.</p></PageStateNotice> : null}
    {state.kind === "empty" && session.mode === "connected" ? <PageStateNotice title="No projects yet"><p>Create the first project using the form above.</p></PageStateNotice> : null}
    {state.kind === "ready" ? <RecordList>{state.data.map((project) => <RecordCard key={project.id} title={project.name} meta={project.status}><p>{project.niche ?? "No niche recorded"}</p><p>Created {formatDate(project.created_at)}</p></RecordCard>)}</RecordList> : null}
  </WorkspaceShell>;
}
