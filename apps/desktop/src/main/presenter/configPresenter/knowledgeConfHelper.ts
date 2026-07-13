import type { BuiltinKnowledgeConfig } from "@argos/shared/presenter";
import type { StoreLike, StoreFactory } from "@argos/backend-core";

type KnowledgeConfigStore = {
  knowledgeConfigs: BuiltinKnowledgeConfig[];
} & Record<string, unknown>;

export class KnowledgeConfHelper {
  private store: StoreLike<KnowledgeConfigStore>;

  constructor(storeFactory: StoreFactory) {
    this.store = storeFactory<KnowledgeConfigStore>({
      name: "knowledge-configs",
      defaults: {
        knowledgeConfigs: [],
      } as KnowledgeConfigStore,
    });
  }

  getKnowledgeConfigs(): BuiltinKnowledgeConfig[] {
    return this.store.get("knowledgeConfigs") || [];
  }

  setKnowledgeConfigs(configs: BuiltinKnowledgeConfig[]): void {
    this.store.set("knowledgeConfigs", configs);
  }

  static diffKnowledgeConfigs(
    oldConfigs: BuiltinKnowledgeConfig[],
    newConfigs: BuiltinKnowledgeConfig[],
  ): {
    added: BuiltinKnowledgeConfig[];
    deleted: BuiltinKnowledgeConfig[];
    updated: BuiltinKnowledgeConfig[];
  } {
    const oldMap = new Map(oldConfigs.map((cfg) => [cfg.id, cfg]));
    const newMap = new Map(newConfigs.map((cfg) => [cfg.id, cfg]));

    const added = newConfigs.filter((cfg) => !oldMap.has(cfg.id));
    const deleted = oldConfigs.filter((cfg) => !newMap.has(cfg.id));
    const updated = newConfigs.filter(
      (cfg) => oldMap.has(cfg.id) && JSON.stringify(cfg) !== JSON.stringify(oldMap.get(cfg.id)),
    );

    return { added, deleted, updated };
  }
}
