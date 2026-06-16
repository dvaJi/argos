import type { JsonValue } from "@shared/contracts/common";
import type { PluginActionResult, PluginSettingsApiStatus } from "@shared/types/plugin";

export interface ArgosPluginSettingsApi {
  getPluginId(): string;
  getStatus(): Promise<PluginSettingsApiStatus>;
  enable(): Promise<PluginActionResult>;
  disable(): Promise<PluginActionResult>;
  invokeAction(actionId: string, payload?: JsonValue): Promise<PluginActionResult>;
}

declare global {
  interface Window {
    argosPlugin: ArgosPluginSettingsApi;
  }
}
