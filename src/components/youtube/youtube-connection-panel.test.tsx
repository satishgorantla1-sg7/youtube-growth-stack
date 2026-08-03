import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { YouTubeConnectionPanel } from "./youtube-connection-panel";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const workspaceId = "00000000-0000-4000-8000-000000000001";
const channelId = "00000000-0000-4000-8000-000000000002";
const approvalId = "00000000-0000-4000-8000-000000000003";

describe("YouTubeConnectionPanel", () => {
  it("never invents a connection or enables a demo connection", () => {
    render(<YouTubeConnectionPanel status="not_connected" />);
    expect(screen.getByRole("heading", { name: "No YouTube channel connected" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review connection scope" })).toBeDisabled();
    expect(screen.getByText(/sign in to a configured workspace/i)).toBeInTheDocument();
  });

  it("requires scope confirmation then creates, approves, and authorizes in order", async () => {
    const navigate = vi.fn();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ approvalId, workspaceId, state: "pending" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ approvalId, workspaceId, state: "approved" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth", expiresAt: "2026-08-02T00:05:00Z" }), { status: 200 }));
    render(<YouTubeConnectionPanel status="not_connected" workspaceId={workspaceId} navigate={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "Review connection scope" }));
    expect(screen.getByRole("button", { name: "Approve and continue" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /understand the scope/i }));
    fireEvent.click(screen.getByRole("button", { name: "Approve and continue" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/integrations/youtube/approval",
      `/api/integrations/youtube/approval/${approvalId}`,
      "/api/integrations/youtube/authorize",
    ]);
    expect(navigate).toHaveBeenCalledWith("https://accounts.google.com/o/oauth2/v2/auth");
  });

  it("uses an existing approved action without creating another approval", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ error: "approval_required" }), { status: 409 }));
    render(<YouTubeConnectionPanel status="not_connected" workspaceId={workspaceId} authorization={{ workspaceId, approvalId }} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("status")).toHaveTextContent(/could not start/i);
  });

  it("selects one owned or Brand channel through the secure endpoint", async () => {
    const refresh = vi.fn();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ workspaceId, channelId, externalId: "UC123", selected: true }), { status: 200 }));
    render(<YouTubeConnectionPanel status="select_channel" workspaceId={workspaceId} refresh={refresh} candidates={[
      { id: channelId, title: "Primary", handle: "@primary" },
      { id: "00000000-0000-4000-8000-000000000009", title: "Brand studio", handle: null },
    ]} />);
    expect(screen.getByRole("button", { name: "Use selected channel" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: /primary/i }));
    fireEvent.click(screen.getByRole("button", { name: "Use selected channel" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/integrations/youtube/channels/select");
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("queues a bounded selected-channel sync", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: crypto.randomUUID(), created: true }), { status: 202 }));
    render(<YouTubeConnectionPanel status="connected" workspaceId={workspaceId} channels={[{ id: channelId, title: "Studio", handle: "@studio", lastSyncedAt: null, status: "connected" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Sync now" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/integrations/youtube/sync");
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(body).toMatchObject({ workspaceId, channelId, maxPages: 5, maxItems: 250 });
    expect(body.idempotencyKey).toEqual(expect.any(String));
    expect(await screen.findByRole("status")).toHaveTextContent(/sync was queued/i);
  });

  it("requires a separate revocation approval and retains imported data", async () => {
    const refresh = vi.fn();
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ approvalId, workspaceId, state: "pending" }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ approvalId, workspaceId, state: "approved" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: "revoked" }), { status: 200 }));
    render(<YouTubeConnectionPanel status="connected" workspaceId={workspaceId} refresh={refresh} channels={[{ id: channelId, title: "Studio", handle: "@studio", lastSyncedAt: "2026-08-01T12:00:00Z", status: "connected" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Disconnect Google" }));
    expect(screen.getByRole("button", { name: "Approve and disconnect" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: /separate revocation action/i }));
    fireEvent.click(screen.getByRole("button", { name: "Approve and disconnect" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "/api/integrations/youtube/revocation-approval",
      `/api/integrations/youtube/approval/${approvalId}`,
      "/api/integrations/youtube/disconnect",
    ]);
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /deletion approval unavailable/i })).toBeDisabled();
    expect(screen.getByText(/imported data was retained/i)).toBeInTheDocument();
  });

  it.each(["configuration_required", "refreshing", "revoked", "quota_limited", "error"] as const)("renders %s truthfully", (status) => {
    render(<YouTubeConnectionPanel status={status} />);
    expect(screen.getAllByRole("heading", { level: 2 }).length).toBeGreaterThan(0);
  });
});
