import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConnectionState } from "@argos/shared-contracts/connection";
import DaemonConnectionBanner from "#/components/DaemonConnectionBanner";

const state = vi.hoisted(() => ({
  value: {
    mode: "local",
    url: null,
    connected: false,
    lastError: null,
  } as ConnectionState,
}));

vi.mock("#/composables/useRuntimeConnectionState", () => ({
  useRuntimeConnectionState: () => state.value,
}));

describe("DaemonConnectionBanner", () => {
  beforeEach(() => {
    state.value = {
      mode: "local",
      url: null,
      connected: false,
      lastError: null,
    };
  });

  it("stays hidden before a daemon endpoint is configured", () => {
    render(<DaemonConnectionBanner />);
    expect(screen.queryByTestId("daemon-connection-banner")).toBeNull();
  });

  it("clearly reports a configured daemon disconnect", () => {
    state.value = {
      mode: "local",
      url: "ws://127.0.0.1:54112/api/v1/events",
      connected: false,
      lastError: "Daemon connection closed",
      reconnectAttempt: 1,
      maxReconnectAttempts: 10,
    };

    render(<DaemonConnectionBanner />);

    expect(screen.getByRole("status")).toHaveTextContent("Daemon disconnected");
    expect(screen.getByRole("status")).toHaveTextContent("Reconnecting automatically");
    expect(screen.getByRole("status")).toHaveTextContent("Attempt 1/10");
  });

  it("disappears after reconnection", () => {
    state.value = {
      mode: "local",
      url: "ws://127.0.0.1:54112/api/v1/events",
      connected: true,
      lastError: null,
    };

    render(<DaemonConnectionBanner />);
    expect(screen.queryByTestId("daemon-connection-banner")).toBeNull();
  });

  it("explains when automatic retries are exhausted", () => {
    state.value = {
      mode: "remote",
      url: "wss://workspace.example/api/v1/events",
      connected: false,
      lastError: "Automatic reconnection stopped after repeated failures",
    };

    render(<DaemonConnectionBanner />);

    expect(screen.getByRole("status")).toHaveTextContent("Daemon unavailable");
    expect(screen.getByRole("status")).toHaveTextContent("Restart Argos or reconnect the workspace");
  });
});
