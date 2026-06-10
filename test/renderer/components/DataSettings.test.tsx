import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";

const setup = async (
  options: {
    databaseSecurityGetStatus?: ReturnType<typeof vi.fn>;
  } = {},
) => {
  vi.resetModules();

  const toast = vi.fn();
  const openExternal = vi.fn();
  const syncStore = {
    syncEnabled: true,
    syncFolderPath: "/tmp/deepchat-sync",
    lastSyncTime: 0,
    isBackingUp: false,
    isImporting: false,
    importResult: null,
    backups: [] as Array<{ fileName: string; createdAt: number; size: number }>,
    initialize: vi.fn().mockResolvedValue(undefined),
    selectSyncFolder: vi.fn(),
    openSyncFolder: vi.fn(),
    refreshBackups: vi.fn().mockResolvedValue(undefined),
    startBackup: vi.fn().mockResolvedValue(null),
    importData: vi.fn().mockResolvedValue(null),
    clearImportResult: vi.fn(),
    setSyncEnabled: vi.fn(),
    setSyncFolderPath: vi.fn(),
  };
  const uiSettingsStore = {
    privacyModeEnabled: false,
    setPrivacyModeEnabled: vi.fn((value: boolean) => {
      uiSettingsStore.privacyModeEnabled = value;
      return Promise.resolve();
    }),
  };
  const databaseSecurityClient = {
    getStatus:
      options.databaseSecurityGetStatus ??
      vi.fn().mockResolvedValue({
        enabled: false,
        cipher: "sqlcipher",
        safeStorageAvailable: true,
        safeStorageBackend: undefined,
        passwordStorage: "none",
        manualUnlockRequired: false,
        migrationInProgress: false,
        lastMigrationAt: undefined,
      }),
    enable: vi.fn().mockResolvedValue({
      enabled: true,
      cipher: "sqlcipher",
      safeStorageAvailable: true,
      safeStorageBackend: undefined,
      passwordStorage: "safeStorage",
      manualUnlockRequired: false,
      migrationInProgress: false,
      lastMigrationAt: Date.now(),
    }),
    changePassword: vi.fn(),
    disable: vi.fn(),
  };

  const presenterMocks = {
    configPresenter: {
      refreshProviderDb: vi.fn().mockResolvedValue({
        status: "updated",
        lastUpdated: Date.now(),
        providersCount: 1,
      }),
    },
    sqlitePresenter: {
      repairSchema: vi.fn().mockResolvedValue({
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
    },
    devicePresenter: {
      resetDataByType: vi.fn().mockResolvedValue(undefined),
    },
    yoBrowserPresenter: {
      clearSandboxData: vi.fn().mockResolvedValue(undefined),
    },
  };

  vi.doMock("@/stores/sync", () => ({
    useSyncStore: () => syncStore,
  }));
  vi.doMock("@/stores/uiSettingsStore", () => ({
    useUiSettingsStore: () => uiSettingsStore,
  }));
  vi.doMock("@/stores/language", () => ({
    useLanguageStore: () => ({
      dir: "ltr",
    }),
  }));
  vi.doMock("@api/legacy/presenters", () => ({
    useLegacyPresenter: (name: keyof typeof presenterMocks) => presenterMocks[name],
  }));
  vi.doMock("@api/DatabaseSecurityClient", () => ({
    createDatabaseSecurityClient: () => databaseSecurityClient,
  }));
  vi.doMock("@/components/use-toast", () => ({
    useToast: () => ({
      toast,
    }),
  }));
  (window as typeof window & { api: { openExternal: typeof openExternal } }).api = {
    openExternal,
  };

  const DataSettings = (await import("../../../src/renderer/settings/components/DataSettings")).default;

  const result = render(<DataSettings />);

  await act(async () => {});

  return {
    ...result,
    openExternal,
    toast,
    syncStore,
    uiSettingsStore,
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

const findDatabaseEncryptionButton = (container: HTMLElement, text: string) =>
  findButtonByText(container, text, "Database encryption");

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
    expect(container.textContent).toContain("settings.data.databaseEncryption.title");
    expect(container.textContent).toContain("settings.data.modelConfigUpdate.title");
    expect(container.textContent).toContain("settings.data.dangerZone.title");
    expect(container.textContent).toContain("settings.data.resetChatData");
    expect(container.textContent).toContain("settings.data.resetKnowledgeData");
    expect(container.textContent).toContain("settings.data.resetConfig");
    expect(container.textContent).toContain("settings.data.resetAll");
    expect(container.textContent).toContain("settings.data.yoBrowser.title");
    expect(container.textContent).toContain("settings.data.databaseEncryption.systemCredentialStore");
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
    const { uiSettingsStore } = await setup();

    await fireEvent.click(screen.getByTestId("privacy-mode-switch"));

    expect(uiSettingsStore.setPrivacyModeEnabled).toHaveBeenCalledWith(true);
  });

  it("wires the privacy switch to its visible label and description", async () => {
    const { container } = await setup();

    const privacySwitch = screen.getByTestId("privacy-mode-switch");

    expect(privacySwitch.getAttribute("aria-labelledby")).toBe("privacy-mode-label");
    expect(privacySwitch.getAttribute("aria-describedby")).toBe("privacy-mode-desc");
    expect(container.querySelector("#privacy-mode-label")?.textContent).toContain("Privacy Mode");
    expect(container.querySelector("#privacy-mode-desc")?.textContent).toContain(
      "Stop automatic outbound requests owned by DeepChat:",
    );
  });

  it("enables database encryption after matching password input", async () => {
    const { container, databaseSecurityClient, toast } = await setup();
    await fireEvent.click(
      findDatabaseEncryptionButton(container, "settings.data.databaseEncryption.setPasswordButton"),
    );
    await act(async () => {});

    const inputs = screen.getAllByDisplayValue("").filter((el) => (el as HTMLInputElement).type === "password");
    expect(inputs).toHaveLength(2);

    fireEvent.change(inputs[0], { target: { value: "sqlite-pass" } });
    fireEvent.change(inputs[1], { target: { value: "sqlite-pass" } });
    await fireEvent.click(findDatabaseEncryptionButton(container, "settings.data.databaseEncryption.enableButton"));
    await act(async () => {});

    expect(databaseSecurityClient.enable).toHaveBeenCalledWith("sqlite-pass");
    expect(toast).toHaveBeenCalledWith({
      title: "settings.data.databaseEncryption.enabledTitle",
      duration: 4000,
    });
  });

  it("shows database encryption status as unknown when status loading fails", async () => {
    const { container } = await setup({
      databaseSecurityGetStatus: vi.fn().mockRejectedValue(new Error("status unavailable")),
    });

    expect(container.textContent).toContain("settings.data.databaseEncryption.unknown");
    expect(container.textContent).not.toContain("settings.data.databaseEncryption.disabled");
    expect(container.textContent).not.toContain("settings.data.databaseEncryption.notRequired");
    const buttons = Array.from(container.querySelectorAll("button"));
    expect(
      buttons.some((button) => button.textContent?.includes("settings.data.databaseEncryption.setPasswordButton")),
    ).toBe(false);
  });

  it("shows an error toast when updating privacy mode fails", async () => {
    const { toast, uiSettingsStore } = await setup();

    uiSettingsStore.setPrivacyModeEnabled = vi.fn().mockRejectedValue(new Error("IPC failed"));

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
    const { container, toast, presenterMocks } = await setup();

    await fireEvent.click(findRepairButton(container));
    await act(async () => {});

    expect(presenterMocks.sqlitePresenter.repairSchema).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith({
      title: "settings.data.databaseRepair.toastHealthyTitle",
      description: "settings.data.databaseRepair.toastHealthyDescription",
      variant: "default",
    });
  });

  it("disables schema repair during backup and blocks both click and auto-run paths", async () => {
    const { container, syncStore, presenterMocks } = await setup();

    syncStore.isBackingUp = true;
    await act(async () => {});

    expect(findRepairButton(container).hasAttribute("disabled")).toBe(true);

    window.dispatchEvent(
      new CustomEvent("deepchat:settings-section", {
        detail: { section: "database-repair" },
      }),
    );
    await act(async () => {});

    expect(presenterMocks.sqlitePresenter.repairSchema).not.toHaveBeenCalled();
  });

  it("renders repair summary and manual hint after a repair run with remaining issues", async () => {
    const { container, presenterMocks } = await setup();

    presenterMocks.sqlitePresenter.repairSchema.mockResolvedValueOnce({
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
          table: "deepchat_sessions",
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

    const projectLink = container.querySelector('a[href="https://github.com/ThinkInAIXYZ/PublicProviderConf"]');

    expect(projectLink).toBeTruthy();
    expect(projectLink?.textContent).toContain("ThinkInAIXYZ/PublicProviderConf");

    await fireEvent.click(projectLink!);

    expect(openExternal).toHaveBeenCalledWith("https://github.com/ThinkInAIXYZ/PublicProviderConf");
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
