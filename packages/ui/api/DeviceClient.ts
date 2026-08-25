import type { ArgosBridge } from "@argos/shared-contracts/bridge";
import {
  deviceGetAppVersionRoute,
  deviceGetInfoRoute,
  deviceRestartAppRoute,
  deviceSanitizeSvgRoute,
  deviceSelectDirectoryRoute,
  deviceSelectFilesRoute,
  deviceResetDataByTypeRoute,
} from "@argos/shared-contracts/routes";
import { getArgosBridge } from "./core";
import { copyRuntimeImage, copyRuntimeText, readRuntimeClipboardText } from "./runtime";

export function createDeviceClient(bridge: ArgosBridge = getArgosBridge()) {
  async function getAppVersion() {
    const result = await bridge.invoke(deviceGetAppVersionRoute.name, {});
    return result.version;
  }

  async function getDeviceInfo() {
    const result = await bridge.invoke(deviceGetInfoRoute.name, {});
    return result.info;
  }

  async function selectDirectory() {
    return await bridge.invoke(deviceSelectDirectoryRoute.name, {});
  }

  async function selectFiles(options?: { filters?: { name: string; extensions: string[] }[]; multiple?: boolean }) {
    return await bridge.invoke(deviceSelectFilesRoute.name, options ?? {});
  }

  async function resetDataByType(type: "chat" | "knowledge" | "config" | "all") {
    const result = await bridge.invoke(deviceResetDataByTypeRoute.name, { types: [type] });
    return result.success;
  }

  async function restartApp() {
    return await bridge.invoke(deviceRestartAppRoute.name, {});
  }

  async function sanitizeSvgContent(svgContent: string) {
    const result = await bridge.invoke(deviceSanitizeSvgRoute.name, { svgContent });
    return result.content;
  }

  function copyText(text: string): void {
    copyRuntimeText(text);
  }

  function copyImage(image: string): void {
    copyRuntimeImage(image);
  }

  function readClipboardText(): string {
    return readRuntimeClipboardText();
  }

  return {
    getAppVersion,
    getDeviceInfo,
    selectDirectory,
    selectFiles,
    resetDataByType,
    restartApp,
    sanitizeSvgContent,
    copyText,
    copyImage,
    readClipboardText,
  };
}

type DeviceClient = ReturnType<typeof createDeviceClient>;
