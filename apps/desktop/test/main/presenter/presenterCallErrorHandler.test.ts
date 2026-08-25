import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendToWebContents: vi.fn<(...args: any[]) => any>(),
}));

vi.mock("#/eventbus", () => ({
  eventBus: {
    sendToWebContents: mocks.sendToWebContents,
  },
}));

const loadModule = async () => await import("../../../src/main/presenter/presenterCallErrorHandler");

describe("presenterCallErrorHandler", () => {
  beforeEach(async () => {
    vi.resetModules();
    mocks.sendToWebContents.mockReset();
    const { resetPresenterCallErrorStateForTests } = await loadModule();
    resetPresenterCallErrorStateForTests();
  });

  it("forwards the error result without sending any database repair suggestion", async () => {
    const { handlePresenterCallResult } = await loadModule();
    const error = new Error("network timeout");

    await expect(
      handlePresenterCallResult(Promise.reject(error), {
        webContentsId: 3,
        presenterName: "configPresenter",
        methodName: "getProviderModels",
      }),
    ).rejects.toThrow("network timeout");

    expect(mocks.sendToWebContents).not.toHaveBeenCalled();
  });

  it("passes through sync results unchanged", async () => {
    const { handlePresenterCallResult } = await loadModule();

    const result = handlePresenterCallResult("ok", {
      webContentsId: 3,
      presenterName: "configPresenter",
      methodName: "getLanguage",
    });

    expect(result).toBe("ok");
  });
});
