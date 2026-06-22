import ElectronStore from "electron-store";
import type { PluginToolPolicyDecision } from "@shared/types/plugin";

type StoredToolPolicy = {
  pluginId: string;
  serverId: string;
  tools: Record<string, PluginToolPolicyDecision>;
  enabled: boolean;
};

type ToolPolicySettings = {
  policies: StoredToolPolicy[];
};

// Lazily instantiated to avoid an import-time side effect (electron-store
// requires an Electron app context to derive projectName; instantiating at
// module load breaks unit tests and any importer that isn't inside Electron).
let store: ElectronStore<ToolPolicySettings> | null = null;
const getStore = (): ElectronStore<ToolPolicySettings> => {
  if (!store) {
    store = new ElectronStore<ToolPolicySettings>({
      name: "plugin-tool-policies",
      defaults: {
        policies: [],
      },
    });
  }
  return store;
};

export function registerPluginToolPolicy(policy: StoredToolPolicy): void {
  const s = getStore();
  const policies = s.get("policies") ?? [];
  const filtered = policies.filter((item) => !(item.pluginId === policy.pluginId && item.serverId === policy.serverId));
  s.set("policies", [...filtered, policy]);
}

export function unregisterPluginToolPolicies(pluginId: string): void {
  const s = getStore();
  const policies = s.get("policies") ?? [];
  s.set(
    "policies",
    policies.filter((policy) => policy.pluginId !== pluginId),
  );
}

export function getPluginToolPolicy(serverId: string, toolName: string): PluginToolPolicyDecision | null {
  const policies = getStore().get("policies") ?? [];
  for (const policy of policies) {
    if (!policy.enabled || policy.serverId !== serverId) {
      continue;
    }
    const decision = policy.tools[toolName];
    if (decision === "allow" || decision === "ask" || decision === "deny") {
      return decision;
    }
  }
  return null;
}
