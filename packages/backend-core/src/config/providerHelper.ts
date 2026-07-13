import { checkRequiresRebuild, type ProviderBatchUpdate, type ProviderChange } from "@argos/shared/provider-operations";
import type { LLM_PROVIDER } from "@argos/shared/presenter";
import type { StoreLike } from "./storeLike";

type SetSetting = <T>(key: string, value: T) => void;

const PROVIDERS_STORE_KEY = "providers";

export interface ProviderChangedEvent {
  type: "changed" | "atomic_update" | "batch_update";
  change?: ProviderChange;
  batchUpdate?: ProviderBatchUpdate;
}

export interface ProviderHelperOptions {
  store: StoreLike<any>;
  setSetting: SetSetting;
  defaultProviders: LLM_PROVIDER[];
  onProviderChanged?: (event: ProviderChangedEvent) => void;
}

export interface ProviderCleanupHooks {
  deleteProviderModelStatuses?: (providerId: string) => void;
  clearProviderModelStore?: (providerId: string) => void;
}

export class ProviderHelper {
  private store: StoreLike<any>;
  private readonly setSetting: SetSetting;
  private readonly defaultProviders: LLM_PROVIDER[];
  private readonly onProviderChanged?: (event: ProviderChangedEvent) => void;
  private cleanupHooks: ProviderCleanupHooks = {};

  constructor(options: ProviderHelperOptions) {
    this.store = options.store;
    this.setSetting = options.setSetting;
    this.defaultProviders = options.defaultProviders;
    this.onProviderChanged = options.onProviderChanged;
  }

  setCleanupHooks(hooks: ProviderCleanupHooks): void {
    this.cleanupHooks = hooks;
  }

  setStore(store: StoreLike<any>): void {
    this.store = store;
  }

  getProviders(): LLM_PROVIDER[] {
    const providers = this.store.get(PROVIDERS_STORE_KEY) as LLM_PROVIDER[] | undefined;

    if (Array.isArray(providers) && providers.length > 0) {
      const defaultMap = new Map(this.defaultProviders.map((p) => [p.id, p]));

      const repairedProviders: LLM_PROVIDER[] = [];
      let hasValidProvider = false;

      for (const item of providers) {
        if (!item || typeof item.id !== "string") continue;

        if ((item as any).apiType) {
          repairedProviders.push(item as LLM_PROVIDER);
          hasValidProvider = true;
          continue;
        }

        if ((item as any).providerId && !(item as any).apiType) {
          console.warn(`[Config] Ignoring MODEL_META entry in providers store (likely ACP model): ${item.id}`);
          continue;
        }

        const template = defaultMap.get(item.id);
        if (template) {
          repairedProviders.push({ ...template, ...item });
          hasValidProvider = true;
          continue;
        }

        console.warn(`[Config] Ignoring non-provider entry in providers store: ${JSON.stringify(item)}`);
      }

      if (!hasValidProvider) {
        console.error(`[Config] Providers store is corrupted (no valid providers found), restoring from defaults`);
        this.setSetting<LLM_PROVIDER[]>(PROVIDERS_STORE_KEY, this.defaultProviders);
        return this.defaultProviders;
      }

      for (const def of this.defaultProviders) {
        if (!repairedProviders.some((p) => p.id === def.id)) {
          repairedProviders.push(def);
        }
      }

      const listChanged =
        repairedProviders.length !== providers.length || repairedProviders.some((p) => !(p as any).apiType);

      if (listChanged) {
        console.log(
          `[Config] Repaired providers store: ${providers.length} entries -> ${repairedProviders.length} valid providers`,
        );
        this.setSetting<LLM_PROVIDER[]>(PROVIDERS_STORE_KEY, repairedProviders);
        this.onProviderChanged?.({ type: "changed" });
      }
      return repairedProviders;
    }

    if (!Array.isArray(providers) || providers.length === 0) {
      this.setSetting<LLM_PROVIDER[]>(PROVIDERS_STORE_KEY, this.defaultProviders);
      return this.defaultProviders;
    }

    return this.defaultProviders;
  }

  setProviders(providers: LLM_PROVIDER[]): void {
    const validProviders = providers.filter((p) => {
      if (!p || typeof p.id !== "string" || !(p as any).apiType) {
        console.warn(`[Config] Skipping invalid provider entry in setProviders: ${JSON.stringify(p)}`);
        return false;
      }
      return true;
    });

    if (validProviders.length !== providers.length) {
      console.error(`[Config] setProviders: ${providers.length - validProviders.length} invalid entries filtered out`);
    }

    this.setSetting<LLM_PROVIDER[]>(PROVIDERS_STORE_KEY, validProviders);
    this.onProviderChanged?.({ type: "changed" });
  }

  getProviderById(id: string): LLM_PROVIDER | undefined {
    return this.getProviders().find((provider) => provider.id === id);
  }

  setProviderById(id: string, provider: LLM_PROVIDER): void {
    const providers = this.getProviders();
    const index = providers.findIndex((p) => p.id === id);
    if (index !== -1) {
      providers[index] = provider;
      this.setProviders(providers);
    } else {
      console.error(`[Config] Provider ${id} not found`);
    }
  }

  updateProviderAtomic(id: string, updates: Partial<LLM_PROVIDER>): boolean {
    const providers = this.getProviders();
    const index = providers.findIndex((p) => p.id === id);

    if (index === -1) {
      console.error(`[Config] Provider ${id} not found`);
      return false;
    }

    const requiresRebuild = checkRequiresRebuild(updates);
    providers[index] = { ...providers[index], ...updates };
    this.setSetting<LLM_PROVIDER[]>(PROVIDERS_STORE_KEY, providers);

    const change: ProviderChange = {
      operation: "update",
      providerId: id,
      requiresRebuild,
      updates,
    };
    this.onProviderChanged?.({ type: "atomic_update", change });

    return requiresRebuild;
  }

  updateProvidersBatch(batchUpdate: ProviderBatchUpdate): void {
    this.setSetting<LLM_PROVIDER[]>(PROVIDERS_STORE_KEY, batchUpdate.providers);
    this.onProviderChanged?.({ type: "batch_update", batchUpdate });
  }

  addProviderAtomic(provider: LLM_PROVIDER): void {
    const providers = this.getProviders();
    providers.push(provider);
    this.setSetting<LLM_PROVIDER[]>(PROVIDERS_STORE_KEY, providers);

    const change: ProviderChange = {
      operation: "add",
      providerId: provider.id,
      requiresRebuild: true,
      provider,
    };
    this.onProviderChanged?.({ type: "atomic_update", change });
  }

  removeProviderAtomic(providerId: string): void {
    const providers = this.getProviders();
    const filteredProviders = providers.filter((p) => p.id !== providerId);
    this.setSetting<LLM_PROVIDER[]>(PROVIDERS_STORE_KEY, filteredProviders);

    try {
      this.cleanupHooks.deleteProviderModelStatuses?.(providerId);
    } catch (error) {
      console.error(`[Config] Failed to delete model statuses for ${providerId}:`, error);
    }

    try {
      this.cleanupHooks.clearProviderModelStore?.(providerId);
    } catch (error) {
      console.error(`[Config] Failed to clear provider model store for ${providerId}:`, error);
    }

    const change: ProviderChange = {
      operation: "remove",
      providerId,
      requiresRebuild: true,
    };
    this.onProviderChanged?.({ type: "atomic_update", change });
  }

  reorderProvidersAtomic(providers: LLM_PROVIDER[]): void {
    this.setSetting<LLM_PROVIDER[]>(PROVIDERS_STORE_KEY, providers);

    const change: ProviderChange = {
      operation: "reorder",
      providerId: "",
      requiresRebuild: false,
    };
    this.onProviderChanged?.({ type: "atomic_update", change });
  }

  getDefaultProviders(): LLM_PROVIDER[] {
    return this.defaultProviders;
  }

  getEnabledProviders(): LLM_PROVIDER[] {
    return this.getProviders().filter((provider) => provider.enable);
  }
}
