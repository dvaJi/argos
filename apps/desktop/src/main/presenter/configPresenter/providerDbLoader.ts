import { invokeDaemonRoute } from "#/routes/daemonRouteProxy";
import { eventBus, SendTarget } from "#/eventbus";
import { PROVIDER_DB_EVENTS } from "#/events";
import { providersGetProviderDbRoute, providersRefreshProviderDbRoute } from "@argos/shared-contracts/routes";
import type { ProviderAggregate, ProviderEntry, ProviderModel } from "@argos/shared/types/model-db";
import type { ProviderDbRefreshResult } from "@argos/shared/presenter";
import { resolveProviderId } from "./providerId";

/**
 * Desktop-side mirror of the daemon-owned provider-DB catalog.
 *
 * The daemon is the single source of truth for the catalog (it resolves the
 * built-in db, refreshes it, and enforces privacy mode). The desktop shell no
 * longer touches `electron.app` paths or the remote catalog directly — it
 * reads a cached snapshot over the daemon route, so headless / remote-desktop
 * mode always agrees with the daemon.
 */
let catalog: ProviderAggregate | null = null;
let sourceUrl = "";

async function syncFromDaemon(): Promise<void> {
  const res = await invokeDaemonRoute<{ catalog: ProviderAggregate; sourceUrl: string; lastUpdated: number | null }>(
    providersGetProviderDbRoute.name,
    {},
  );
  catalog = res.catalog ?? null;
  sourceUrl = res.sourceUrl ?? "";
}

function emitLoaded(): void {
  if (!catalog) return;
  const providersCount = Object.keys(catalog.providers || {}).length;
  eventBus.send(PROVIDER_DB_EVENTS.LOADED, SendTarget.ALL_WINDOWS, { providersCount });
}

function emitUpdated(lastUpdated: number | null): void {
  if (!catalog) return;
  const providersCount = Object.keys(catalog.providers || {}).length;
  eventBus.send(PROVIDER_DB_EVENTS.UPDATED, SendTarget.ALL_WINDOWS, { providersCount, lastUpdated });
}

export const providerDbLoader = {
  setPrivacyModeResolver(_resolver?: () => boolean): void {
    // Privacy mode is enforced by the daemon, which owns the catalog refresh.
  },

  async initialize(): Promise<void> {
    try {
      await syncFromDaemon();
      emitLoaded();
    } catch (error) {
      console.warn("[providerDbLoader] Initial catalog sync from daemon failed:", error);
    }
  },

  async refreshIfNeeded(force = false): Promise<ProviderDbRefreshResult> {
    const result = await invokeDaemonRoute<{
      providersCount: number;
      lastUpdated: number | null;
      sourceUrl: string;
      status: ProviderDbRefreshResult["status"];
    }>(providersRefreshProviderDbRoute.name, { force });

    await syncFromDaemon();
    if (result.status !== "error") {
      emitUpdated(result.lastUpdated);
    }

    return {
      status: result.status,
      lastUpdated: result.lastUpdated,
      providersCount: result.providersCount,
    };
  },

  getDb(): ProviderAggregate | null {
    return catalog;
  },

  getProvider(providerId: string): ProviderEntry | undefined {
    if (!catalog) return undefined;
    const resolvedId = resolveProviderId(providerId);
    return catalog.providers?.[resolvedId ?? providerId];
  },

  getModel(providerId: string, modelId: string): ProviderModel | undefined {
    const provider = this.getProvider(providerId);
    if (!provider) return undefined;
    return provider.models.find((m) => m.id === modelId);
  },

  getSourceUrl(): string {
    return sourceUrl;
  },
};

export type { ProviderDbRefreshResult };
