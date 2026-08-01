export type ChannelConnectionState =
  | { status: "disconnected" }
  | { status: "connecting" }
  | { status: "connected"; channel: ConnectedChannel }
  | { status: "expired"; message: string }
  | { status: "error"; message: string };

export type ConnectedChannel = {
  id: string;
  title: string;
  handle: string;
  subscriberLabel: string;
};

export type ChannelConnectionRequest = {
  consentGranted: boolean;
};

export interface ChannelConnectionAdapter {
  connect(request: ChannelConnectionRequest): Promise<ConnectedChannel>;
}

const demoChannel: ConnectedChannel = {
  id: "demo-channel-01",
  title: "Your creator channel",
  handle: "@creator-demo",
  subscriberLabel: "Demo data",
};

export function createDemoChannelConnection(options?: {
  delayMs?: number;
  outcome?: "connected" | "expired" | "error";
}): ChannelConnectionAdapter {
  return {
    async connect(request) {
      if (!request.consentGranted) {
        throw new Error("Confirm consent before continuing to Google.");
      }

      await new Promise((resolve) => setTimeout(resolve, options?.delayMs ?? 650));

      if (options?.outcome === "expired") {
        throw new Error("Your Google session expired. Reconnect to continue.");
      }
      if (options?.outcome === "error") {
        throw new Error("We could not connect the channel. Please try again.");
      }

      return demoChannel;
    },
  };
}
