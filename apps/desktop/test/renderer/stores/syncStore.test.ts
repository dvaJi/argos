import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  startBackup: vi.fn(),
  listBackups: vi.fn(),
}));

vi.mock("#api/SyncClient", () => ({
  createSyncClient: () => ({
    startBackup: mocks.startBackup,
    listBackups: mocks.listBackups,
    onBackupStarted: vi.fn(),
    onBackupCompleted: vi.fn(),
    onBackupError: vi.fn(),
    onImportStarted: vi.fn(),
    onImportCompleted: vi.fn(),
    onImportError: vi.fn(),
  }),
}));

vi.mock("#api/ConfigClient", () => ({
  createConfigClient: () => ({}),
}));

vi.mock("#api/DeviceClient", () => ({
  createDeviceClient: () => ({}),
}));

describe("sync store backup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rethrows backup errors for Data & Privacy to display", async () => {
    const { startBackup, syncStore } = await import("#/stores/sync");
    syncStore.setState((state) => ({ ...state, syncEnabled: true, isBackingUp: false }));
    mocks.startBackup.mockRejectedValueOnce(new Error("backup directory unavailable"));

    await expect(startBackup()).rejects.toThrow("backup directory unavailable");
    expect(syncStore.state.isBackingUp).toBe(false);
  });
});
