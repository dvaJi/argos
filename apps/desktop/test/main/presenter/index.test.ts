import { afterEach, describe, expect, it, vi } from "vitest";
import { Presenter } from "@/presenter";

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
    const consoleError = vi.spyOn<(...args: any[]) => any>(console, "error").mockImplementation(() => undefined);

    await presenter.initializeMcp();

    expect(presenter.pluginPresenter.initialize).toHaveBeenCalledOnce();
    expect(presenter.mcpPresenter.initialize).toHaveBeenCalledOnce();
    expect(consoleError).toHaveBeenCalledWith("[PluginHost] Failed to initialize plugins:", pluginError);
  });
});
