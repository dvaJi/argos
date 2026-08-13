import { usageGetStatsRoute, type UsageStatsOutput, type UsageWindow } from "@argos/shared-contracts/routes";
import { getArgosBridge } from "./core";

export function createUsageClient(bridge = getArgosBridge()) {
  async function getStats(window: UsageWindow = "30d", service?: string): Promise<UsageStatsOutput> {
    const result = await bridge.invoke(usageGetStatsRoute.name, { window, service });
    return result;
  }

  return {
    getStats,
  };
}

export type UsageClient = ReturnType<typeof createUsageClient>;
