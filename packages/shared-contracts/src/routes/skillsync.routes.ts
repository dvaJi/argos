import zod from "zod";
import { defineRouteContract } from "../common";

/**
 * Skills sync (cross-tool import/export) routes.
 *
 * Desktop-only: the sync wizards read/write external tools' local skill
 * folders and drive the desktop SkillSyncPresenter. Registered verbatim in
 * DESKTOP_ONLY_ROUTE_PREFIXES so Electron windows reach them over IPC.
 */

const NewDiscoverySchema = zod.object({
  toolId: zod.string(),
  toolName: zod.string().optional().nullable(),
  skillCount: zod.number().optional().nullable(),
});

const ScanResultSchema = zod.unknown();

const ImportPreviewSchema = zod.unknown();

const ExportPreviewSchema = zod.unknown();

const ConflictStrategySchema = zod.record(zod.string(), zod.string());

export const skillsyncScanExternalToolsRoute = defineRouteContract({
  name: "skillsync.scanExternalTools",
  input: zod.object({}).default({}),
  output: zod.object({
    results: zod.array(ScanResultSchema),
  }),
});

export const skillsyncGetRegisteredToolsRoute = defineRouteContract({
  name: "skillsync.getRegisteredTools",
  input: zod.object({}).default({}),
  output: zod.object({
    tools: zod.array(zod.unknown()),
  }),
});

export const skillsyncPreviewImportRoute = defineRouteContract({
  name: "skillsync.previewImport",
  input: zod.object({
    toolId: zod.string(),
    skillNames: zod.array(zod.string()),
  }),
  output: zod.object({
    previews: zod.array(ImportPreviewSchema),
  }),
});

export const skillsyncExecuteImportRoute = defineRouteContract({
  name: "skillsync.executeImport",
  input: zod.object({
    previews: zod.array(ImportPreviewSchema),
    strategies: ConflictStrategySchema,
  }),
  output: zod.object({
    result: zod.unknown(),
  }),
});

export const skillsyncPreviewExportRoute = defineRouteContract({
  name: "skillsync.previewExport",
  input: zod.object({
    skillNames: zod.array(zod.string()),
    targetToolId: zod.string(),
    options: zod.record(zod.string(), zod.unknown()).optional(),
  }),
  output: zod.object({
    previews: zod.array(ExportPreviewSchema),
  }),
});

export const skillsyncExecuteExportRoute = defineRouteContract({
  name: "skillsync.executeExport",
  input: zod.object({
    previews: zod.array(ExportPreviewSchema),
    strategies: ConflictStrategySchema,
  }),
  output: zod.object({
    result: zod.unknown(),
  }),
});

export const skillsyncAcknowledgeDiscoveriesRoute = defineRouteContract({
  name: "skillsync.acknowledgeDiscoveries",
  input: zod.object({}).default({}),
  output: zod.object({
    success: zod.boolean(),
  }),
});

export type SkillsyncNewDiscovery = zod.infer<typeof NewDiscoverySchema>;
