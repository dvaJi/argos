import { invokeDaemonRoute } from "#/routes/daemonRouteProxy";
import type { StoreLike } from "@argos/backend-core";
import type { LLM_PROVIDER, MODEL_META } from "@argos/shared/presenter";
import {
  providersListRoute,
  providersReplaceAllRoute,
  providersSetModelsRoute,
  providersListModelsRoute,
  modelsStatusSnapshotRoute,
  modelsExportConfigsRoute,
  modelsImportConfigsRoute,
  mcpConfigSnapshotRoute,
  mcpApplyConfigPatchRoute,
  configListCustomPromptsRoute,
  configSetCustomPromptsRoute,
  configGetSystemPromptsRoute,
  configSetSystemPromptsRoute,
  configGetKnowledgeConfigsRoute,
  configSetKnowledgeConfigsRoute,
} from "@argos/shared-contracts/routes";

/**
 * Daemon-backed mirror stores for desktop state families whose persistence
 * moved to the daemon (docs/architecture/desktop-config-daemon-ownership).
 *
 * Sync reads are served from a local snapshot; hydration refreshes it from the
 * daemon (lazily, bounded by MIRROR_STALE_MS) and writes go through daemon
 * routes fire-and-forget. This keeps the existing synchronous helper APIs
 * (ProviderHelper, McpConfHelper, ...) working unchanged while the daemon owns
 * persistence.
 */

const MIRROR_STALE_MS = 1500;

export class DaemonMirrorStore<T extends Record<string, unknown>> implements StoreLike<T> {
  private snapshot: T;
  private lastHydratedAt = 0;
  private hydrating: Promise<void> | null = null;

  constructor(
    private readonly options: {
      name: string;
      defaults: T;
      hydrate: () => Promise<T>;
      /** Fire-and-forget persistence of changed/deleted keys. */
      persist?: (context: { next: T; changedKeys: string[]; deletedKeys: string[] }) => void;
    },
  ) {
    this.snapshot = { ...options.defaults };
  }

  get<Key extends keyof T>(key: Key): T[Key] | undefined;
  get<TValue = unknown>(key: string, defaultValue: TValue): TValue;
  get(key: string, defaultValue?: unknown): unknown {
    this.ensureFresh();
    const value = (this.snapshot as Record<string, unknown>)[key];
    return value === undefined ? defaultValue : value;
  }

  has(key: string): boolean {
    this.ensureFresh();
    return Object.prototype.hasOwnProperty.call(this.snapshot, key);
  }

  set(keyOrValues: string | Record<string, unknown>, value?: unknown): void {
    const patch: Partial<T> =
      typeof keyOrValues === "string" ? ({ [keyOrValues]: value } as Partial<T>) : (keyOrValues as Partial<T>);
    const changedKeys = Object.keys(patch);
    Object.assign(this.snapshot, patch);
    this.options.persist?.({ next: this.snapshot, changedKeys, deletedKeys: [] });
  }

  delete(key: keyof T): void {
    delete this.snapshot[key];
    this.options.persist?.({ next: this.snapshot, changedKeys: [], deletedKeys: [String(key)] });
  }

  get store(): T {
    this.ensureFresh();
    return this.snapshot;
  }

  /** Force a re-hydration from the daemon. */
  refresh(): Promise<void> {
    return this.hydrate();
  }

  /**
   * Resolves once the snapshot is fresh: awaits an in-flight hydration, starts one
   * when stale, and resolves immediately otherwise. Awaitable form of ensureFresh
   * for read-modify-write flows (e.g. McpConfHelper.getMcpServers self-heal) that
   * must not operate on un-hydrated defaults.
   */
  whenHydrated(): Promise<void> {
    if (this.hydrating) {
      return this.hydrating;
    }
    if (Date.now() - this.lastHydratedAt < MIRROR_STALE_MS) {
      return Promise.resolve();
    }
    return this.hydrate();
  }

  private ensureFresh(): void {
    if (this.hydrating || Date.now() - this.lastHydratedAt < MIRROR_STALE_MS) {
      return;
    }
    void this.hydrate();
  }

  private hydrate(): Promise<void> {
    if (this.hydrating) {
      return this.hydrating;
    }
    this.hydrating = this.options
      .hydrate()
      .then((data) => {
        if (data && typeof data === "object") {
          this.snapshot = data;
        }
        this.lastHydratedAt = Date.now();
      })
      .catch((error) => {
        console.warn(`[DaemonMirror:${this.options.name}] hydration failed:`, error);
      })
      .finally(() => {
        this.hydrating = null;
      });
    return this.hydrating;
  }
}

export function fireAndForgetDaemonWrite(name: string, promise: Promise<unknown>): void {
  promise.catch((error) => {
    console.warn(`[DaemonMirror:${name}] persist failed:`, error);
  });
}

function fireAndForget(name: string, promise: Promise<unknown>): void {
  fireAndForgetDaemonWrite(name, promise);
}

export function createProvidersMirror(defaults: LLM_PROVIDER[]): DaemonMirrorStore<{ providers: LLM_PROVIDER[] }> {
  return new DaemonMirrorStore<{ providers: LLM_PROVIDER[] }>({
    name: "providers",
    defaults: { providers: defaults },
    hydrate: async () => {
      const result = await invokeDaemonRoute<{ providers: LLM_PROVIDER[] }>(providersListRoute.name, {});
      // Keep defaults merged in so first-run/desktop-only defaults stay visible.
      return { providers: result.providers ?? [] };
    },
    persist: ({ next }) => {
      fireAndForget("providers", invokeDaemonRoute(providersReplaceAllRoute.name, { providers: next.providers }));
    },
  });
}

export function createModelStatusMirror(): DaemonMirrorStore<Record<string, boolean>> {
  return new DaemonMirrorStore<Record<string, boolean>>({
    name: "model-status",
    defaults: {},
    hydrate: async () => {
      const result = await invokeDaemonRoute<{
        entries: Array<{ providerId: string; modelId: string; enabled: boolean }>;
      }>(modelsStatusSnapshotRoute.name, {});
      const snapshot: Record<string, boolean> = {};
      for (const entry of result.entries ?? []) {
        snapshot[`model_status_${entry.providerId}_${entry.modelId.replace(/\./g, "-")}`] = entry.enabled;
      }
      return snapshot;
    },
  });
}

export interface ProviderModelMirrorData extends Record<string, unknown> {
  models: MODEL_META[];
  custom_models: MODEL_META[];
}

export function createProviderModelsMirror(providerId: string): DaemonMirrorStore<ProviderModelMirrorData> {
  return new DaemonMirrorStore<ProviderModelMirrorData>({
    name: `provider-models:${providerId}`,
    defaults: { models: [], custom_models: [] },
    hydrate: async () => {
      const result = await invokeDaemonRoute<{
        providerModels: MODEL_META[];
        customModels: MODEL_META[];
      }>(providersListModelsRoute.name, { providerId });
      return {
        models: result.providerModels ?? [],
        custom_models: result.customModels ?? [],
      };
    },
    persist: ({ next }) => {
      fireAndForget(
        "providers.setModels",
        invokeDaemonRoute(providersSetModelsRoute.name, {
          providerId,
          models: next.models,
          customModels: next.custom_models,
        }),
      );
    },
  });
}

export function createModelConfigMirror(): DaemonMirrorStore<Record<string, unknown>> {
  return new DaemonMirrorStore<Record<string, unknown>>({
    name: "model-config",
    defaults: {},
    hydrate: async () => {
      const result = await invokeDaemonRoute<{
        configs: Record<string, { id: string; providerId: string; config: unknown; source?: string }>;
      }>(modelsExportConfigsRoute.name, {});
      const snapshot: Record<string, unknown> = {};
      const userConfigKeys: string[] = [];
      for (const [key, entry] of Object.entries(result.configs ?? {})) {
        const config = (entry.config ?? {}) as Record<string, unknown>;
        snapshot[key] = { ...config, __source: entry.source };
        if (entry.source === "user") {
          userConfigKeys.push(key);
        }
      }
      snapshot.__meta__ = { userConfigKeys };
      return snapshot;
    },
    persist: ({ next, changedKeys }) => {
      if (changedKeys.length === 0) {
        return;
      }
      const configs: Record<string, unknown> = {};
      for (const key of changedKeys) {
        if (key === "__meta__") continue;
        const value = next[key] as { __source?: string } | undefined;
        if (!value) continue;
        const { __source, ...config } = value as Record<string, unknown>;
        configs[key] = {
          id: key,
          providerId: "",
          config,
          source: (__source as string) ?? "user",
        };
      }
      if (Object.keys(configs).length === 0) {
        return;
      }
      fireAndForget(
        "models.importConfigs",
        invokeDaemonRoute(modelsImportConfigsRoute.name, { configs, overwrite: true }),
      );
    },
  });
}

export function createMcpSettingsMirror(): DaemonMirrorStore<Record<string, unknown>> {
  return new DaemonMirrorStore<Record<string, unknown>>({
    name: "mcp-settings",
    defaults: {},
    hydrate: async () => {
      const result = await invokeDaemonRoute<{ snapshot: Record<string, unknown> }>(mcpConfigSnapshotRoute.name, {});
      return result.snapshot ?? {};
    },
    persist: ({ changedKeys, next }) => {
      if (changedKeys.length === 0) return;
      const patch: Record<string, unknown> = {};
      for (const key of changedKeys) {
        patch[key] = next[key];
      }
      fireAndForget("mcp.applyConfigPatch", invokeDaemonRoute(mcpApplyConfigPatchRoute.name, { patch }));
    },
  });
}

type PromptRecord = { id: string };

export function createPromptsMirror(): DaemonMirrorStore<{
  customPrompts: PromptRecord[];
  systemPrompts: { prompts: PromptRecord[] };
  knowledgeConfigs: unknown[];
}> {
  type MirrorData = {
    customPrompts: PromptRecord[];
    systemPrompts: { prompts: PromptRecord[] };
    knowledgeConfigs: unknown[];
  };
  return new DaemonMirrorStore<MirrorData>({
    name: "prompts-knowledge",
    defaults: { customPrompts: [], systemPrompts: { prompts: [] }, knowledgeConfigs: [] },
    hydrate: async () => {
      const [custom, system, knowledge] = await Promise.all([
        invokeDaemonRoute<{ prompts?: PromptRecord[] } | PromptRecord[]>(configListCustomPromptsRoute.name, {}),
        invokeDaemonRoute<{ prompts: PromptRecord[] }>(configGetSystemPromptsRoute.name, {}),
        invokeDaemonRoute<{ configs?: unknown[] }>(configGetKnowledgeConfigsRoute.name, {}),
      ]);
      const customPrompts = Array.isArray(custom) ? custom : (custom.prompts ?? []);
      return {
        customPrompts,
        systemPrompts: { prompts: system.prompts ?? [] },
        knowledgeConfigs: knowledge.configs ?? [],
      };
    },
    persist: ({ next, changedKeys }) => {
      for (const key of changedKeys) {
        if (key === "customPrompts") {
          fireAndForget(
            "customPrompts",
            invokeDaemonRoute(configSetCustomPromptsRoute.name, { prompts: next.customPrompts }),
          );
        } else if (key === "systemPrompts") {
          fireAndForget(
            "systemPrompts",
            invokeDaemonRoute(configSetSystemPromptsRoute.name, { prompts: next.systemPrompts?.prompts ?? [] }),
          );
        } else if (key === "knowledgeConfigs") {
          fireAndForget(
            "knowledgeConfigs",
            invokeDaemonRoute(configSetKnowledgeConfigsRoute.name, { configs: next.knowledgeConfigs }),
          );
        }
      }
    },
  });
}

/** All live mirrors, for startup hydration and forced refreshes. */
const mirrors: DaemonMirrorStore<Record<string, unknown>>[] = [];

export function registerMirror<T extends Record<string, unknown>>(store: DaemonMirrorStore<T>): DaemonMirrorStore<T> {
  mirrors.push(store as unknown as DaemonMirrorStore<Record<string, unknown>>);
  store.refresh().catch(() => {});
  return store;
}
