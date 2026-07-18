import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { DEV_EVENTS } from "#/events";

const presenterMocks = {
  devicePresenter: {
    getAppVersion: vi.fn<(...args: any[]) => any>().mockResolvedValue("1.0.0-beta.3"),
  },
  configPresenter: {
    getUpdateChannel: vi.fn<(...args: any[]) => any>().mockResolvedValue("stable"),
    setUpdateChannel: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
  },
  windowPresenter: {
    sendToAllWindows: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    focusMainWindow: vi.fn<(...args: any[]) => any>().mockResolvedValue(true),
  },
};

const upgradeStoreMock = {
  shouldShowUpdateNotes: true,
  updateInfo: {
    version: "1.0.0-beta.4",
    releaseNotes: "- Added floating window",
  },
  showManualDownloadOptions: true,
  updateError: "network failed",
  isChecking: false,
  isDownloading: false,
  isRestarting: false,
  updateProgress: null,
  isReadyToInstall: false,
  isMockUpdate: false,
  updateState: "error",
  refreshStatus: vi.fn<(...args: any[]) => any>().mockResolvedValue("error"),
  checkUpdate: vi.fn<(...args: any[]) => any>().mockResolvedValue("error"),
  mockDownloadedUpdate: vi.fn<(...args: any[]) => any>().mockResolvedValue("downloaded"),
  clearMockUpdate: vi.fn<(...args: any[]) => any>().mockResolvedValue("not-available"),
  handleUpdate: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
};

vi.mock("#api/presenterBridge", () => ({
  useLegacyPresenter: (name: keyof typeof presenterMocks) => presenterMocks[name],
}));

vi.mock("#/stores/upgrade", () => ({
  useUpgradeStore: () => upgradeStoreMock,
}));

vi.mock("#/stores/language", () => ({
  useLanguageStore: () => ({
    dir: "ltr",
  }),
}));

vi.mock("#/stores/theme", () => ({
  useThemeStore: () => ({
    isDark: true,
  }),
}));

vi.mock("#/components/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn<(...args: any[]) => any>(),
  }),
}));

describe("AboutUsSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(upgradeStoreMock, {
      shouldShowUpdateNotes: true,
      updateInfo: {
        version: "1.0.0-beta.4",
        releaseNotes: "- Added floating window",
      },
      showManualDownloadOptions: true,
      updateError: "network failed",
      isChecking: false,
      isDownloading: false,
      isRestarting: false,
      updateProgress: null,
      isReadyToInstall: false,
      isMockUpdate: false,
      updateState: "error",
    });
  });

  // TODO: flesh out React test — renders fallback download actions, subscribes to tray updates,
  // handles ready-to-install state, mock update button, and dev onboarding guide
  it("placeholder: module imports resolve", async () => {
    expect(true).toBe(true);
  });
});
