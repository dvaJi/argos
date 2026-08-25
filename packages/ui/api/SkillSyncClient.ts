import type { ArgosBridge } from "@argos/shared-contracts/bridge";
import {
  skillsyncAcknowledgeDiscoveriesRoute,
  skillsyncExecuteExportRoute,
  skillsyncExecuteImportRoute,
  skillsyncGetRegisteredToolsRoute,
  skillsyncPreviewExportRoute,
  skillsyncPreviewImportRoute,
  skillsyncScanExternalToolsRoute,
} from "@argos/shared-contracts/routes";
import type {
  ConflictStrategy,
  ExportPreview,
  ExternalToolConfig,
  ImportPreview,
  ScanResult,
  SyncResult,
} from "@argos/shared/types/skillSync";
import { getArgosBridge } from "./core";

/**
 * Typed client for the desktop skills-sync wizards (cross-tool import/export).
 * Backed by desktop-only `skillsync.*` routes handled by the desktop main
 * kernel (external tools live on the local filesystem).
 */
export function createSkillSyncClient(bridge: ArgosBridge = getArgosBridge()) {
  async function scanExternalTools(): Promise<ScanResult[]> {
    const result = await bridge.invoke(skillsyncScanExternalToolsRoute.name, {});
    return result.results as ScanResult[];
  }

  async function getRegisteredTools(): Promise<ExternalToolConfig[]> {
    const result = await bridge.invoke(skillsyncGetRegisteredToolsRoute.name, {});
    return result.tools as ExternalToolConfig[];
  }

  async function previewImport(toolId: string, skillNames: string[]): Promise<ImportPreview[]> {
    const result = await bridge.invoke(skillsyncPreviewImportRoute.name, { toolId, skillNames });
    return result.previews as ImportPreview[];
  }

  async function executeImport(
    previews: ImportPreview[],
    strategies: Record<string, ConflictStrategy>,
  ): Promise<SyncResult> {
    const result = await bridge.invoke(skillsyncExecuteImportRoute.name, {
      previews,
      strategies: Object.fromEntries(Object.entries(strategies).map(([k, v]) => [k, String(v)])),
    });
    return result.result as SyncResult;
  }

  async function previewExport(
    skillNames: string[],
    targetToolId: string,
    options?: Record<string, unknown>,
  ): Promise<ExportPreview[]> {
    const result = await bridge.invoke(skillsyncPreviewExportRoute.name, { skillNames, targetToolId, options });
    return result.previews as ExportPreview[];
  }

  async function executeExport(
    previews: ExportPreview[],
    strategies: Record<string, ConflictStrategy>,
  ): Promise<SyncResult> {
    const result = await bridge.invoke(skillsyncExecuteExportRoute.name, {
      previews,
      strategies: Object.fromEntries(Object.entries(strategies).map(([k, v]) => [k, String(v)])),
    });
    return result.result as SyncResult;
  }

  async function acknowledgeDiscoveries(): Promise<boolean> {
    const result = await bridge.invoke(skillsyncAcknowledgeDiscoveriesRoute.name, {});
    return result.success;
  }

  return {
    scanExternalTools,
    getRegisteredTools,
    previewImport,
    executeImport,
    previewExport,
    executeExport,
    acknowledgeDiscoveries,
  };
}

type SkillSyncClient = ReturnType<typeof createSkillSyncClient>;

export type { SkillSyncClient };
