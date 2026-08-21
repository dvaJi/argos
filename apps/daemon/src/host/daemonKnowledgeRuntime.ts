import { join } from "node:path";
import { mkdirSync } from "node:fs";
import type { IEventPublisher } from "@argos/backend-core";
import { knowledgeFileProgressEvent, knowledgeFileUpdatedEvent } from "@argos/shared-contracts/events";
import { KnowledgeRuntime, createFileIngestionPort, type KnowledgeStorePorts } from "@argos/knowledge-runtime";
import type { DaemonConfigPresenter } from "./daemonConfigPresenter";
import { createConfigProviderResolver, fetchProviderEmbeddings } from "./providerHttp";

/**
 * Daemon knowledge runtime. Hosts the shared `KnowledgeRuntime`
 * (DuckDB vector stores, ingestion, similarity search) with daemon ports:
 * configs from `DaemonConfigPresenter`, OpenAI-compatible embeddings via the
 * provider HTTP helper, file ingestion via `@argos/file-adapters`, and typed
 * knowledge events published over the daemon event bus.
 */
export class DaemonKnowledgeRuntime {
  readonly runtime: KnowledgeRuntime;

  constructor(deps: { configPresenter: DaemonConfigPresenter; dataDir: string; eventPublisher: IEventPublisher }) {
    // Mirrors the desktop layout `<userData>/app_db/KnowledgeBase` — the daemon
    // sidecar shares the desktop userData dir, so existing stores keep working.
    const storageDir = join(deps.dataDir, "app_db", "KnowledgeBase");
    mkdirSync(storageDir, { recursive: true });

    const resolveProvider = createConfigProviderResolver(() => deps.configPresenter.getProviders());

    const events: KnowledgeStorePorts["events"] = {
      fileUpdated: (file) => {
        deps.eventPublisher.publish(knowledgeFileUpdatedEvent.name, {
          file,
          version: Date.now(),
        });
      },
      fileProgress: (payload) => {
        deps.eventPublisher.publish(knowledgeFileProgressEvent.name, {
          ...payload,
          version: Date.now(),
        });
      },
    };

    this.runtime = new KnowledgeRuntime({
      storageDir,
      getKnowledgeConfigs: () => deps.configPresenter.getKnowledgeConfigs(),
      ports: {
        ...createFileIngestionPort(events),
        getEmbeddings: (providerId, modelId, texts) =>
          fetchProviderEmbeddings(resolveProvider, providerId, modelId, texts),
        events,
      },
    });
  }

  /** Reconcile stores after knowledge configs changed (called by the dispatcher). */
  async syncConfigs(): Promise<void> {
    await this.runtime.syncConfigs();
  }
}
