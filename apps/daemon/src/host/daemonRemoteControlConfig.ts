import { RemoteControlRuntime } from "@argos/remote-control-runtime";
import type { RemoteConfigPort, AgentSessionPort, GenerationPort } from "@argos/remote-control-runtime";

/**
 * Daemon-side remote-control config host.
 *
 * Constructs the shared `RemoteControlRuntime` in **config-only mode** so the
 * Remote Channels settings page works in web mode (configure / pair / status /
 * bindings). Channel adapters are NOT started — the bot→agent→reply flow
 * (conversation runner) requires a daemon agent-loop runtime (streaming +
 * generation tracking) that doesn't exist yet. When it lands, flip `configOnly`
 * off and inject real `sessionPort`/`generationPort` implementations.
 *
 * The broader `RemoteConfigPort` methods (getAgentType / getEnabledProviders /
 * getAllEnabledModels) are only exercised by the conversation runner, which is
 * dormant in config-only mode, so they stub to empty values here.
 */
export class DaemonRemoteControlConfig {
  readonly runtime: RemoteControlRuntime;

  constructor(deps: { configPresenter: RemoteConfigPortLike; dataDir: string }) {
    const configPort: RemoteConfigPort = adaptConfigPort(deps.configPresenter);
    // Stub session/generation ports — unused while configOnly is true.
    const sessionPort = undefined as unknown as AgentSessionPort;
    const generationPort: GenerationPort = {
      getActiveGeneration: () => null,
      cancelGenerationByEventId: () => false,
    };

    this.runtime = new RemoteControlRuntime({
      configPort,
      dataDir: deps.dataDir,
      sessionPort,
      generationPort,
      configOnly: true,
    });
  }

  async initialize(): Promise<void> {
    // configOnly → initialize() is a no-op (adapters don't connect).
    await this.runtime.initialize();
  }

  async destroy(): Promise<void> {
    await this.runtime.destroy();
  }
}

/** Structural slice of DaemonConfigPresenter the host reads. */
export interface RemoteConfigPortLike {
  getSetting<T>(key: string): T | null | undefined;
  setSetting(key: string, value: unknown): void;
  getDefaultProjectPath(): string | null;
  listAgents(): Promise<Array<{ id: string; name: string; type?: string }>>;
}

/**
 * Widen the daemon config presenter to the runtime's `RemoteConfigPort`.
 * The conversation-runner-only methods (getAgentType / getEnabledProviders /
 * getAllEnabledModels) stub to empty — they are never called in config-only mode.
 */
function adaptConfigPort(config: RemoteConfigPortLike): RemoteConfigPort {
  return {
    getSetting: <T>(key: string) => config.getSetting<T>(key),
    setSetting: (key: string, value: unknown) => config.setSetting(key, value),
    getDefaultProjectPath: () => config.getDefaultProjectPath(),
    listAgents: async () => (await config.listAgents()) as Array<{ id: string; name: string; type: "argos" | "acp" }>,
    getAgentType: async (_agentId: string) => "argos",
    getEnabledProviders: () => [],
    getAllEnabledModels: async () => [],
  };
}
