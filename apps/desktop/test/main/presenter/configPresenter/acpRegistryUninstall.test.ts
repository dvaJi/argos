import { describe, expect, it, vi } from "vitest";

vi.mock("#/eventbus", () => ({
  eventBus: {
    on: vi.fn<(...args: any[]) => any>(),
    send: vi.fn<(...args: any[]) => any>(),
    sendToMain: vi.fn<(...args: any[]) => any>(),
    sendToRenderer: vi.fn<(...args: any[]) => any>(),
    emit: vi.fn<(...args: any[]) => any>(),
  },
  SendTarget: {
    ALL_WINDOWS: "ALL_WINDOWS",
  },
}));

vi.mock("#/presenter", () => ({
  presenter: {},
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn<(...args: any[]) => any>(() => "/mock/path"),
    getVersion: vi.fn<(...args: any[]) => any>(() => "0.0.0-test"),
    getLocale: vi.fn<(...args: any[]) => any>(() => "en-US"),
  },
  nativeTheme: {
    shouldUseDarkColors: false,
  },
  shell: {
    openPath: vi.fn<(...args: any[]) => any>(),
  },
}));

import { ConfigPresenter } from "../../../../src/main/presenter/configPresenter";

describe("ConfigPresenter ACP registry uninstall", () => {
  it("blocks registry uninstall before removing files when sessions remain", async () => {
    const uninstallRegistryAgent = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined);
    const clearRegistryAcpAgentInstallation = vi.fn<(...args: any[]) => any>();
    const presenter = Object.assign(Object.create(ConfigPresenter.prototype), {
      getRegistryAgentOrThrow: vi.fn<(...args: any[]) => any>(() => ({
        id: "codex-acp",
        name: "Codex CLI",
        version: "0.10.0",
        distribution: {},
      })),
      getAgentRepositoryOrThrow: vi.fn<(...args: any[]) => any>(() => ({
        hasAgentSessions: vi.fn<(...args: any[]) => any>(() => true),
        getAgentInstallState: vi.fn<(...args: any[]) => any>(),
        clearRegistryAcpAgentInstallation,
      })),
      acpLaunchSpecService: {
        uninstallRegistryAgent,
        selectRegistryDistribution: vi.fn<(...args: any[]) => any>(),
      },
      handleAcpAgentsMutated: vi.fn<(...args: any[]) => any>(),
    }) as InstanceType<typeof ConfigPresenter> & {
      getRegistryAgentOrThrow: ReturnType<typeof vi.fn>;
      getAgentRepositoryOrThrow: ReturnType<typeof vi.fn>;
      acpLaunchSpecService: { uninstallRegistryAgent: ReturnType<typeof vi.fn> };
    };

    await expect(presenter.uninstallAcpRegistryAgent("codex-acp")).rejects.toThrow("related conversations");
    expect(uninstallRegistryAgent).not.toHaveBeenCalled();
    expect(clearRegistryAcpAgentInstallation).not.toHaveBeenCalled();
  });
});
