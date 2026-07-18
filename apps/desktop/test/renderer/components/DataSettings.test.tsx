import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import React from "react";

function renderPrivacySettingsSection(
  state: { privacyModeEnabled: boolean },
  setPrivacyModeEnabled: (value: boolean) => Promise<void> | void,
) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <span id="privacy-mode-label">Privacy Mode</span>
      </div>
      <p id="privacy-mode-desc">Stop automatic outbound requests owned by Argos:</p>
      <button
        type="button"
        role="switch"
        aria-checked={state.privacyModeEnabled}
        data-testid="privacy-mode-switch"
        aria-labelledby="privacy-mode-label"
        aria-describedby="privacy-mode-desc"
        onClick={() => void setPrivacyModeEnabled(!state.privacyModeEnabled)}
      >
        Toggle
      </button>
      <span>App update checks</span>
    </div>
  );
}

const setup = async () => {
  vi.resetModules();

  const toast = vi.fn<(...args: any[]) => any>();
  const openExternal = vi.fn<(...args: any[]) => any>();
  const syncStore = {
    syncEnabled: true,
    syncFolderPath: "/tmp/argos-sync",
    lastSyncTime: 0,
    isBackingUp: false,
    isImporting: false,
    importResult: null,
    backups: [] as Array<{ fileName: string; createdAt: number; size: number }>,
    initialize: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    selectSyncFolder: vi.fn<(...args: any[]) => any>(),
    openSyncFolder: vi.fn<(...args: any[]) => any>(),
    refreshBackups: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    startBackup: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
    importData: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
    clearImportResult: vi.fn<(...args: any[]) => any>(),
    setSyncEnabled: vi.fn<(...args: any[]) => any>(),
    setSyncFolderPath: vi.fn<(...args: any[]) => any>(),
  };
  const uiSettingsState = { privacyModeEnabled: false };
  const setPrivacyModeEnabled = vi.fn<(...args: any[]) => any>(async (value: boolean) => {
    uiSettingsState.privacyModeEnabled = value;
  });
  const databaseSecurityClient = {
    repairSchema: vi.fn<(...args: any[]) => any>().mockResolvedValue({
      startedAt: Date.now(),
      finishedAt: Date.now(),
      status: "healthy",
      backupPath: null,
      diagnosisBeforeRepair: {
        checkedAt: Date.now(),
        isHealthy: true,
        issues: [],
        repairableIssues: [],
        manualIssues: [],
      },
      diagnosisAfterRepair: {
        checkedAt: Date.now(),
        isHealthy: true,
        issues: [],
        repairableIssues: [],
        manualIssues: [],
      },
      repairedIssues: [],
      remainingIssues: [],
    }),
  };

  const presenterMocks = {
    configPresenter: {
      refreshProviderDb: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        status: "updated",
        lastUpdated: Date.now(),
        providersCount: 1,
      }),
    },
    devicePresenter: {
      resetDataByType: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    },
    yoBrowserPresenter: {
      clearSandboxData: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    },
  };

  vi.doMock("#/stores/sync", () => ({
    useSyncStore: () => syncStore,
    setSyncEnabled: vi.fn<(...args: any[]) => any>(),
    startBackup: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
    importData: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
    initializeSync: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    selectSyncFolder: vi.fn<(...args: any[]) => any>(),
    openSyncFolder: vi.fn<(...args: any[]) => any>(),
    saveCloudConfig: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    testCloud: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
    uploadToCloud: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
    pullFromCloud: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
  }));
  vi.doMock("#/stores/uiSettingsStore", () => ({
    useUiSettingsStore: () => uiSettingsState,
    uiSettingsStore: { state: uiSettingsState },
    setPrivacyModeEnabled,
  }));
  vi.doMock("#settings/components/common/PrivacySettingsSection", () => ({
    default: () => renderPrivacySettingsSection(uiSettingsState, setPrivacyModeEnabled),
  }));
  vi.doMock("#/stores/language", () => ({
    useLanguageStore: () => ({
      dir: "ltr",
    }),
  }));
  vi.doMock("#api/presenterBridge", () => ({
    useLegacyPresenter: (name: keyof typeof presenterMocks) => presenterMocks[name],
  }));
  vi.doMock("#api/DatabaseSecurityClient", () => ({
    createDatabaseSecurityClient: () => databaseSecurityClient,
  }));
  vi.doMock("#/components/use-toast", () => ({
    useToast: () => ({
      toast,
    }),
  }));
  (window as typeof window & { api: { openExternal: typeof openExternal } }).api = {
    openExternal,
  };

  const DataSettings = (await import("#settings/components/DataSettings")).default;

  const result = render(<DataSettings />);

  await act(async () => {});

  return {
    ...result,
    openExternal,
    toast,
    syncStore,
    uiSettingsState,
    setPrivacyModeEnabled,
    databaseSecurityClient,
    presenterMocks,
  };
};

const findButtonByText = (container: HTMLElement, text: string, label: string) => {
  const buttons = Array.from(container.querySelectorAll("button"));
  const button = buttons.find((item) => item.textContent?.includes(text));

  if (!button) {
    throw new Error(`${label} button not found`);
  }

  return button;
};

const findRefreshButton = (container: HTMLElement) =>
  findButtonByText(container, "settings.data.modelConfigUpdate", "Refresh provider DB");

const findRepairButton = (container: HTMLElement) =>
  findButtonByText(container, "settings.data.databaseRepair", "Repair database");

const findResetEntryButton = (container: HTMLElement) =>
  findButtonByText(container, "settings.data.resetData", "Reset data");

const findResetConfirmButton = (container: HTMLElement) =>
  findButtonByText(container, "settings.data.confirmReset", "Reset confirm");

describe("DataSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the consolidated sync and operations sections", async () => {
    const { container } = await setup();

    const headings = Array.from(container.querySelectorAll("h2")).map((item) => item.textContent);

    expect(headings).not.toContain("settings.data.syncSectionTitle");
    expect(headings).not.toContain("settings.data.operationsSectionTitle");
    expect(container.textContent).toContain("Privacy Mode");
    expect(container.textContent).toContain("App update checks");
    expect(container.textContent).toContain("settings.data.databaseRepair.title");
    expect(container.textContent).toContain("settings.data.modelConfigUpdate.title");
    expect(container.textContent).toContain("settings.data.dangerZone.title");
    expect(container.textContent).toContain("settings.data.resetChatData");
    expect(container.textContent).toContain("settings.data.resetKnowledgeData");
    expect(container.textContent).toContain("settings.data.resetConfig");
    expect(container.textContent).toContain("settings.data.resetAll");
    expect(container.textContent).toContain("settings.data.yoBrowser.title");
  });

  it("renders a quiet danger zone entry and keeps reset choices in the dialog", async () => {
    const { container } = await setup();

    const resetEntry = findResetEntryButton(container);

    expect(resetEntry.getAttribute("data-variant")).toBe("outline");
    expect(resetEntry.className).toContain("text-destructive");
    expect(resetEntry.className).toContain("border-destructive/30");
    expect(screen.queryByTestId("danger-zone-reset-option-chat")).toBeTruthy();
    expect(screen.queryByTestId("danger-zone-reset-option-knowledge")).toBeTruthy();
    expect(screen.queryByTestId("danger-zone-reset-option-config")).toBeTruthy();
    expect(screen.queryByTestId("danger-zone-reset-option-all")).toBeTruthy();
  });

  it("updates privacy mode from the data settings page", async () => {
    const { setPrivacyModeEnabled } = await setup();

    await fireEvent.click(screen.getByTestId("privacy-mode-switch"));

    expect(setPrivacyModeEnabled).toHaveBeenCalledWith(true);
  });

  it("wires the privacy switch to its visible label and description", async () => {
    const { container } = await setup();

    const privacySwitch = screen.getByTestId("privacy-mode-switch");

    expect(privacySwitch.getAttribute("aria-labelledby")).toBe("privacy-mode-label");
    expect(privacySwitch.getAttribute("aria-describedby")).toBe("privacy-mode-desc");
    expect(container.querySelector("#privacy-mode-label")?.textContent).toContain("Privacy Mode");
    expect(container.querySelector("#privacy-mode-desc")?.textContent).toContain(
      "Stop automatic outbound requests owned by Argos:",
    );
  });

  it("shows an error toast when updating privacy mode fails", async () => {
    const { toast, setPrivacyModeEnabled } = await setup();

    setPrivacyModeEnabled.mockRejectedValueOnce(new Error("IPC failed"));

    await fireEvent.click(screen.getByTestId("privacy-mode-switch"));
    await act(async () => {});

    expect(toast).toHaveBeenCalledWith({
      title: "Operation failed",
      description: "IPC failed",
      variant: "destructive",
    });
  });

  it("does not render a repair result summary before any repair run", async () => {
    const { container } = await setup();

    expect(container.textContent).not.toContain("settings.data.databaseRepair.lastResultLabel");
    expect(container.textContent).not.toContain("settings.data.databaseRepair.notCheckedYet");
  });

  it("calls refreshProviderDb, shows loading state, then shows an updated toast", async () => {
    const { container, toast, presenterMocks } = await setup();

    let resolveRefresh: ((value: { status: string; lastUpdated: number; providersCount: number }) => void) | null =
      null;
    presenterMocks.configPresenter.refreshProviderDb.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );

    await fireEvent.click(findRefreshButton(container));
    await act(async () => {});

    const loadingButton = findRefreshButton(container);
    expect(loadingButton.hasAttribute("disabled")).toBe(true);
    expect(loadingButton.textContent).toContain("settings.data.modelConfigUpdate.updating");

    resolveRefresh?.({
      status: "updated",
      lastUpdated: Date.now(),
      providersCount: 3,
    });
    await act(async () => {});

    expect(presenterMocks.configPresenter.refreshProviderDb).toHaveBeenCalledWith(true);
    expect(toast).toHaveBeenCalledWith({
      title: "settings.data.modelConfigUpdate.updatedTitle",
      description: "settings.data.modelConfigUpdate.updatedDescription",
      duration: 4000,
    });
  });

  it("shows an up-to-date toast when upstream metadata has not changed", async () => {
    const { container, toast, presenterMocks } = await setup();

    presenterMocks.configPresenter.refreshProviderDb.mockResolvedValueOnce({
      status: "not-modified",
      lastUpdated: Date.now(),
      providersCount: 2,
    });

    await fireEvent.click(findRefreshButton(container));
    await act(async () => {});

    expect(toast).toHaveBeenCalledWith({
      title: "settings.data.modelConfigUpdate.upToDateTitle",
      description: "settings.data.modelConfigUpdate.upToDateDescription",
      duration: 4000,
    });
  });

  it("shows a destructive toast when refreshing provider metadata fails", async () => {
    const { container, toast, presenterMocks } = await setup();

    presenterMocks.configPresenter.refreshProviderDb.mockResolvedValueOnce({
      status: "error",
      lastUpdated: null,
      providersCount: 1,
      message: "network down",
    });

    await fireEvent.click(findRefreshButton(container));
    await act(async () => {});

    expect(toast).toHaveBeenCalledWith({
      title: "settings.data.modelConfigUpdate.failedTitle",
      description: "settings.data.modelConfigUpdate.failedDescription",
      variant: "destructive",
      duration: 4000,
    });
  });

  it("runs schema repair and shows a healthy toast summary", async () => {
    const { container, toast, databaseSecurityClient } = await setup();

    await fireEvent.click(findRepairButton(container));
    await act(async () => {});

    expect(databaseSecurityClient.repairSchema).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith({
      title: "settings.data.databaseRepair.toastHealthyTitle",
      description: "settings.data.databaseRepair.toastHealthyDescription",
      variant: "default",
    });
  });

  it("disables schema repair during backup and blocks both click and auto-run paths", async () => {
    const { container, syncStore, databaseSecurityClient } = await setup();

    syncStore.isBackingUp = true;
    await act(async () => {});

    expect(findRepairButton(container).hasAttribute("disabled")).toBe(true);

    window.dispatchEvent(
      new CustomEvent("argos:settings-section", {
        detail: { section: "database-repair" },
      }),
    );
    await act(async () => {});

    expect(databaseSecurityClient.repairSchema).not.toHaveBeenCalled();
  });

  it("renders repair summary and manual hint after a repair run with remaining issues", async () => {
    const { container, databaseSecurityClient } = await setup();

    databaseSecurityClient.repairSchema.mockResolvedValueOnce({
      startedAt: Date.now(),
      finishedAt: Date.now(),
      status: "repaired",
      backupPath: null,
      diagnosisBeforeRepair: {
        checkedAt: Date.now(),
        isHealthy: false,
        issues: [],
        repairableIssues: [],
        manualIssues: [],
      },
      diagnosisAfterRepair: {
        checkedAt: Date.now(),
        isHealthy: false,
        issues: [],
        repairableIssues: [],
        manualIssues: [],
      },
      repairedIssues: [
        {
          kind: "missing_column",
          table: "argos_sessions",
          name: "reasoning_effort",
          repairable: true,
          message: "Missing column reasoning_effort",
        },
      ],
      remainingIssues: [
        {
          kind: "column_type_mismatch",
          table: "messages",
          name: "metadata",
          repairable: false,
          message: "Column metadata type mismatch",
          expectedType: "TEXT",
          actualType: "BLOB",
        },
      ],
    });

    await fireEvent.click(findRepairButton(container));
    await act(async () => {});

    expect(container.textContent).toContain("settings.data.databaseRepair.lastResultLabel");
    expect(container.textContent).toContain("settings.data.databaseRepair.manualHint");
  });

  it("renders the PublicProviderConf link and opens it externally when clicked", async () => {
    const { container, openExternal } = await setup();

    const projectLink = container.querySelector('a[href="https://github.com/dvaJi/PublicProviderConf"]');

    expect(projectLink).toBeTruthy();
    expect(projectLink?.textContent).toContain("dvaJi/PublicProviderConf");

    await fireEvent.click(projectLink!);

    expect(openExternal).toHaveBeenCalledWith("https://github.com/dvaJi/PublicProviderConf");
  });

  it("keeps reset data enabled when sync is disabled", async () => {
    const { container, syncStore } = await setup();

    syncStore.syncEnabled = false;
    await act(async () => {});

    expect(findResetEntryButton(container).hasAttribute("disabled")).toBe(false);
    expect(findResetConfirmButton(container).hasAttribute("disabled")).toBe(false);
  });

  it("disables reset actions during import and blocks the reset handler", async () => {
    const { container, syncStore, presenterMocks } = await setup();

    syncStore.isImporting = true;
    await act(async () => {});

    expect(findResetEntryButton(container).hasAttribute("disabled")).toBe(true);
    expect(findResetConfirmButton(container).hasAttribute("disabled")).toBe(true);

    await fireEvent.click(findResetConfirmButton(container));
    await act(async () => {});

    expect(presenterMocks.devicePresenter.resetDataByType).not.toHaveBeenCalled();
  });

  it("defaults reset type to chat when opening the reset dialog", async () => {
    const { container, presenterMocks } = await setup();

    await fireEvent.click(screen.getByTestId("danger-zone-reset-option-all"));
    await fireEvent.click(findResetEntryButton(container));
    await fireEvent.click(findResetConfirmButton(container));
    await act(async () => {});

    expect(presenterMocks.devicePresenter.resetDataByType).toHaveBeenCalledWith("chat");
  });

  it("calls resetDataByType with the selected dialog reset type", async () => {
    const { container, presenterMocks } = await setup();

    await fireEvent.click(findResetEntryButton(container));
    await fireEvent.click(screen.getByTestId("danger-zone-reset-option-knowledge"));
    await fireEvent.click(findResetConfirmButton(container));
    await act(async () => {});

    expect(presenterMocks.devicePresenter.resetDataByType).toHaveBeenCalledWith("knowledge");
  });
});
