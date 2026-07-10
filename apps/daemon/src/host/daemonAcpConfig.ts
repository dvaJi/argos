import path from "node:path";
import type {
  AcpAgentConfig,
  AcpAgentInstallState,
  AcpAgentState,
  AcpManualAgent,
  AcpRegistryAgent,
  AcpResolvedLaunchSpec,
} from "@shared/presenter";
import { resolveAcpAgentAlias, SVGSanitizer } from "@argos/backend-core";
import { AcpConfHelper, AcpLaunchSpecService, AcpRegistryService } from "@argos/acp-runtime";
import { createJsonStoreFactory } from "./jsonStoreFactory";

export interface DaemonAcpConfigDeps {
  /** Directory for JSON-backed config stores (the daemon config dir). */
  configDir: string;
  /** Directory for ACP registry cache + installed binaries (the daemon data dir). */
  dataDir: string;
  isPrivacyModeEnabled?: () => boolean;
}

/**
 * Daemon-side ACP configuration facade. Owns the shared `AcpConfHelper`,
 * `AcpRegistryService`, and `AcpLaunchSpecService`, using `AcpConfHelper` as the
 * source of truth for agent state (the desktop additionally uses a SQLite agent
 * repository; the daemon does not need one for v1).
 */
export class DaemonAcpConfig {
  private readonly acpConfHelper: AcpConfHelper;
  private readonly acpRegistryService: AcpRegistryService;
  private readonly acpLaunchSpecService: AcpLaunchSpecService;
  private readonly sanitizer = new SVGSanitizer();

  constructor(deps: DaemonAcpConfigDeps) {
    this.acpConfHelper = new AcpConfHelper({ storeFactory: createJsonStoreFactory(deps.configDir) });
    this.acpRegistryService = new AcpRegistryService({
      userDataDir: () => deps.dataDir,
      sanitizeSvg: (svg) => this.sanitizer.sanitize(svg),
      isPrivacyModeEnabled: deps.isPrivacyModeEnabled,
    });
    this.acpLaunchSpecService = new AcpLaunchSpecService(path.join(deps.dataDir, "acp-registry"));
    void this.acpRegistryService
      .initialize()
      .catch((error) => console.warn("[ACP] daemon registry initialize failed:", error));
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
    return this.listAcpRegistryAgents();
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
    const registryAgent = this.getRegistryAgentOrThrow(resolvedId);
    const currentState = this.acpConfHelper.getInstallState(resolvedId);
    try {
      const installed = await this.acpLaunchSpecService.ensureRegistryAgentInstalled(registryAgent, currentState);
      this.acpConfHelper.setInstallState(resolvedId, installed);
      return installed;
    } catch (error) {
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
    const repaired = await this.acpLaunchSpecService.ensureRegistryAgentInstalled(registryAgent, currentState, {
      repair: true,
    });
    this.acpConfHelper.setInstallState(resolvedId, repaired);
    return repaired;
  }

  async uninstallAcpRegistryAgent(agentId: string): Promise<void> {
    const resolvedId = resolveAcpAgentAlias(agentId);
    const registryAgent = this.getRegistryAgentOrThrow(resolvedId);
    const currentState = this.acpConfHelper.getInstallState(resolvedId);
    await this.acpLaunchSpecService.uninstallRegistryAgent(registryAgent, currentState);
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
        console.warn("[ACP] Failed to list registry agents:", error);
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
