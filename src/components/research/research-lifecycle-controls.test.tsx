import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResearchLifecycleControls } from "./research-lifecycle-controls";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const runId = "550e8400-e29b-41d4-a716-446655440000";

describe("ResearchLifecycleControls", () => {
  it("creates only a pending retry approval after explicit confirmation", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000001" });
    const navigate = vi.fn();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ approvalId: "550e8400-e29b-41d4-a716-446655440001", state: "awaiting_approval", created: true }), { status: 201 }));
    render(<ResearchLifecycleControls runId={runId} state="failed" canManage navigate={navigate} />);
    fireEvent.click(screen.getByRole("button", { name: "Request retry approval" }));
    expect(screen.getByRole("button", { name: "Create pending approval" })).toBeDisabled();
    expect(screen.getByText(/does not queue research, reserve credits, or call a provider/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Create pending approval" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({ idempotencyKey: "research-retry-00000000-0000-4000-8000-000000000001" });
    expect(navigate).toHaveBeenCalledWith("/approvals?research_retry=pending&approval=550e8400-e29b-41d4-a716-446655440001");
  });

  it("reuses the idempotency key when a retry response is lost", async () => {
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000009" });
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "unavailable" }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ approvalId: "approval-9", state: "awaiting_approval" }), { status: 200 }));
    render(<ResearchLifecycleControls runId={runId} state="failed" canManage navigate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Request retry approval" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Create pending approval" }));
    await screen.findByRole("status");
    fireEvent.click(screen.getByRole("button", { name: "Create pending approval" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const first = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    const second = JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body));
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
  });

  it("requires explicit cancellation confirmation and reports in-flight stopping truthfully", async () => {
    const refresh = vi.fn();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ state: "cancelling" }), { status: 200 }));
    render(<ResearchLifecycleControls runId={runId} state="running" canManage refresh={refresh} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel run" }));
    expect(screen.getByRole("button", { name: "Confirm cancellation" })).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox", { name: /reason/i }), { target: { value: "No longer needed" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Confirm cancellation" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).toEqual({ note: "No longer needed" });
    expect(await screen.findByRole("status")).toHaveTextContent(/stopping before another paid provider call/i);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("disables lifecycle mutations for non-managers", () => {
    render(<ResearchLifecycleControls runId={runId} state="queued" canManage={false} />);
    expect(screen.getByRole("button", { name: "Cancel run" })).toBeDisabled();
    expect(screen.getByText(/only a workspace owner or admin/i)).toBeInTheDocument();
  });
});
