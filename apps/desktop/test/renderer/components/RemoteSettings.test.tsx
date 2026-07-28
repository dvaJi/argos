import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";

vi.mock("@iconify/react", () => ({
  Icon: () => null,
}));

type SetupOptions = {
  settings?: {
    botToken: string;
    remoteEnabled: boolean;
    defaultAgentId: string;
    allowedUserIds?: number[];
  };
  telegramChannelSettingsOverride?: Record<string, unknown>;
  status?: {
    enabled: boolean;
    state: "disabled" | "stopped" | "starting" | "running" | "backoff" | "error";
    bindingCount?: number;
    allowedUserCount?: number;
    lastError?: string | null;
  };
  pairingSnapshot?: {
    pairCode: string | null;
    pairCodeExpiresAt: number | null;
    allowedUserIds: number[];
  };
  bindings?: Array<{
    endpointKey: string;
    sessionId: string;
    chatId: number;
    messageThreadId: number;
    updatedAt: number;
  }>;
  agents?: Array<{
    id: string;
    name: string;
    type: "argos" | "acp";
    enabled: boolean;
  }>;
};

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
});

const setup = async (options: SetupOptions = {}) => {
  vi.resetModules();

  const remoteState = {
    settings: {
      botToken: "telegram-token",
      remoteEnabled: false,
      defaultAgentId: "argos",
      ...options.settings,
    },
    status: {
      enabled: options.settings?.remoteEnabled ?? false,
      state: "disabled" as const,
      bindingCount: 0,
      allowedUserCount: options.pairingSnapshot?.allowedUserIds?.length ?? 1,
      lastError: null,
      ...options.status,
    },
    pairingSnapshot: {
      pairCode: null,
      pairCodeExpiresAt: null,
      allowedUserIds: options.pairingSnapshot?.allowedUserIds ?? [123],
      ...options.pairingSnapshot,
    },
    bindings: [...(options.bindings ?? [])],
  };

  const remoteControlPresenter = {
    getTelegramSettings: vi.fn<(...args: any[]) => any>(async () => remoteState.settings),
    saveTelegramSettings: vi.fn<(...args: any[]) => any>(async (nextSettings: any) => {
      remoteState.settings = { ...nextSettings };
      remoteState.status.enabled = nextSettings.remoteEnabled;
      return { ...remoteState.settings };
    }),
    getTelegramPairingSnapshot: vi.fn<(...args: any[]) => any>(async () => ({
      ...remoteState.pairingSnapshot,
      allowedUserIds: [...remoteState.pairingSnapshot.allowedUserIds],
    })),
    createTelegramPairCode: vi.fn<(...args: any[]) => any>(async () => {
      remoteState.pairingSnapshot.pairCode = "654321";
      remoteState.pairingSnapshot.pairCodeExpiresAt = 123456789;
      return { code: "654321", expiresAt: 123456789 };
    }),
    clearTelegramPairCode: vi.fn<(...args: any[]) => any>(async () => {
      remoteState.pairingSnapshot.pairCode = null;
      remoteState.pairingSnapshot.pairCodeExpiresAt = null;
    }),
  };

  const configPresenter = {
    listAgents: vi.fn<(...args: any[]) => any>(async () =>
      [
        { id: "argos", name: "Argos", type: "argos", enabled: true },
        { id: "argos-alt", name: "Argos Alt", type: "argos", enabled: false },
        { id: "acp-agent", name: "ACP Agent", type: "acp", enabled: true },
        ...(options.agents ?? []),
      ].filter((agent) => agent.enabled),
    ),
  };

  const toast = vi.fn<(...args: any[]) => any>();

  vi.doMock("#api/presenterBridge", () => ({
    usePresenter: () => configPresenter,
    useRemoteControlPresenter: () => remoteControlPresenter,
  }));
  vi.doMock("#/components/use-toast", () => ({
    useToast: () => ({
      toast,
    }),
  }));

  const RemoteSettings = (await import("#settings/components/RemoteSettings")).default;

  const result = render(<RemoteSettings />);

  await act(async () => {});

  return {
    ...result,
    remoteState,
    remoteControlPresenter,
    configPresenter,
    toast,
  };
};

describe("RemoteSettings", () => {
  it("hides remote details when telegram remote is disabled", async () => {
    const { container } = await setup({
      settings: {
        botToken: "telegram-token",
        remoteEnabled: false,
        allowedUserIds: [123],
        defaultAgentId: "argos",
      },
    });

    expect(screen.getByRole("switch")).toHaveAttribute("data-state", "unchecked");
    expect(container).toHaveTextContent("These integrations do not connect Argos to another machine");
  });

  it("shows enabled ACP agents in the default agent options", async () => {
    const { container } = await setup({
      settings: {
        botToken: "telegram-token",
        remoteEnabled: true,
        allowedUserIds: [123],
        defaultAgentId: "argos",
      },
    });

    fireEvent.click(screen.getByRole("combobox"));
    expect(await screen.findByText("ACP Agent")).toBeInTheDocument();
  });

  it("loads telegram settings without legacy hook fields", async () => {
    const { container, toast } = await setup({
      settings: {
        botToken: "telegram-token",
        remoteEnabled: true,
        allowedUserIds: [123],
        defaultAgentId: "argos",
      },
    });

    expect(toast).not.toHaveBeenCalled();
    expect(screen.getByText("Default agent")).toBeInTheDocument();
    expect(screen.queryByText("Allowed user IDs")).not.toBeInTheDocument();
  });

  it("uses remote control as the channel section title", async () => {
    const { container } = await setup();

    expect(container).toHaveTextContent("Remote Channels");
    expect(container).toHaveTextContent("use Machines to connect to Argos Server");
  });

  it("lists only enabled agents in the default agent selector area", async () => {
    const { container } = await setup({
      settings: {
        botToken: "telegram-token",
        remoteEnabled: true,
        allowedUserIds: [123],
        defaultAgentId: "argos",
      },
    });

    fireEvent.click(screen.getByRole("combobox"));
    expect((await screen.findAllByText("Argos")).length).toBeGreaterThan(1);
    expect(screen.queryByText("Argos Alt")).not.toBeInTheDocument();
    expect(screen.getByText("ACP Agent")).toBeInTheDocument();
  });
});
