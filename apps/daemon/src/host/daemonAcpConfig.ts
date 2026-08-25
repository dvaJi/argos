import path from "node:path";
import type {
  AcpAgentConfig,
  AcpAgentInstallState,
  AcpAgentState,
  AcpManualAgent,
  AcpRegistryAgent,
  AcpResolvedLaunchSpec,
} from "@argos/shared/presenter";
import { resolveAcpAgentAlias, SVGSanitizer } from "@argos/backend-core";
import { AcpConfHelper, AcpLaunchSpecService, AcpRegistryService } from "@argos/acp-runtime";
import logger from "@argos/shared/logger";
import { createJsonStoreFactory } from "./jsonStoreFactory";

export interface DaemonAcpConfigDeps {
  /** Directory for JSON-backed config stores (the daemon config dir). */
  configDir: string;
  /** Directory for ACP registry cache + installed binaries (the daemon data dir). */
  dataDir: string;
  isPrivacyModeEnabled?: () => boolean;
  /** Returns whether the agent still has recorded ACP conversations (uninstall guard). */
  hasAcpAgentSessions?: (agentId: string) => boolean;
}

/**
 * Daemon-side ACP configuration facade. Owns the shared `AcpConfHelper`,
 * `AcpRegistryService`, and `AcpLaunchSpecService`, using `AcpConfHelper` as the
 * source of truth for agent state (the desktop additionally uses a SQLite agent
 * repository; the daemon does not need one for v1).
 */
export class DaemonAcpConfig {
  private readonly deps: DaemonAcpConfigDeps;
  private readonly acpConfHelper: AcpConfHelper;
  private readonly acpRegistryService: AcpRegistryService;
  private readonly acpLaunchSpecService: AcpLaunchSpecService;
  private readonly sanitizer = new SVGSanitizer();
  private reconcileInFlight: Promise<void> | null = null;
  /** Settles once the startup registry load + first agent reconciliation finished. */
  readonly initialReconcile: Promise<void>;

  constructor(deps: DaemonAcpConfigDeps) {
    this.deps = deps;
    this.acpConfHelper = new AcpConfHelper({ storeFactory: createJsonStoreFactory(deps.configDir) });
    this.acpRegistryService = new AcpRegistryService({
      userDataDir: () => deps.dataDir,
      sanitizeSvg: (svg) => this.sanitizer.sanitize(svg),
      isPrivacyModeEnabled: deps.isPrivacyModeEnabled,
    });
    this.acpLaunchSpecService = new AcpLaunchSpecService(path.join(deps.dataDir, "acp-registry"));
    this.initialReconcile = this.acpRegistryService
      .initialize()
      .then(() => this.reconcileInstalledAgents())
      .catch((error) => logger.warn("[ACP] daemon registry initialize failed:", error));
  }

  async getAcpEnabled(): Promise<boolean> {
    return this.acpConfHelper.getGlobalEnabled();
  }

  async setAcpEnabled(enabled: boolean): Promise<void> {
    this.acpConfHelper.setGlobalEnabled(enabled);
  }

  async listAcpRegistryAgents(): Promise<AcpRegistryAgent[]> {
    return this.acpRegistryService.listAgents().map((agent) => {
      const state = this.acpConfHelper.getRegistryStates()[agent.id];
      return {
        ...agent,
        enabled: state?.enabled ?? false,
        envOverride: state?.envOverride,
        installState: this.acpConfHelper.getInstallState(agent.id),
      };
    });
  }

  async refreshAcpRegistry(force = true): Promise<AcpRegistryAgent[]> {
    await this.acpRegistryService.refresh(force);
    await this.reconcileInstalledAgents();
    return this.listAcpRegistryAgents();
  }

  /**
   * Brings enabled registry agents in line with the freshly loaded catalog.
   *
   * Runner agents (npx/uvx) have no local copy — their recorded version simply
   * tracks the registry, otherwise a moving upstream keeps the "update
   * available" toast alive forever. Binary agents install the new version into
   * its own versioned directory; on failure the previous good state is kept so
   * a transient download error cannot wedge the agent.
   */
  async reconcileInstalledAgents(): Promise<void> {
    if (this.reconcileInFlight) {
      return this.reconcileInFlight;
    }

    this.reconcileInFlight = this.runReconcile().finally(() => {
      this.reconcileInFlight = null;
    });
    return this.reconcileInFlight;
  }

  private async runReconcile(): Promise<void> {
    const enabledIds = new Set(
      Object.entries(this.acpConfHelper.getRegistryStates())
        .filter(([, state]) => state.enabled)
        .map(([agentId]) => resolveAcpAgentAlias(agentId)),
    );
    if (enabledIds.size === 0) {
      return;
    }

    for (const agent of this.acpRegistryService.listAgents()) {
      if (!enabledIds.has(resolveAcpAgentAlias(agent.id))) {
        continue;
      }
      await this.reconcileAgent(agent);
    }
  }

  private async reconcileAgent(agent: AcpRegistryAgent): Promise<void> {
    const resolvedId = resolveAcpAgentAlias(agent.id);
    const selection = this.acpLaunchSpecService.selectRegistryDistribution(agent);
    if (!selection) {
      logger.debug(`[ACP Reconcile] ${resolvedId} has no compatible distribution; skipping`);
      return;
    }

    if (selection.type !== "binary") {
      // Runners resolve the latest package at launch time; only the recorded
      // version needs to track the registry.
      const current = this.acpConfHelper.getInstallState(resolvedId);
      if (current?.status === "installed" && current.version === agent.version && !current.error) {
        return;
      }
      logger.info(`[ACP Reconcile] ${resolvedId}: tracking registry v${agent.version} (${selection.type} runner)`);
      this.acpConfHelper.setInstallState(resolvedId, {
        status: "installed",
        distributionType: selection.type,
        version: agent.version,
        lastCheckedAt: Date.now(),
        installedAt: current?.installedAt ?? null,
        installDir: null,
        error: null,
      });
      return;
    }

    const current = this.acpConfHelper.getInstallState(resolvedId);
    if (!current || current.status === "not_installed") {
      // Never installed by the user; the explicit install flow owns first downloads.
      return;
    }
    if (current.version === agent.version && current.status === "installed" && !current.error) {
      return;
    }

    logger.info(`[ACP Reconcile] ${resolvedId}: updating binary v${current.version ?? "none"} → v${agent.version}`);
    const installed = await this.acpLaunchSpecService.ensureRegistryAgentInstalled(agent, current);
    if (installed.status === "installed") {
      this.acpConfHelper.setInstallState(resolvedId, installed);
      logger.info(`[ACP Reconcile] ${resolvedId}: now on v${agent.version}`);
      return;
    }

    // Keep the previous good state visible and usable; the next launch retries.
    logger.warn(`[ACP Reconcile] ${resolvedId}: update to v${agent.version} failed: ${installed.error}`);
  }

  async getAcpRegistryIconMarkup(agentId: string, iconUrl?: string): Promise<string | null> {
    return this.acpRegistryService.getIconMarkup(agentId, iconUrl);
  }

  async getAcpAgentState(agentId: string): Promise<AcpAgentState | null> {
    const resolvedId = resolveAcpAgentAlias(agentId);
    const state = this.acpConfHelper.getAgentState(resolvedId);
    return state ?? null;
  }

  async setAcpAgentEnabled(agentId: string, enabled: boolean): Promise<void> {
    this.acpConfHelper.setAgentEnabled(resolveAcpAgentAlias(agentId), enabled);
  }

  async setAcpAgentEnvOverride(agentId: string, env: Record<string, string>): Promise<void> {
    this.acpConfHelper.setAgentEnvOverride(resolveAcpAgentAlias(agentId), env);
  }

  async getAcpAgentInstallStatus(agentId: string): Promise<AcpAgentInstallState | null> {
    return this.acpConfHelper.getInstallState(resolveAcpAgentAlias(agentId));
  }

  async ensureAcpAgentInstalled(agentId: string): Promise<AcpAgentInstallState> {
    const resolvedId = resolveAcpAgentAlias(agentId);
    const manualAgent = this.acpConfHelper.getManualAgents().find((agent) => agent.id === resolvedId);
    if (manualAgent) {
      logger.debug(`[ACP Update] ensure install: ${resolvedId} is manual agent, nothing to install`);
      return {
        status: "installed",
        distributionType: "manual",
        lastCheckedAt: Date.now(),
      };
    }
    const registryAgent = this.getRegistryAgentOrThrow(resolvedId);
    const currentState = this.acpConfHelper.getInstallState(resolvedId);
    logger.debug(
      `[ACP Update] Ensuring install for ${resolvedId} (installed v${currentState?.version ?? "none"} → registry v${registryAgent.version})`,
    );
    try {
      const installed = await this.acpLaunchSpecService.ensureRegistryAgentInstalled(registryAgent, currentState);
      this.acpConfHelper.setInstallState(resolvedId, installed);
      if (installed.status === "error") {
        logger.warn(`[ACP Update] Ensure failed for ${resolvedId}: ${installed.error}`);
      }
      return installed;
    } catch (error) {
      logger.warn(`[ACP Update] Ensure threw for ${resolvedId}:`, error);
      this.acpConfHelper.setInstallState(resolvedId, {
        status: "error",
        version: registryAgent.version,
        distributionType: this.acpLaunchSpecService.selectRegistryDistribution(registryAgent)?.type ?? undefined,
        lastCheckedAt: Date.now(),
        installedAt: currentState?.installedAt ?? null,
        installDir: currentState?.installDir ?? null,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async repairAcpAgent(agentId: string): Promise<AcpAgentInstallState> {
    const resolvedId = resolveAcpAgentAlias(agentId);
    const registryAgent = this.getRegistryAgentOrThrow(resolvedId);
    const currentState = this.acpConfHelper.getInstallState(resolvedId);
    logger.info(
      `[ACP Update] Repair requested for ${resolvedId} (installed v${currentState?.version ?? "none"} → registry v${registryAgent.version})`,
    );
    const repaired = await this.acpLaunchSpecService.ensureRegistryAgentInstalled(registryAgent, currentState, {
      repair: true,
    });
    this.acpConfHelper.setInstallState(resolvedId, repaired);
    if (repaired.status === "error") {
      logger.warn(`[ACP Update] Repair failed for ${resolvedId}: ${repaired.error}`);
    } else {
      logger.info(`[ACP Update] Repaired ${resolvedId} v${registryAgent.version}`);
    }
    return repaired;
  }

  async updateAcpAgent(agentId: string): Promise<AcpAgentInstallState> {
    const resolvedId = resolveAcpAgentAlias(agentId);
    const registryAgent = this.getRegistryAgentOrThrow(resolvedId);
    const selection = this.acpLaunchSpecService.selectRegistryDistribution(registryAgent);
    const currentStateForLog = this.acpConfHelper.getInstallState(resolvedId);
    logger.info(
      `[ACP Update] Update requested for ${resolvedId} (installed v${currentStateForLog?.version ?? "none"} → registry v${registryAgent.version}, dist ${selection?.type ?? "none"})`,
    );

    // npx/uvx runners resolve the latest package at launch time, so there is
    // nothing to download — but the recorded version must track the registry,
    // otherwise the "update available" detection never clears.
    if (!selection || selection.type !== "binary") {
      logger.info(`[ACP Update] ${resolvedId} uses ${selection?.type ?? "unknown"} runner — no download needed`);
      const current = this.acpConfHelper.getInstallState(resolvedId);
      if (selection && (!current || current.version !== registryAgent.version || current.error)) {
        const reconciled: AcpAgentInstallState = {
          status: "installed",
          distributionType: selection.type,
          version: registryAgent.version,
          lastCheckedAt: Date.now(),
          installedAt: current?.installedAt ?? null,
          installDir: null,
          error: null,
        };
        this.acpConfHelper.setInstallState(resolvedId, reconciled);
        return reconciled;
      }
      return (
        current ?? {
          status: "installed",
          distributionType: selection?.type,
          version: registryAgent.version,
          lastCheckedAt: Date.now(),
          installedAt: null,
          installDir: null,
          error: null,
        }
      );
    }

    const currentState = this.acpConfHelper.getInstallState(resolvedId);
    this.acpConfHelper.setInstallState(resolvedId, {
      status: "installing",
      version: registryAgent.version,
      distributionType: "binary",
      lastCheckedAt: Date.now(),
      installedAt: currentState?.installedAt ?? null,
      installDir: currentState?.installDir ?? null,
      error: null,
    });

    try {
      // repair:true deletes the old version dir and re-downloads the new version.
      const installedState = await this.acpLaunchSpecService.ensureRegistryAgentInstalled(registryAgent, currentState, {
        repair: true,
      });
      if (installedState.status === "error") {
        // ensureRegistryAgentInstalled catches download/extract failures internally
        // and returns an error state instead of throwing; surface it as a failure.
        throw new Error(installedState.error ?? "Agent update failed");
      }
      this.acpConfHelper.setInstallState(resolvedId, installedState);
      logger.info(`[ACP Update] Updated ${resolvedId} to v${registryAgent.version}`);
      return installedState;
    } catch (error) {
      logger.warn(`[ACP Update] Failed to update ${resolvedId}:`, error);
      this.acpConfHelper.setInstallState(resolvedId, {
        status: "error",
        version: registryAgent.version,
        distributionType: "binary",
        lastCheckedAt: Date.now(),
        installedAt: currentState?.installedAt ?? null,
        installDir: currentState?.installDir ?? null,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async uninstallAcpRegistryAgent(agentId: string): Promise<void> {
    const resolvedId = resolveAcpAgentAlias(agentId);
    const registryAgent = this.getRegistryAgentOrThrow(resolvedId);
    if (this.deps.hasAcpAgentSessions?.(resolvedId)) {
      throw new Error("ACP registry agent still has related conversations. Move or delete them first.");
    }
    const currentState = this.acpConfHelper.getInstallState(resolvedId);
    logger.info(
      `[ACP Update] Uninstall requested for ${resolvedId} (was v${currentState?.version ?? "unknown"}, dist ${currentState?.distributionType ?? "unknown"})`,
    );
    await this.acpLaunchSpecService.uninstallRegistryAgent(registryAgent, currentState);
    logger.info(`[ACP Update] Uninstalled ${resolvedId}`);
    this.acpConfHelper.setInstallState(resolvedId, {
      status: "not_installed",
      version: registryAgent.version,
      distributionType: this.acpLaunchSpecService.selectRegistryDistribution(registryAgent)?.type ?? undefined,
      lastCheckedAt: Date.now(),
      installedAt: null,
      installDir: null,
      error: null,
    });
  }

  async listManualAcpAgents(): Promise<AcpManualAgent[]> {
    return this.acpConfHelper.getManualAgents();
  }

  async addManualAcpAgent(agent: Omit<AcpManualAgent, "id" | "source"> & { id?: string }): Promise<AcpManualAgent> {
    return this.acpConfHelper.addManualAgent(agent);
  }

  async updateManualAcpAgent(
    agentId: string,
    updates: Partial<Omit<AcpManualAgent, "id" | "source">>,
  ): Promise<AcpManualAgent | null> {
    return this.acpConfHelper.updateManualAgent(agentId, updates);
  }

  async removeManualAcpAgent(agentId: string): Promise<boolean> {
    return this.acpConfHelper.removeManualAgent(agentId);
  }

  async getAcpSharedMcpSelections(): Promise<string[]> {
    return this.acpConfHelper.getSharedMcpSelections();
  }

  async setAcpSharedMcpSelections(mcpIds: string[]): Promise<void> {
    await this.acpConfHelper.setSharedMcpSelections(mcpIds);
  }

  async getAgentMcpSelections(agentId: string): Promise<string[]> {
    return this.acpConfHelper.getAgentMcpSelections(agentId);
  }

  async getAcpAgents(): Promise<AcpAgentConfig[]> {
    if (!this.acpConfHelper.getGlobalEnabled()) return [];
    const [registryAgents, manualAgents] = await Promise.all([
      // A registry fetch failure must not break agent listing (manual + argos
      // agents should still be enumerable).
      this.listAcpRegistryAgents().catch((error) => {
        logger.warn("[ACP] Failed to list registry agents:", error);
        return [] as AcpRegistryAgent[];
      }),
      this.listManualAcpAgents(),
    ]);

    const registryConfigs = registryAgents
      .filter((agent) => agent.enabled && agent.installState?.status === "installed")
      .map((agent) => {
        const preview = this.acpLaunchSpecService.buildRegistryPreview(agent);
        return {
          id: agent.id,
          name: agent.name,
          source: "registry" as const,
          enabled: true,
          command: preview.command,
          args: preview.args,
          icon: agent.icon,
          description: agent.description,
        } as AcpAgentConfig;
      });

    const manualConfigs = manualAgents
      .filter((agent) => agent.enabled)
      .map(
        (agent) =>
          ({
            id: agent.id,
            name: agent.name,
            source: "manual" as const,
            enabled: true,
            command: agent.command,
            args: agent.args,
            icon: agent.icon,
            description: agent.description,
          }) as AcpAgentConfig,
      );

    return [...registryConfigs, ...manualConfigs];
  }

  async resolveAcpLaunchSpec(agentId: string, _workdir?: string): Promise<AcpResolvedLaunchSpec> {
    const resolvedId = resolveAcpAgentAlias(agentId);
    const manualAgent = this.acpConfHelper.getManualAgents().find((agent) => agent.id === resolvedId);
    if (manualAgent) {
      return this.acpLaunchSpecService.resolveManualLaunchSpec(manualAgent);
    }

    const registryAgent = this.getRegistryAgentOrThrow(resolvedId);
    const installState = this.acpConfHelper.getInstallState(resolvedId);
    const launchSpec = await this.acpLaunchSpecService.resolveRegistryLaunchSpec(registryAgent, installState);
    return launchSpec;
  }

  private getRegistryAgentOrThrow(agentId: string): AcpRegistryAgent {
    const resolvedId = resolveAcpAgentAlias(agentId);
    const agent = this.acpRegistryService.listAgents().find((entry) => entry.id === resolvedId);
    if (!agent) {
      throw new Error(`[ACP] Agent not found in registry: ${resolvedId}`);
    }
    return agent;
  }
}
