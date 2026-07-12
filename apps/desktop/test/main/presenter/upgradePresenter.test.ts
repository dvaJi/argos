import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UPDATE_EVENTS, WINDOW_EVENTS } from "../../../src/main/events";

const {
  autoUpdaterState,
  sendToMainMock,
  sendToRendererMock,
  floatingButtonDestroyMock,
  destroyFloatingChatWindowMock,
  setApplicationQuittingMock,
  appQuitMock,
  appRelaunchMock,
  appExitMock,
  appGetVersionMock,
} = vi.hoisted(() => {
  const autoUpdaterState = {
    listeners: new Map<string, (...args: unknown[]) => void>(),
    reset() {
      this.listeners.clear();
    },
  };

  return {
    autoUpdaterState,
    sendToMainMock: vi.fn<(...args: any[]) => any>(),
    sendToRendererMock: vi.fn<(...args: any[]) => any>(),
    floatingButtonDestroyMock: vi.fn<(...args: any[]) => any>(),
    destroyFloatingChatWindowMock: vi.fn<(...args: any[]) => any>(),
    setApplicationQuittingMock: vi.fn<(...args: any[]) => any>(),
    appQuitMock: vi.fn<(...args: any[]) => any>(),
    appRelaunchMock: vi.fn<(...args: any[]) => any>(),
    appExitMock: vi.fn<(...args: any[]) => any>(),
    appGetVersionMock: vi.fn<(...args: any[]) => any>(() => "1.0.0"),
  };
});

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn<(...args: any[]) => any>(() => "/tmp/argos-test"),
    getVersion: appGetVersionMock,
    quit: appQuitMock,
    relaunch: appRelaunchMock,
    exit: appExitMock,
  },
  shell: {
    openExternal: vi.fn<(...args: any[]) => any>(),
  },
}));

vi.mock("electron-updater", () => ({
  default: {
    autoUpdater: {
      autoDownload: false,
      allowDowngrade: false,
      autoInstallOnAppQuit: true,
      allowPrerelease: false,
      channel: "latest",
      on: vi.fn<(...args: any[]) => any>((event: string, handler: (...args: unknown[]) => void) => {
        autoUpdaterState.listeners.set(event, handler);
      }),
      checkForUpdates: vi.fn<(...args: any[]) => any>(),
      downloadUpdate: vi.fn<(...args: any[]) => any>(),
      quitAndInstall: vi.fn<(...args: any[]) => any>(),
    },
  },
}));

vi.mock("#/eventbus", () => ({
  eventBus: {
    on: vi.fn<(...args: any[]) => any>(),
    sendToMain: sendToMainMock,
    sendToRenderer: sendToRendererMock,
  },
  SendTarget: {
    ALL_WINDOWS: "all_windows",
  },
}));

vi.mock("#/presenter", () => ({
  presenter: {
    windowPresenter: {
      setApplicationQuitting: setApplicationQuittingMock,
      destroyFloatingChatWindow: destroyFloatingChatWindowMock,
    },
    floatingButtonPresenter: {
      destroy: floatingButtonDestroyMock,
    },
  },
}));

import electronUpdater from "electron-updater";
import { UpgradePresenter } from "../../../src/main/presenter/upgradePresenter";

describe("UpgradePresenter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    autoUpdaterState.reset();
    sendToMainMock.mockReset();
    sendToRendererMock.mockReset();
    floatingButtonDestroyMock.mockReset();
    destroyFloatingChatWindowMock.mockReset();
    setApplicationQuittingMock.mockReset();
    appQuitMock.mockReset();
    appRelaunchMock.mockReset();
    appExitMock.mockReset();
    appGetVersionMock.mockReset();
    appGetVersionMock.mockReturnValue("1.0.0");
    vi.mocked<(...args: any[]) => any>(electronUpdater.autoUpdater.checkForUpdates).mockReset();
  });

  afterEach(async () => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("destroys floating UI before quitAndInstall during update restart", async () => {
    const configPresenter = {
      getUpdateChannel: vi.fn<(...args: any[]) => any>(() => "stable"),
    } as any;

    const presenter = new UpgradePresenter(configPresenter);
    (presenter as any)._status = "downloaded";

    expect(presenter.restartToUpdate()).toBe(true);
    expect(setApplicationQuittingMock).toHaveBeenCalledWith(true);
    expect(destroyFloatingChatWindowMock).toHaveBeenCalledTimes(1);
    expect(floatingButtonDestroyMock).toHaveBeenCalledTimes(1);
    expect(sendToMainMock).toHaveBeenCalledWith(WINDOW_EVENTS.SET_APPLICATION_QUITTING, {
      isQuitting: true,
    });
    expect(sendToRendererMock).toHaveBeenCalledWith(UPDATE_EVENTS.WILL_RESTART, "all_windows");

    await vi.advanceTimersByTimeAsync(500);

    expect(electronUpdater.autoUpdater.quitAndInstall).toHaveBeenCalledTimes(1);
    expect(appQuitMock).not.toHaveBeenCalled();
  });

  it("relaunches the app for mock downloaded updates without calling quitAndInstall", async () => {
    const configPresenter = {
      getUpdateChannel: vi.fn<(...args: any[]) => any>(() => "stable"),
    } as any;

    const presenter = new UpgradePresenter(configPresenter);

    expect(presenter.mockDownloadedUpdate()).toBe(true);
    expect(presenter.restartToUpdate()).toBe(true);

    expect(setApplicationQuittingMock).toHaveBeenCalledWith(true);
    expect(destroyFloatingChatWindowMock).toHaveBeenCalledTimes(1);
    expect(floatingButtonDestroyMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(500);

    expect(appRelaunchMock).toHaveBeenCalledTimes(1);
    expect(appExitMock).toHaveBeenCalledTimes(1);
    expect(electronUpdater.autoUpdater.quitAndInstall).not.toHaveBeenCalled();
  });

  it("skips app-focus auto check when privacy mode is enabled", () => {
    const configPresenter = {
      getUpdateChannel: vi.fn<(...args: any[]) => any>(() => "stable"),
      getPrivacyModeEnabled: vi.fn<(...args: any[]) => any>(() => true),
    } as any;

    const presenter = new UpgradePresenter(configPresenter);
    const checkSpy = vi.spyOn<(...args: any[]) => any>(presenter, "checkUpdate").mockResolvedValue(undefined);

    (presenter as any).handleAppFocus();

    expect(checkSpy).not.toHaveBeenCalled();
    expect(electronUpdater.autoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it("keeps manual update checks available while privacy mode is enabled", async () => {
    const configPresenter = {
      getUpdateChannel: vi.fn<(...args: any[]) => any>(() => "stable"),
      getPrivacyModeEnabled: vi.fn<(...args: any[]) => any>(() => true),
    } as any;

    vi.mocked<(...args: any[]) => any>(electronUpdater.autoUpdater.checkForUpdates).mockResolvedValue(
      undefined as never,
    );

    const presenter = new UpgradePresenter(configPresenter);

    await presenter.checkUpdate();

    expect(electronUpdater.autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
  });

  it("ignores cross-channel downgrades when current install is a prerelease", () => {
    appGetVersionMock.mockReturnValue("1.0.5-beta.5");
    const configPresenter = {
      getUpdateChannel: vi.fn<(...args: any[]) => any>(() => "stable"),
      getPrivacyModeEnabled: vi.fn<(...args: any[]) => any>(() => false),
    } as any;

    const presenter = new UpgradePresenter(configPresenter);
    const handler = autoUpdaterState.listeners.get("update-available");
    expect(handler).toBeDefined();

    // Simulate an old stable release pushed by electron-updater under a channel mismatch
    handler!({ version: "1.0.4", releaseDate: "2026-05-01", releaseNotes: "" });

    expect((presenter as any)._status).toBe("not-available");
    expect((presenter as any)._versionInfo).toBeNull();
    // Should not trigger automatic download
    expect(electronUpdater.autoUpdater.downloadUpdate).not.toHaveBeenCalled();
  });

  it("accepts in-channel upgrades from one beta to a newer beta", () => {
    appGetVersionMock.mockReturnValue("1.0.5-beta.2");
    const configPresenter = {
      getUpdateChannel: vi.fn<(...args: any[]) => any>(() => "beta"),
      getPrivacyModeEnabled: vi.fn<(...args: any[]) => any>(() => false),
    } as any;

    const presenter = new UpgradePresenter(configPresenter);
    const handler = autoUpdaterState.listeners.get("update-available");
    expect(handler).toBeDefined();

    handler!({ version: "1.0.5-beta.5", releaseDate: "2026-05-15", releaseNotes: "" });

    expect((presenter as any)._status).toBe("available");
    expect((presenter as any)._versionInfo?.version).toBe("1.0.5-beta.5");
  });

  it("accepts beta to same-version stable release as a legitimate channel convergence", () => {
    // Beta testing complete and 1.0.5 stable released; upgrading from 1.0.5-beta.5 to 1.0.5 should be allowed
    appGetVersionMock.mockReturnValue("1.0.5-beta.5");
    const configPresenter = {
      getUpdateChannel: vi.fn<(...args: any[]) => any>(() => "stable"),
      getPrivacyModeEnabled: vi.fn<(...args: any[]) => any>(() => false),
    } as any;

    const presenter = new UpgradePresenter(configPresenter);
    const handler = autoUpdaterState.listeners.get("update-available");
    expect(handler).toBeDefined();

    handler!({ version: "1.0.5", releaseDate: "2026-06-01", releaseNotes: "" });

    expect((presenter as any)._status).toBe("available");
    expect((presenter as any)._versionInfo?.version).toBe("1.0.5");
  });
});
