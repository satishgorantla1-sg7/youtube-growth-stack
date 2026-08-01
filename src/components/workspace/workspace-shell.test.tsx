import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WorkspaceShell } from "./workspace-shell";

afterEach(cleanup);

describe("WorkspaceShell", () => {
  it("renders Link navigation and exposes the active route", () => {
    render(<WorkspaceShell activePath="/research" title="Research"><p>Research body</p></WorkspaceShell>);

    expect(screen.getByRole("link", { name: "Research" })).toHaveAttribute("href", "/research");
    expect(screen.getByRole("link", { name: "Research" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Command centre" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: /new project/i })).toHaveAttribute("href", "/projects/new");
    expect(screen.getByRole("link", { name: /view usage/i })).toHaveAttribute("href", "/usage");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
  });

  it("only displays counts and usage supplied by the caller", () => {
    const { rerender } = render(<WorkspaceShell activePath="/" title="Command centre"><p>Body</p></WorkspaceShell>);

    expect(screen.getByText("Usage data is not available yet.")).toBeInTheDocument();
    expect(screen.queryByText(/waiting/i)).not.toBeInTheDocument();

    rerender(
      <WorkspaceShell
        activePath="/"
        title="Command centre"
        navigationCounts={{ approvals: 3 }}
        usage={{ usedCredits: 2, creditLimit: 10 }}
      ><p>Body</p></WorkspaceShell>,
    );
    expect(screen.getByLabelText("3 items")).toHaveTextContent("3");
    expect(screen.getByRole("progressbar", { name: "Credits used" })).toHaveAttribute("aria-valuenow", "2");
  });

  it("opens and closes its accessible mobile navigation", () => {
    render(<WorkspaceShell activePath="/" title="Command centre"><p>Body</p></WorkspaceShell>);

    const menu = screen.getByRole("button", { name: "Open navigation" });
    expect(menu).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(menu);
    expect(menu).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getAllByRole("button", { name: "Close navigation" })[0]);
    expect(menu).toHaveAttribute("aria-expanded", "false");
  });
});
