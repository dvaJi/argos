import type { MCPServerConfig } from "@argos/shared/presenter";
import type {
  PluginOwnedServerRegistration,
  PluginRuntimeLaunchContext,
  PluginRuntimeStartReason,
} from "@argos/backend-core";
import { ServerManager } from "./serverManager";

export type PluginRuntimeQuarantineRecord = {
  pluginId: string;
  serverName: string;
  reason: string;
  quarantinedAt: number;
};

export type PluginRuntimeServerStatus = {
  serverName: string;
  pluginId: string;
  startMode: PluginOwnedServerRegistration["startMode"];
  running: boolean;
  lifecycleState: "registered" | "starting" | "running" | "stopping" | "stopped" | "quarantined" | "error";
  quarantinedAt?: number;
  integrityError?: string;
  lastError?: string;
};

export class PluginRuntimeRegistry {
  private readonly registrations = new Map<string, PluginOwnedServerRegistration>();
  private readonly startPromises = new Map<string, Promise<void>>();
  private readonly quarantines = new Map<string, PluginRuntimeQuarantineRecord>();
  private readonly launchContexts = new Map<string, PluginRuntimeLaunchContext>();
  private lastErrors = new Map<string, string>();

  constructor(private readonly serverManager: ServerManager) {}

  registerServer(registration: PluginOwnedServerRegistration): void {
    if (registration.startMode === "onDemand") {
      const surfaces = registration.surfaces ?? [];
      if (surfaces.length !== 1 || surfaces[0] !== "tools" || !registration.toolCatalog) {
        throw new Error(
          `Plugin MCP server "${registration.serverName}" uses startMode "onDemand" and requires a tools-only static catalog`,
        );
      }
    }
    this.registrations.set(registration.serverName, registration);
    this.quarantines.delete(registration.serverName);
    this.lastErrors.delete(registration.serverName);
  }

  unregisterServer(serverName: string): void {
    this.registrations.delete(serverName);
    this.quarantines.delete(serverName);
    this.lastErrors.delete(serverName);
    this.launchContexts.delete(serverName);
  }

  unregisterByOwner(pluginId: string): void {
    for (const registration of this.registrations.values()) {
      if (registration.pluginId === pluginId) {
        this.unregisterServer(registration.serverName);
      }
    }
  }

  getRegistration(serverName: string): PluginOwnedServerRegistration | undefined {
    return this.registrations.get(serverName);
  }

  isOnDemand(serverName: string): boolean {
    return this.registrations.get(serverName)?.startMode === "onDemand";
  }

  getQuarantine(serverName: string): PluginRuntimeQuarantineRecord | undefined {
    return this.quarantines.get(serverName);
  }

  getOwnerPluginId(serverName: string): string | undefined {
    return this.registrations.get(serverName)?.pluginId;
  }

  ownsServer(serverName: string): boolean {
    return this.registrations.has(serverName);
  }

  getAvailableToolCatalogs(): PluginOwnedServerRegistration[] {
    return [...this.registrations.values()].filter(
      (registration) =>
        registration.startMode === "onDemand" &&
        Boolean(registration.toolCatalog) &&
        !this.quarantines.has(registration.serverName) &&
        !this.serverManager.isServerRunning(registration.serverName),
    );
  }

  getStatuses(): PluginRuntimeServerStatus[] {
    return [...this.registrations.values()].map((registration) => {
      const running = this.serverManager.isServerRunning(registration.serverName);
      const quarantine = this.quarantines.get(registration.serverName);
      const lastError = this.lastErrors.get(registration.serverName);
      const lifecycleState: PluginRuntimeServerStatus["lifecycleState"] = quarantine
        ? "quarantined"
        : this.startPromises.has(registration.serverName)
          ? "starting"
          : running
            ? "running"
            : "registered";
      return {
        serverName: registration.serverName,
        pluginId: registration.pluginId,
        startMode: registration.startMode,
        running,
        lifecycleState,
        quarantinedAt: quarantine?.quarantinedAt,
        integrityError: quarantine?.reason,
        lastError,
      };
    });
  }

  isServerAvailable(serverName: string): boolean {
    const registration = this.registrations.get(serverName);
    return Boolean(registration) && !this.quarantines.has(serverName);
  }

  async ensureRunning(serverName: string, reason: PluginRuntimeStartReason): Promise<void> {
    const registration = this.registrations.get(serverName);
    if (!registration) {
      throw new Error(`MCP server "${serverName}" is not owned by a plugin runtime`);
    }
    if (this.serverManager.isServerRunning(serverName)) {
      return;
    }
    const existing = this.startPromises.get(serverName);
    if (existing) {
      return await existing;
    }
    const promise = this.startEntry(registration, reason).finally(() => {
      this.startPromises.delete(serverName);
    });
    this.startPromises.set(serverName, promise);
    return await promise;
  }

  async testRuntime(serverName: string): Promise<void> {
    const registration = this.registrations.get(serverName);
    if (!registration || registration.startMode !== "onDemand") {
      throw new Error(`MCP server "${serverName}" is not an on-demand plugin runtime`);
    }
    const wasRunning = this.serverManager.isServerRunning(serverName);
    await this.ensureRunning(serverName, "runtime-test");
    if (!wasRunning) {
      await this.stopServer(serverName);
    }
  }

  async stopServer(serverName: string): Promise<void> {
    const registration = this.registrations.get(serverName);
    if (this.serverManager.isServerRunning(serverName)) {
      await this.serverManager.stopServer(serverName);
    }
    if (registration?.adapter) {
      await registration.adapter.stop();
    }
  }

  async stopByOwner(pluginId: string): Promise<void> {
    for (const registration of this.registrations.values()) {
      if (registration.pluginId === pluginId) {
        await this.stopServer(registration.serverName);
      }
    }
  }

  async recoverStaleLaunch(serverName: string): Promise<void> {
    const registration = this.registrations.get(serverName);
    const context = this.launchContexts.get(serverName);
    if (!registration?.adapter?.recoverStaleLaunch || !context?.endpoint) {
      return;
    }
    await registration.adapter.recoverStaleLaunch(context);
    this.launchContexts.delete(serverName);
  }

  private async startEntry(
    registration: PluginOwnedServerRegistration,
    reason: PluginRuntimeStartReason,
  ): Promise<void> {
    const quarantine = this.quarantines.get(registration.serverName);
    if (quarantine) {
      throw new Error(
        `Plugin runtime "${registration.serverName}" is quarantined (${quarantine.reason}); repair or reinstall the plugin`,
      );
    }

    let configOverride: Partial<MCPServerConfig> | undefined;
    if (registration.launchGuard && registration.adapter) {
      try {
        await registration.launchGuard.verify();
      } catch (error) {
        this.quarantine(registration, error);
        throw error;
      }
      try {
        const start = await registration.adapter.start(reason, {
          updateLaunchContext: (patch) => this.updateLaunchContext(registration.serverName, patch),
        });
        configOverride = start.configOverride;
      } catch (error) {
        this.lastErrors.set(registration.serverName, error instanceof Error ? error.message : String(error));
        throw error;
      }
      try {
        await registration.launchGuard.verify();
      } catch (error) {
        try {
          await registration.adapter.stop();
        } catch (stopError) {
          console.error(`Failed to stop CUA adapter after integrity failure for "${registration.serverName}":`, stopError);
        }
        this.quarantine(registration, error);
        throw error;
      }
    }

    try {
      await this.serverManager.startServer(registration.serverName, configOverride);
    } catch (error) {
      this.lastErrors.set(registration.serverName, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private quarantine(registration: PluginOwnedServerRegistration, error: unknown): void {
    const reason = error instanceof Error ? error.message : String(error);
    this.quarantines.set(registration.serverName, {
      pluginId: registration.pluginId,
      serverName: registration.serverName,
      reason,
      quarantinedAt: Date.now(),
    });
  }

  private updateLaunchContext(serverName: string, patch: PluginRuntimeLaunchContext): void {
    const current = this.launchContexts.get(serverName) ?? {};
    this.launchContexts.set(serverName, { ...current, ...patch });
  }
}
