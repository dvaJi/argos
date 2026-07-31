import type { ArgosBridge } from "@argos/shared-contracts/bridge";
import { windowStateChangedEvent } from "@argos/shared-contracts/events";
import {
  windowCloseCurrentRoute,
  windowCloseFloatingCurrentRoute,
  windowGetCurrentStateRoute,
  windowMinimizeCurrentRoute,
  windowPreviewFileRoute,
  windowToggleMaximizeCurrentRoute,
  systemConsumePendingProviderInstallRoute,
  systemSetPendingProviderInstallRoute,
} from "@argos/shared-contracts/routes";
import { getArgosBridge } from "./core";
import { getRuntimeWindowId } from "./runtime";
import type { ProviderInstallPreview } from "@argos/shared/presenter";

export function createWindowClient(bridge: ArgosBridge = getArgosBridge()) {
  async function getCurrentState() {
    const result = await bridge.invoke(windowGetCurrentStateRoute.name, {});
    return result.state;
  }

  async function minimizeCurrent() {
    const result = await bridge.invoke(windowMinimizeCurrentRoute.name, {});
    return result.state;
  }

  async function toggleMaximizeCurrent() {
    const result = await bridge.invoke(windowToggleMaximizeCurrentRoute.name, {});
    return result.state;
  }

  async function closeCurrent() {
    return await bridge.invoke(windowCloseCurrentRoute.name, {});
  }

  async function closeFloatingCurrent() {
    return await bridge.invoke(windowCloseFloatingCurrentRoute.name, {});
  }

  async function previewFile(filePath: string) {
    return await bridge.invoke(windowPreviewFileRoute.name, { filePath });
  }

  async function consumePendingSettingsProviderInstall(): Promise<ProviderInstallPreview | null> {
    const result = await bridge.invoke(systemConsumePendingProviderInstallRoute.name, {});
    return result.preview;
  }

  async function setPendingSettingsProviderInstall(preview: ProviderInstallPreview): Promise<void> {
    await bridge.invoke(systemSetPendingProviderInstallRoute.name, { preview });
  }

  function onStateChanged(
    listener: (payload: {
      windowId: number | null;
      exists: boolean;
      isMaximized: boolean;
      isFullScreen: boolean;
      isFocused: boolean;
      version: number;
    }) => void,
  ) {
    return bridge.on(windowStateChangedEvent.name, listener);
  }

  function onCurrentStateChanged(
    listener: (payload: {
      windowId: number | null;
      exists: boolean;
      isMaximized: boolean;
      isFullScreen: boolean;
      isFocused: boolean;
      version: number;
    }) => void,
  ) {
    const currentWindowId = getRuntimeWindowId();

    return onStateChanged((payload) => {
      if (currentWindowId != null && payload.windowId !== currentWindowId) {
        return;
      }

      listener(payload);
    });
  }

  return {
    getCurrentState,
    minimizeCurrent,
    toggleMaximizeCurrent,
    closeCurrent,
    closeFloatingCurrent,
    previewFile,
    consumePendingSettingsProviderInstall,
    setPendingSettingsProviderInstall,
    onStateChanged,
    onCurrentStateChanged,
  };
}

type WindowClient = ReturnType<typeof createWindowClient>;
