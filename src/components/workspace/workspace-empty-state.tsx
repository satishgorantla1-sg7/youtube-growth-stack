import { ReactNode } from "react";

type WorkspaceEmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
  status?: "empty" | "unavailable" | "error";
};

export function WorkspaceEmptyState({ title, description, action, status = "empty" }: WorkspaceEmptyStateProps) {
  return (
    <section className={`workspace-empty-state empty-${status}`} role={status === "error" ? "alert" : "status"}>
      <strong>{title}</strong>
      <p>{description}</p>
      {action ? <div className="workspace-empty-action">{action}</div> : null}
    </section>
  );
}
