import { afterEach, describe, expect, it, vi } from "vitest";
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
  feishuChannelSettingsOverride?: Record<string, unknown>;
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
    type: "deepchat" | "acp";
    enabled: boolean;
  }>;
};

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});

const setup = async (options: SetupOptions = {}) => {
  vi.resetModules();
  vi.useFakeTimers();

  const remoteState = {
    settings: {
      botToken: "telegram-token",
      remoteEnabled: false,
      defaultAgentId: "deepchat",
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
    listRemoteChannels: vi.fn(async () => [
      { id: "telegram", implemented: true },
      { id: "feishu", implemented: true },
      { id: "qqbot", implemented: true },
      { id: "discord", implemented: true },
      { id: "weixin-ilink", implemented: true },
    ]),
    getChannelSettings: vi.fn(async () => remoteState.settings),
    saveChannelSettings: vi.fn(async (_channel: string, nextSettings: any) => {
      remoteState.settings = { ...nextSettings };
      remoteState.status.enabled = nextSettings.remoteEnabled;
      return { ...remoteState.settings };
    }),
    getChannelStatus: vi.fn(async () => ({
      channel: "telegram" as const,
      ...remoteState.status,
    })),
    getChannelPairingSnapshot: vi.fn(async () => ({
      ...remoteState.pairingSnapshot,
      allowedUserIds: [...remoteState.pairingSnapshot.allowedUserIds],
    })),
    createChannelPairCode: vi.fn(async () => {
      remoteState.pairingSnapshot.pairCode = "654321";
      remoteState.pairingSnapshot.pairCodeExpiresAt = 123456789;
      return { code: "654321", expiresAt: 123456789 };
    }),
    clearChannelPairCode: vi.fn(async () => {
      remoteState.pairingSnapshot.pairCode = null;
      remoteState.pairingSnapshot.pairCodeExpiresAt = null;
    }),
    getChannelBindings: vi.fn(async () =>
      remoteState.bindings.map((binding) => ({
        channel: "telegram" as const,
        ...binding,
      })),
    ),
    removeChannelBinding: vi.fn(async (_channel: string, endpointKey: string) => {
      remoteState.bindings = remoteState.bindings.filter((binding) => binding.endpointKey !== endpointKey);
    }),
    removeChannelPrincipal: vi.fn(async (_channel: string, principalId: string) => {
      remoteState.pairingSnapshot.allowedUserIds = remoteState.pairingSnapshot.allowedUserIds.filter(
        (value) => String(value) !== principalId,
      );
    }),
  };

  const agentSessionPresenter = {
    getAgents: vi.fn(async () => [
      { id: "deepchat", name: "DeepChat", type: "deepchat", enabled: true },
      { id: "deepchat-alt", name: "DeepChat Alt", type: "deepchat", enabled: false },
      { id: "acp-agent", name: "ACP Agent", type: "acp", enabled: true },
      ...(options.agents ?? []),
    ]),
  };
  const projectPresenter = {
    selectDirectory: vi.fn(async () => null),
  };

  const toast = vi.fn();

  vi.doMock("@api/legacy/presenters", () => ({
    useLegacyPresenter: (name: string) => {
      if (name === "agentSessionPresenter") return agentSessionPresenter;
      if (name === "projectPresenter") return projectPresenter;
      return null;
    },
    useLegacyRemoteControlPresenter: () => remoteControlPresenter,
  }));
  vi.doMock("@/components/use-toast", () => ({
    useToast: () => ({
      toast,
    }),
  }));

  const RemoteSettings = (await import("../../../src/renderer/settings/components/RemoteSettings")).default;

  const result = render(<RemoteSettings />);

  await act(async () => {});

  return {
    ...result,
    remoteState,
    remoteControlPresenter,
    agentSessionPresenter,
    projectPresenter,
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
        defaultAgentId: "deepchat",
      },
    });

    expect(container.querySelector('[data-testid="remote-control-details"]')).toBeFalsy();
    expect(container).not.toHaveTextContent("settings.remote.remoteControl.streamMode");
  });

  it("shows enabled ACP agents in the default agent options", async () => {
    const { container } = await setup({
      settings: {
        botToken: "telegram-token",
        remoteEnabled: true,
        allowedUserIds: [123],
        defaultAgentId: "deepchat",
      },
    });

    expect(container).toHaveTextContent("ACP Agent (ACP)");
  });

  it("loads telegram settings without legacy hook fields", async () => {
    const { container, toast } = await setup({
      settings: {
        botToken: "telegram-token",
        remoteEnabled: true,
        allowedUserIds: [123],
        defaultAgentId: "deepchat",
      },
    });

    expect(toast).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="remote-default-agent-select"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="remote-allowed-user-ids-input"]')).toBeFalsy();
  });

  it("uses remote control as the channel section title", async () => {
    const { container } = await setup({
      feishuChannelSettingsOverride: {
        remoteEnabled: true,
      },
    });

    const text = container.textContent!;
    expect(text).not.toContain("settings.remote.sections.accessRules");
    expect(text.match(/settings\.remote\.sections\.remoteControl/g)).toHaveLength(5);
  });

  it("lists only enabled agents in the default agent selector area", async () => {
    const { container } = await setup({
      settings: {
        botToken: "telegram-token",
        remoteEnabled: true,
        allowedUserIds: [123],
        defaultAgentId: "deepchat",
      },
    });

    expect(container).toHaveTextContent("DeepChat");
    expect(container).not.toHaveTextContent("DeepChat Alt");
    expect(container).toHaveTextContent("ACP Agent (ACP)");
  });
});
