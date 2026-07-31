import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";
import { createDeviceClient } from "#api/DeviceClient";
import { createUpgradeClient } from "#api/UpgradeClient";

type PresenterUpdateStatus = "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error" | null;

type UpdateState = "idle" | "checking" | "available" | "downloading" | "ready_to_install" | "error";

type UpdateInfo = {
  version: string;
  releaseDate: string;
  releaseNotes: string;
  githubUrl?: string;
  downloadUrl?: string;
  isMock?: boolean;
};

type ProgressInfo = {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
};

type PresenterStatusSnapshot = {
  status: PresenterUpdateStatus;
  progress: ProgressInfo | null;
  error: string | null;
  updateInfo: UpdateInfo | null;
};

const DEFAULT_UPDATE_ERROR = "Update error";

const toUpdateInfo = (info: UpdateInfo | null | undefined): UpdateInfo | null => {
  if (!info) return null;

  return {
    version: info.version,
    releaseDate: info.releaseDate,
    releaseNotes: info.releaseNotes,
    githubUrl: info.githubUrl,
    downloadUrl: info.downloadUrl,
    isMock: info.isMock,
  };
};

const toProgressInfo = (progress: ProgressInfo | null | undefined): ProgressInfo | null => {
  if (!progress) return null;

  return {
    percent: progress.percent,
    bytesPerSecond: progress.bytesPerSecond,
    transferred: progress.transferred,
    total: progress.total,
  };
};

interface UpgradeState {
  rawStatus: PresenterUpdateStatus;
  updateInfo: UpdateInfo | null;
  isUpdating: boolean;
  updateProgress: ProgressInfo | null;
  isRestarting: boolean;
  updateError: string | null;
  isSilent: boolean;
  platform: string | null;
  listenersReady: boolean;
}

const upgradeClient = createUpgradeClient();
const deviceClient = createDeviceClient();
let externalMutationToken = 0;
let latestSyncRequestId = 0;

const upgradeStore = new Store<UpgradeState>({
  rawStatus: null,
  updateInfo: null,
  isUpdating: false,
  updateProgress: null,
  isRestarting: false,
  updateError: null,
  isSilent: true,
  platform: null,
  listenersReady: false,
});

const isWindows = () => upgradeStore.state.platform === "win32";

const hasUpdate = () => Boolean(upgradeStore.state.updateInfo);

const isMockUpdate = () => Boolean(upgradeStore.state.updateInfo?.isMock);

const getUpdateState = (): UpdateState => {
  const { rawStatus, updateInfo } = upgradeStore.state;
  switch (rawStatus) {
    case "checking":
      return "checking";
    case "available":
      return "available";
    case "downloading":
      return "downloading";
    case "downloaded":
      return "ready_to_install";
    case "error":
      return updateInfo ? "error" : "idle";
    default:
      return "idle";
  }
};

const isChecking = () => getUpdateState() === "checking";
const isDownloading = () => getUpdateState() === "downloading";
const isReadyToInstall = () => getUpdateState() === "ready_to_install";
const shouldShowUpdateNotes = () => hasUpdate();
const shouldShowTopbarInstallButton = () => isReadyToInstall();
const showManualDownloadOptions = () =>
  upgradeStore.state.rawStatus === "error" && Boolean(upgradeStore.state.updateInfo);

const applyProgress = (
  progress?: ProgressInfo | null,
  source: "external" | "sync" = "external",
  mutationToken = externalMutationToken,
) => {
  if (source === "external") {
    externalMutationToken += 1;
  } else if (mutationToken !== externalMutationToken) {
    return;
  }

  upgradeStore.setState((prev) => ({ ...prev, updateProgress: toProgressInfo(progress) }));
};

const syncFromPresenterStatus = async (): Promise<PresenterUpdateStatus> => {
  const requestId = ++latestSyncRequestId;
  const mutationTokenBeforeRequest = externalMutationToken;
  try {
    const snapshot = (await upgradeClient.getUpdateStatus()) as PresenterStatusSnapshot | null;

    if (!snapshot || snapshot.status == null) {
      return upgradeStore.state.rawStatus;
    }

    if (requestId !== latestSyncRequestId || externalMutationToken !== mutationTokenBeforeRequest) {
      return upgradeStore.state.rawStatus;
    }

    applyStatus(snapshot.status, snapshot.updateInfo, snapshot.error, "sync");
    applyProgress(snapshot.progress, "sync", mutationTokenBeforeRequest);
    return snapshot.status;
  } catch (error) {
    console.error("Failed to sync update status:", error);
    return upgradeStore.state.rawStatus;
  }
};

const applyStatus = (
  status: PresenterUpdateStatus,
  info?: UpdateInfo | null,
  error?: string | null,
  source: "external" | "sync" = "external",
) => {
  if (source === "external") {
    externalMutationToken += 1;
  }

  const s = upgradeStore.state;
  const baseUpdate = {
    rawStatus: status,
    updateInfo: info !== undefined ? toUpdateInfo(info) : s.updateInfo,
  };

  if (status === "checking") {
    upgradeStore.setState((prev) => ({
      ...prev,
      ...baseUpdate,
      updateError: null,
      updateProgress: null,
      isRestarting: false,
    }));
    return;
  }

  if (status === "not-available") {
    upgradeStore.setState((prev) => ({
      ...prev,
      rawStatus: status,
      updateInfo: null,
      updateError: null,
      updateProgress: null,
      isRestarting: false,
    }));
    return;
  }

  if (status === "available") {
    upgradeStore.setState((prev) => ({
      ...prev,
      ...baseUpdate,
      updateError: null,
      updateProgress: null,
      isRestarting: false,
    }));
    return;
  }

  if (status === "downloading") {
    upgradeStore.setState((prev) => ({
      ...prev,
      ...baseUpdate,
      updateError: null,
      isRestarting: false,
    }));
    return;
  }

  if (status === "downloaded") {
    upgradeStore.setState((prev) => ({
      ...prev,
      ...baseUpdate,
      updateError: null,
      isRestarting: false,
    }));
    return;
  }

  if (status === "error") {
    upgradeStore.setState((prev) => ({
      ...prev,
      ...baseUpdate,
      updateError: error || DEFAULT_UPDATE_ERROR,
      isRestarting: false,
    }));
    return;
  }

  upgradeStore.setState((prev) => ({ ...prev, ...baseUpdate }));
};

const loadDeviceInfo = async () => {
  try {
    const deviceInfo = await deviceClient.getDeviceInfo();
    upgradeStore.setState((prev) => ({ ...prev, platform: deviceInfo?.platform ?? null }));
  } catch (error) {
    console.error("Failed to load device info:", error);
  }
};

void loadDeviceInfo();

const checkUpdate = async (silent = true) => {
  upgradeStore.setState((prev) => ({ ...prev, isSilent: silent }));
  if (isChecking()) return upgradeStore.state.rawStatus;

  try {
    applyStatus("checking", upgradeStore.state.updateInfo, null);
    await upgradeClient.checkUpdate();
    return await syncFromPresenterStatus();
  } catch (error) {
    console.error("Failed to check update:", error);
    applyStatus("error", upgradeStore.state.updateInfo, error instanceof Error ? error.message : String(error));
    return "error";
  }
};

const startUpdate = async (type: "github" | "official") => {
  try {
    return await upgradeClient.goDownloadUpgrade(type);
  } catch (error) {
    console.error("Failed to start update:", error);
    return false;
  }
};

const mockDownloadedUpdate = async () => {
  try {
    const success = await upgradeClient.mockDownloadedUpdate();
    if (!success) {
      return upgradeStore.state.rawStatus;
    }

    return await syncFromPresenterStatus();
  } catch (error) {
    console.error("Failed to mock downloaded update:", error);
    applyStatus("error", upgradeStore.state.updateInfo, error instanceof Error ? error.message : String(error));
    return "error";
  }
};

const clearMockUpdate = async () => {
  try {
    const success = await upgradeClient.clearMockUpdate();
    if (!success) {
      return upgradeStore.state.rawStatus;
    }

    return await syncFromPresenterStatus();
  } catch (error) {
    console.error("Failed to clear mock update:", error);
    applyStatus("error", upgradeStore.state.updateInfo, error instanceof Error ? error.message : String(error));
    return "error";
  }
};

const handleUpdate = async (type: "github" | "official" | "auto") => {
  upgradeStore.setState((prev) => ({ ...prev, isUpdating: true }));
  try {
    if (isReadyToInstall()) {
      await upgradeClient.restartToUpdate();
      return;
    }

    if (isDownloading()) {
      return;
    }

    if (type === "auto") {
      const success = await upgradeClient.startDownloadUpdate();
      if (!success) {
        applyStatus("error", upgradeStore.state.updateInfo, upgradeStore.state.updateError);
      }
      return;
    }

    await startUpdate(type);
  } catch (error) {
    console.error("Update failed:", error);
    applyStatus("error", upgradeStore.state.updateInfo, error instanceof Error ? error.message : String(error));
  } finally {
    upgradeStore.setState((prev) => ({ ...prev, isUpdating: false }));
  }
};

const handleStatusChanged = (_: unknown, event: Record<string, any>) => {
  const { status, info, error } = event;
  applyStatus(status as PresenterUpdateStatus, info, error);
};

const handleProgress = (_: unknown, progressData: Record<string, any>) => {
  applyProgress(
    progressData
      ? {
          percent: progressData.percent || 0,
          bytesPerSecond: progressData.bytesPerSecond || 0,
          transferred: progressData.transferred || 0,
          total: progressData.total || 0,
        }
      : null,
  );
};

const handleWillRestart = () => {
  upgradeStore.setState((prev) => ({ ...prev, isRestarting: true }));
};

const handleError = (_: unknown, errorData: Record<string, any>) => {
  applyStatus(
    upgradeStore.state.updateInfo ? "error" : null,
    upgradeStore.state.updateInfo,
    errorData?.error || DEFAULT_UPDATE_ERROR,
  );
};

const setupUpdateListener = () => {
  if (upgradeStore.state.listenersReady) {
    return;
  }

  upgradeStore.setState((prev) => ({ ...prev, listenersReady: true }));
  upgradeClient.onStatusChanged((event) => handleStatusChanged(undefined, event));
  upgradeClient.onProgress((event) => handleProgress(undefined, event));
  upgradeClient.onWillRestart(handleWillRestart);
  upgradeClient.onError((event) => handleError(undefined, event));
};

setupUpdateListener();
void syncFromPresenterStatus().catch((error) => {
  console.error("Failed to sync update status:", error);
});

export function useUpgradeStore() {
  const state = useStore(upgradeStore);
  return {
    ...state,
    isWindows,
    hasUpdate,
    isMockUpdate,
    getUpdateState,
    isChecking,
    isDownloading,
    isReadyToInstall,
    shouldShowUpdateNotes,
    shouldShowTopbarInstallButton,
    showManualDownloadOptions,
    syncFromPresenterStatus,
    applyStatus,
    checkUpdate,
    startUpdate,
    mockDownloadedUpdate,
    clearMockUpdate,
    handleUpdate,
    refreshStatus: syncFromPresenterStatus,
  };
}
