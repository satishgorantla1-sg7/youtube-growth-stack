import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { YouTubeConnectionPanel } from "./youtube-connection-panel";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
describe("YouTubeConnectionPanel", () => {
  it("never invents a connection or enables a demo connection", () => { render(<YouTubeConnectionPanel status="not_connected" />); expect(screen.getByRole("heading", { name: "No YouTube channel connected" })).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Review connection scope" })).toBeDisabled(); expect(screen.getByText(/sign in to a configured workspace/i)).toBeInTheDocument(); });
  it("requires scope confirmation then creates, approves, and authorizes in order", async () => {
    const navigate = vi.fn();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ approvalId: "approval-1", workspaceId: "workspace-1", state: "pending" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ approvalId: "approval-1", workspaceId: "workspace-1", state: "approved" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth", expiresAt: "2026-08-02T00:05:00Z" }), { status: 200 }));
    render(<YouTubeConnectionPanel status="not_connected" workspaceId="workspace-1" navigate={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "Review connection scope" }));
    expect(screen.getByRole("button", { name: "Approve and continue" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /understand the scope/i }));
    fireEvent.click(screen.getByRole("button", { name: "Approve and continue" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(["/api/integrations/youtube/approval", "/api/integrations/youtube/approval/approval-1", "/api/integrations/youtube/authorize"]);
    expect(navigate).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/v2/auth");
  });
  it("uses an existing approved action without creating another approval", async () => { const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "approval_required" }), { status: 409 })); render(<YouTubeConnectionPanel status="not_connected" workspaceId="workspace-1" authorization={{ workspaceId: "workspace-1", approvalId: "approval-1" }} />); fireEvent.click(screen.getByRole("button", { name: "Continue with Google" })); await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1)); expect(await screen.findByRole("alert")).toHaveTextContent(/could not start/i); });
  it("shows owned channels without enabling a missing selection endpoint", () => { render(<YouTubeConnectionPanel status="select_channel" candidates={[{ id: "a", title: "Primary", handle: "@primary" }, { id: "b", title: "Brand studio", handle: null }]} />); expect(screen.getByRole("group", { name: "Select one channel" })).toBeDisabled(); expect(screen.getByText("Brand studio")).toBeInTheDocument(); expect(screen.getByText(/secure channel-selection endpoint/i)).toBeInTheDocument(); });
  it("separates disconnect from imported-data deletion", () => { render(<YouTubeConnectionPanel status="connected" channels={[{ id: "a", title: "Studio", handle: "@studio", lastSyncedAt: "2026-08-01T12:00:00Z", status: "connected" }]} />); expect(screen.getByRole("button", { name: /disconnect unavailable/i })).toBeDisabled(); expect(screen.getByRole("heading", { name: /delete imported youtube data/i })).toBeInTheDocument(); expect(screen.getByRole("button", { name: /deletion approval unavailable/i })).toBeDisabled(); });
  it.each(["configuration_required", "refreshing", "revoked", "quota_limited", "error"] as const)("renders %s truthfully", (status) => { render(<YouTubeConnectionPanel status={status} />); expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThan(0); });
});
