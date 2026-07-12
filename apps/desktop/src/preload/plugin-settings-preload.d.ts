import type { JsonValue } from "@argos/shared-contracts/common";
import type { PluginActionResult, PluginSettingsApiStatus } from "@argos/shared/types/plugin";

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
