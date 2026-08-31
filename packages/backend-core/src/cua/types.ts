import type { MCPServerConfig } from "@argos/shared/presenter";

export type PluginRuntimeStartReason =
  | "reconcile"
  | "tool"
  | "runtime-test"
  | "authentication"
  | "configuration"
  | "external";

export type PluginRuntimeFingerprint = {
  value: string;
  pluginId: string;
  runtimeId: string;
  target: string;
  binarySha256: string;
};

export type PluginRuntimeLaunchContext = {
  endpoint?: string;
  daemonPid?: string;
  endpointDevice?: string;
  endpointInode?: string;
};

export type PluginRuntimeSafetyHooks = {
  updateLaunchContext(patch: PluginRuntimeLaunchContext): void;
};

export type PluginRuntimeStartResult = {
  configOverride?: Partial<MCPServerConfig>;
};

export interface PluginRuntimeAdapterInstance {
  start(reason: PluginRuntimeStartReason, safetyHooks?: PluginRuntimeSafetyHooks): Promise<PluginRuntimeStartResult>;
  stop(): Promise<void>;
  recoverStaleLaunch?(context: PluginRuntimeLaunchContext): Promise<void>;
}

export type PluginRuntimeLaunchGuard = {
  verify(): Promise<PluginRuntimeFingerprint>;
};

export type PluginToolCatalogTool = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly annotations: {
    readonly readOnlyHint: boolean;
    readonly destructiveHint: boolean;
    readonly idempotentHint: boolean;
  };
};

export type PluginToolCatalog = {
  readonly version: string;
  readonly tools: readonly PluginToolCatalogTool[];
};

export type PluginOwnedServerRegistration = {
  pluginId: string;
  serverName: string;
  displayName?: string;
  runtimeId?: string;
  startMode: "eager" | "onDemand";
  surfaces: Array<"tools" | "prompts" | "resources">;
  toolCatalog?: PluginToolCatalog;
  adapter?: PluginRuntimeAdapterInstance;
  launchGuard?: PluginRuntimeLaunchGuard;
};
