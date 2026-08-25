import type { ArgosBridge } from "@argos/shared-contracts/bridge";
import {
  nowledgeMemGetConfigRoute,
  nowledgeMemTestConnectionRoute,
  nowledgeMemUpdateConfigRoute,
} from "@argos/shared-contracts/routes";
import { getArgosBridge } from "./core";

export type NowledgeMemConfig = {
  baseUrl: string;
  apiKey?: string;
  timeout: number;
};

export type NowledgeMemTestResult = {
  success: boolean;
  data?: unknown;
  error?: string;
  status?: number;
};

/**
 * Typed client for NowledgeMem connection settings. Desktop-only
 * `nowledgeMem.*` routes (health-check fetches run in desktop main).
 */
export function createNowledgeMemClient(bridge: ArgosBridge = getArgosBridge()) {
  async function getConfig() {
    const result = await bridge.invoke(nowledgeMemGetConfigRoute.name, {});
    return result.config;
  }

  async function updateConfig(config: Partial<NowledgeMemConfig>) {
    const result = await bridge.invoke(nowledgeMemUpdateConfigRoute.name, { config });
    return result.success;
  }

  async function testConnection() {
    const result = await bridge.invoke(nowledgeMemTestConnectionRoute.name, {});
    return result.result as NowledgeMemTestResult;
  }

  return {
    getConfig,
    updateConfig,
    testConnection,
  };
}

type NowledgeMemClient = ReturnType<typeof createNowledgeMemClient>;

export type { NowledgeMemClient };
