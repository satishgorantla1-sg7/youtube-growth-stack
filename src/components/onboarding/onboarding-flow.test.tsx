import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OnboardingFlow } from "./onboarding-flow";
import type { ChannelConnectionAdapter } from "@/lib/providers/channel-connection";

afterEach(cleanup);

const connectedChannel = { id: "test", title: "Test channel", handle: "@test", subscriberLabel: "12K" };

function reachChannel(adapter: ChannelConnectionAdapter) {
  render(<OnboardingFlow connectionAdapter={adapter} />);
  fireEvent.change(screen.getByLabelText(/what should we call you/i), { target: { value: "Alex" } });
  fireEvent.change(screen.getByLabelText(/workspace name/i), { target: { value: "Alex Studio" } });
  fireEvent.click(screen.getByRole("button", { name: /continue/i }));
}

describe("OnboardingFlow", () => {
  it("requires consent before connecting and progresses through the text path", async () => {
    const connect = vi.fn().mockResolvedValue(connectedChannel);
    reachChannel({ connect });

    expect(screen.getByRole("button", { name: /connect channel/i })).toBeDisabled();
    fireEvent.click(screen.getByLabelText(/ready to continue to google/i));
    fireEvent.click(screen.getByRole("button", { name: /connect channel/i }));

    expect(screen.getByText(/connecting securely/i)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/channel connected/i)).toBeInTheDocument());
    expect(connect).toHaveBeenCalledWith({ consentGranted: true });

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByRole("heading", { name: /choose how you want to work/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /continue with text/i }));
    expect(screen.getByRole("heading", { name: /ready to grow, alex/i })).toBeInTheDocument();
  });

  it("shows an error and supports retrying the channel connection", async () => {
    const connect = vi.fn()
      .mockRejectedValueOnce(new Error("Temporary connection error"))
      .mockResolvedValueOnce(connectedChannel);
    reachChannel({ connect });
    fireEvent.click(screen.getByLabelText(/ready to continue to google/i));
    fireEvent.click(screen.getByRole("button", { name: /connect channel/i }));

    await waitFor(() => expect(screen.getByText(/connection failed/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /retry connection/i }));
    await waitFor(() => expect(screen.getByText(/channel connected/i)).toBeInTheDocument());
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("labels an expired connection and offers reconnection", () => {
    render(<OnboardingFlow initialConnectionState={{ status: "expired", message: "Session expired" }} />);
    fireEvent.change(screen.getByLabelText(/what should we call you/i), { target: { value: "Alex" } });
    fireEvent.change(screen.getByLabelText(/workspace name/i), { target: { value: "Studio" } });
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(screen.getByText(/connection expired/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry connection/i })).toBeDisabled();
  });

  it("does not request microphone access before explicit consent", async () => {
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    reachChannel({ connect: vi.fn().mockResolvedValue(connectedChannel) });
    fireEvent.click(screen.getByLabelText(/ready to continue to google/i));
    fireEvent.click(screen.getByRole("button", { name: /connect channel/i }));
    await waitFor(() => expect(screen.getByText(/channel connected/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(screen.getByRole("button", { name: /enable microphone/i })).toBeDisabled();
    expect(getUserMedia).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText(/want to test my microphone/i));
    fireEvent.click(screen.getByRole("button", { name: /enable microphone/i }));
    await waitFor(() => expect(screen.getByText(/microphone is ready/i)).toBeInTheDocument());
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
  });
});
