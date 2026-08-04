import type { ReactNode } from "react";

export function PageStateNotice({ title, children, tone = "neutral" }: { title: string; children: ReactNode; tone?: "neutral" | "error" | "info" }) {
  return (
    <section className={`panel workspace-state workspace-state-${tone}`} aria-live={tone === "error" ? "assertive" : "polite"}>
      <h2>{title}</h2>
      <div>{children}</div>
    </section>
  );
}

export function RecordList({ children }: { children: ReactNode }) {
  return <div className="workspace-record-list">{children}</div>;
}

export function RecordCard({ title, meta, children }: { title: string; meta?: ReactNode; children?: ReactNode }) {
  return (
    <article className="panel workspace-record-card">
      <div className="panel-heading"><h2>{title}</h2>{meta ? <span className="status-pill">{meta}</span> : null}</div>
      {children ? <div className="workspace-record-body">{children}</div> : null}
    </article>
  );
}

export function formatDate(value: string | null) {
  if (!value) return "Not yet";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value));
}
