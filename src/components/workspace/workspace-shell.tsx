"use client";

import {
  BarChart3,
  CircleUserRound,
  Compass,
  FileText,
  Home,
  Lightbulb,
  LogOut,
  Menu,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
  Youtube,
} from "lucide-react";
import Link from "next/link";
import { ReactNode, useEffect, useId, useState } from "react";

export type WorkspacePath =
  | "/"
  | "/research"
  | "/ideas"
  | "/packages"
  | "/approvals"
  | "/performance"
  | "/projects/new"
  | "/usage"
  | "/settings";

export type WorkspaceNavigationCounts = Partial<Record<"research" | "ideas" | "packages" | "approvals", number>>;

export type WorkspaceUsageSummary = {
  usedCredits: number;
  creditLimit: number;
};

export type WorkspaceReadiness = {
  status: "ready" | "configuration_required" | "unavailable";
  label: string;
};

export type WorkspaceShellProps = {
  activePath: WorkspacePath;
  title: string;
  description?: string;
  displayName?: string;
  workspaceName?: string;
  signOutAction?: () => Promise<void>;
  navigationCounts?: WorkspaceNavigationCounts;
  usage?: WorkspaceUsageSummary | null;
  readiness?: WorkspaceReadiness;
  mode?: "demo" | "connected";
  children: ReactNode;
};

const navigation = [
  { href: "/" as const, icon: Home, label: "Command centre" },
  { href: "/research" as const, icon: Compass, label: "Research", countKey: "research" as const },
  { href: "/ideas" as const, icon: Lightbulb, label: "Idea library", countKey: "ideas" as const },
  { href: "/packages" as const, icon: FileText, label: "Content packages", countKey: "packages" as const },
  { href: "/approvals" as const, icon: ShieldCheck, label: "Approvals", countKey: "approvals" as const },
  { href: "/performance" as const, icon: BarChart3, label: "Performance" },
];

function displayCount(count: number | undefined) {
  return typeof count === "number" && count > 0 ? count : null;
}

export function WorkspaceShell({
  activePath,
  title,
  description,
  displayName = "Creator",
  workspaceName = "Creator workspace",
  signOutAction,
  navigationCounts,
  usage = null,
  readiness,
  mode = "connected",
  children,
}: WorkspaceShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navigationId = useId();
  const resolvedReadiness = readiness ?? (mode === "demo" ? { status: "ready" as const, label: "Demo mode ready" } : { status: "unavailable" as const, label: "Status unavailable" });
  const safeLimit = usage && usage.creditLimit > 0 ? usage.creditLimit : 0;
  const usagePercent = safeLimit ? Math.min(100, Math.max(0, (usage!.usedCredits / safeLimit) * 100)) : 0;

  useEffect(() => {
    if (!mobileNavOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileNavOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [mobileNavOpen]);

  const closeMobileNav = () => setMobileNavOpen(false);

  return (
    <main className="app-shell">
      <aside id={navigationId} className={mobileNavOpen ? "sidebar sidebar-open" : "sidebar"} aria-label="Workspace navigation panel">
        <div className="brand">
          <span className="brand-mark"><Youtube size={22} fill="currentColor" /></span>
          <span>Growth Stack</span>
          <button className="mobile-nav-close" type="button" onClick={closeMobileNav} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <Link className="new-project" href="/projects/new" onClick={closeMobileNav}><Plus size={17} /> New project</Link>
        <nav className="main-nav" aria-label="Workspace">
          {navigation.map((item) => {
            const count = item.countKey ? displayCount(navigationCounts?.[item.countKey]) : null;
            const active = activePath === item.href;
            return (
              <Link
                className={active ? "nav-item nav-active" : "nav-item"}
                href={item.href}
                key={item.href}
                aria-current={active ? "page" : undefined}
                onClick={closeMobileNav}
              >
                <item.icon size={18} /><span>{item.label}</span>
                {count ? <span className="nav-count" aria-label={`${count} items`}>{count}</span> : null}
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-spacer" />
        <section className="plan-card" aria-label="Workspace usage">
          <div className="plan-icon"><Sparkles size={15} /></div>
          <strong>{mode === "demo" ? "Demo workspace" : "Workspace usage"}</strong>
          {usage ? (
            <>
              <span>{usage.usedCredits} of {usage.creditLimit} credits used</span>
              <div className="progress" role="progressbar" aria-label="Credits used" aria-valuemin={0} aria-valuemax={usage.creditLimit} aria-valuenow={Math.min(usage.usedCredits, usage.creditLimit)}>
                <i style={{ width: `${usagePercent}%` }} />
              </div>
            </>
          ) : <span>Usage data is not available yet.</span>}
          <Link href="/usage" onClick={closeMobileNav}>View usage</Link>
        </section>
        <div className="profile-row">
          <CircleUserRound size={29} />
          <span><strong>{displayName}</strong><small>{workspaceName}</small></span>
          <Link className="profile-action" href="/settings" aria-label="Settings" onClick={closeMobileNav}><Settings size={16} /></Link>
          {signOutAction ? (
            <form action={signOutAction}><button className="profile-action" type="submit" aria-label="Sign out"><LogOut size={16} /></button></form>
          ) : null}
        </div>
      </aside>
      {mobileNavOpen ? <button className="mobile-nav-backdrop" type="button" onClick={closeMobileNav} aria-label="Close navigation" /> : null}

      <section className="workspace">
        <header className="topbar">
          <button
            className="mobile-menu"
            type="button"
            onClick={() => setMobileNavOpen((value) => !value)}
            aria-label="Open navigation"
            aria-expanded={mobileNavOpen}
            aria-controls={navigationId}
          ><Menu /></button>
          <div className="workspace-heading">
            <strong>{title}</strong>
            {description ? <span>{description}</span> : null}
          </div>
          <div className="top-actions">
            {mode === "demo" ? <span className="demo-badge">Demo data</span> : null}
            <span className={`status-pill status-${resolvedReadiness.status}`} role="status"><i /> {resolvedReadiness.label}</span>
          </div>
        </header>
        <div className="workspace-shell-body">{children}</div>
      </section>
    </main>
  );
}
