import zod from "zod";
import type { SyncBackupInfo, CloudSyncResult } from "@shared/presenter";
import { defineRouteContract } from "../common";

const SyncBackupInfoSchema = zod.custom<SyncBackupInfo>();
const CloudSyncResultSchema = zod.custom<CloudSyncResult>();

const CloudSyncConfigViewSchema = zod.object({
  enabled: zod.boolean(),
  endpoint: zod.string(),
  bucket: zod.string(),
  region: zod.string(),
  prefix: zod.string(),
  accessKeyId: zod.string(),
  hasSecret: zod.boolean(),
  safeStorageAvailable: zod.boolean(),
});

const CloudSyncConfigInputSchema = zod.object({
  enabled: zod.boolean().optional(),
  endpoint: zod.string().optional(),
  bucket: zod.string().optional(),
  region: zod.string().optional(),
  prefix: zod.string().optional(),
  accessKeyId: zod.string().optional(),
  secretAccessKey: zod.string().optional(),
});

export const syncGetBackupStatusRoute = defineRouteContract({
  name: "sync.getBackupStatus",
  input: zod.object({}),
  output: zod.object({
    status: zod.object({
      isBackingUp: zod.boolean(),
      lastBackupTime: zod.number(),
    }),
  }),
});

export const syncListBackupsRoute = defineRouteContract({
  name: "sync.listBackups",
  input: zod.object({}),
  output: zod.object({
    backups: zod.array(SyncBackupInfoSchema),
  }),
});

export const syncStartBackupRoute = defineRouteContract({
  name: "sync.startBackup",
  input: zod.object({}),
  output: zod.object({
    backup: SyncBackupInfoSchema.nullable(),
  }),
});

export const syncImportRoute = defineRouteContract({
  name: "sync.import",
  input: zod.object({
    backupFile: zod.string(),
    mode: zod.enum(["increment", "overwrite"]).optional(),
  }),
  output: zod.object({
    result: zod.object({
      success: zod.boolean(),
      message: zod.string(),
      count: zod.number().optional(),
      sourceDbType: zod.enum(["agent", "chat"]).optional(),
      importedSessions: zod.number().optional(),
    }),
  }),
});

export const syncOpenFolderRoute = defineRouteContract({
  name: "sync.openFolder",
  input: zod.object({}),
  output: zod.object({
    opened: zod.literal(true),
  }),
});

// === Cloud sync (S3-compatible) ===

export const syncGetCloudConfigRoute = defineRouteContract({
  name: "sync.getCloudConfig",
  input: zod.object({}).default({}),
  output: zod.object({
    config: CloudSyncConfigViewSchema,
  }),
});

export const syncSetCloudConfigRoute = defineRouteContract({
  name: "sync.setCloudConfig",
  input: zod.object({
    config: CloudSyncConfigInputSchema,
  }),
  output: zod.object({
    config: CloudSyncConfigViewSchema,
  }),
});

export const syncTestCloudRoute = defineRouteContract({
  name: "sync.testCloud",
  input: zod.object({}).default({}),
  output: zod.object({
    result: CloudSyncResultSchema,
  }),
});

export const syncUploadToCloudRoute = defineRouteContract({
  name: "sync.uploadToCloud",
  input: zod.object({}).default({}),
  output: zod.object({
    result: CloudSyncResultSchema,
  }),
});

export const syncPullFromCloudRoute = defineRouteContract({
  name: "sync.pullFromCloud",
  input: zod.object({
    mode: zod.enum(["increment", "overwrite"]).optional(),
  }),
  output: zod.object({
    result: CloudSyncResultSchema,
  }),
});
