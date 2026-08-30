import { afterEach, describe, expect, it, vi } from "vitest";
import logger from "@argos/shared/logger";
import { Presenter } from "#/presenter";

vi.mock("@argos/shared/logger", async () => {
  const { mockSharedLogger } = await import("../../mocks/sharedLogger");
  return mockSharedLogger();
});

vi.mock("electron-updater", () => ({
  default: {
    autoUpdater: {},
  },
}));

describe("Presenter startup", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps MCP initialization running when plugin discovery fails", async () => {
    const pluginError = new Error("corrupt plugin package");
    const presenter = Object.create(Presenter.prototype) as any;
    presenter.pluginPresenter = {
      initialize: vi.fn<(...args: any[]) => any>().mockRejectedValue(pluginError),
    };
    presenter.mcpPresenter = {
      initialize: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    };

    await presenter.initializeMcp();

    expect(presenter.pluginPresenter.initialize).toHaveBeenCalledOnce();
    expect(presenter.mcpPresenter.initialize).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledWith("[Presenter] [PluginHost] Failed to initialize plugins:", pluginError);
  });
});
