import zod from "zod";
import { EntityIdSchema, ProviderModelSummarySchema, defineRouteContract } from "../common";
import {
  AcpConfigStateSchema,
  LlmProviderSchema,
  LlmProviderSummarySchema,
  OllamaModelSchema,
  ProviderRateLimitStatusSchema,
} from "../domainSchemas";
import { PROVIDER_IMPORT_CUSTOM_API_TYPES, PROVIDER_IMPORT_SOURCE_IDS } from "../providerImport";

const ProviderImportSourceIdSchema = zod.enum(PROVIDER_IMPORT_SOURCE_IDS);
const ProviderImportCustomApiTypeSchema = zod.enum(PROVIDER_IMPORT_CUSTOM_API_TYPES);
const ProviderImportTargetKindSchema = zod.enum(["builtin", "custom", "unsupported"]);
const ProviderImportWarningSchema = zod.enum([
  "already_configured",
  "missing_api_key",
  "unsupported_provider",
  "overwrites_previous_selection",
  "credential_only_import",
]);
const ProviderImportApplyStatusSchema = zod.enum(["created", "updated", "skipped", "overwritten"]);

export const providersListModelsRoute = defineRouteContract({
  name: "providers.listModels",
  input: zod.object({
    providerId: EntityIdSchema,
  }),
  output: zod.object({
    providerModels: zod.array(ProviderModelSummarySchema),
    customModels: zod.array(ProviderModelSummarySchema),
  }),
});

export const providersTestConnectionRoute = defineRouteContract({
  name: "providers.testConnection",
  input: zod.object({
    providerId: EntityIdSchema,
    modelId: zod.string().min(1).optional(),
  }),
  output: zod.object({
    isOk: zod.boolean(),
    errorMsg: zod.string().nullable(),
  }),
});

export const providersListRoute = defineRouteContract({
  name: "providers.list",
  input: zod.object({}).default({}),
  output: zod.object({
    providers: zod.array(LlmProviderSchema),
  }),
});

export const providersListSummariesRoute = defineRouteContract({
  name: "providers.listSummaries",
  input: zod.object({}).default({}),
  output: zod.object({
    providers: zod.array(LlmProviderSummarySchema),
  }),
});

export const providersListDefaultsRoute = defineRouteContract({
  name: "providers.listDefaults",
  input: zod.object({}).default({}),
  output: zod.object({
    providers: zod.array(LlmProviderSchema),
  }),
});

export const providersSetByIdRoute = defineRouteContract({
  name: "providers.setById",
  input: zod.object({
    providerId: EntityIdSchema,
    provider: LlmProviderSchema,
  }),
  output: zod.object({
    provider: LlmProviderSchema,
  }),
});

export const providersUpdateRoute = defineRouteContract({
  name: "providers.update",
  input: zod.object({
    providerId: EntityIdSchema,
    updates: LlmProviderSchema.partial(),
  }),
  output: zod.object({
    provider: LlmProviderSchema,
    requiresRebuild: zod.boolean(),
  }),
});

export const providersAddRoute = defineRouteContract({
  name: "providers.add",
  input: zod.object({
    provider: LlmProviderSchema,
  }),
  output: zod.object({
    provider: LlmProviderSchema,
  }),
});

export const providersRemoveRoute = defineRouteContract({
  name: "providers.remove",
  input: zod.object({
    providerId: EntityIdSchema,
  }),
  output: zod.object({
    removed: zod.boolean(),
  }),
});

export const providersReorderRoute = defineRouteContract({
  name: "providers.reorder",
  input: zod.object({
    providers: zod.array(LlmProviderSchema),
  }),
  output: zod.object({
    providers: zod.array(LlmProviderSchema),
  }),
});

export const providersGetRateLimitStatusRoute = defineRouteContract({
  name: "providers.getRateLimitStatus",
  input: zod.object({
    providerId: EntityIdSchema,
  }),
  output: zod.object({
    status: ProviderRateLimitStatusSchema,
  }),
});

export const providersRefreshModelsRoute = defineRouteContract({
  name: "providers.refreshModels",
  input: zod.object({
    providerId: EntityIdSchema,
  }),
  output: zod.object({
    refreshed: zod.boolean(),
  }),
});

export const providersListOllamaModelsRoute = defineRouteContract({
  name: "providers.listOllamaModels",
  input: zod.object({
    providerId: EntityIdSchema,
  }),
  output: zod.object({
    models: zod.array(OllamaModelSchema),
  }),
});

export const providersListOllamaRunningModelsRoute = defineRouteContract({
  name: "providers.listOllamaRunningModels",
  input: zod.object({
    providerId: EntityIdSchema,
  }),
  output: zod.object({
    models: zod.array(OllamaModelSchema),
  }),
});

export const providersPullOllamaModelRoute = defineRouteContract({
  name: "providers.pullOllamaModel",
  input: zod.object({
    providerId: EntityIdSchema,
    modelName: zod.string().min(1),
  }),
  output: zod.object({
    success: zod.boolean(),
  }),
});

export const providersWarmupAcpProcessRoute = defineRouteContract({
  name: "providers.warmupAcpProcess",
  input: zod.object({
    agentId: zod.string().min(1),
    workdir: zod.string().optional(),
  }),
  output: zod.object({
    warmedUp: zod.boolean(),
  }),
});

export const providersGetAcpProcessConfigOptionsRoute = defineRouteContract({
  name: "providers.getAcpProcessConfigOptions",
  input: zod.object({
    agentId: zod.string().min(1),
    workdir: zod.string().optional(),
  }),
  output: zod.object({
    state: AcpConfigStateSchema.nullable(),
  }),
});

const AcpDebugActionTypeSchema = zod.enum([
  "initialize",
  "authenticate",
  "logout",
  "newSession",
  "loadSession",
  "sessionList",
  "sessionResume",
  "sessionClose",
  "sessionFork",
  "prompt",
  "cancel",
  "setSessionMode",
  "setSessionModel",
  "extMethod",
  "extNotification",
]);

const AcpDebugEventEntrySchema = zod.object({
  id: zod.string(),
  kind: zod.enum(["request", "response", "notification", "permission", "lifecycle", "stderr", "error"]),
  action: zod.string(),
  agentId: zod.string(),
  sessionId: zod.string().optional(),
  timestamp: zod.number(),
  payload: zod.unknown().optional(),
  message: zod.string().optional(),
});

const AcpAgentDiagnosticsSchema = zod.object({
  ready: zod.boolean(),
  agentId: zod.string(),
  workdir: zod.string().nullable(),
  launchSource: zod.string().nullable(),
  protocolVersion: zod.string().optional(),
  agentName: zod.string().optional(),
  agentVersion: zod.string().optional(),
  authMethods: zod.array(zod.object({ id: zod.string(), type: zod.string().optional() })),
  capabilities: zod.object({
    loadSession: zod.boolean(),
    sessionList: zod.boolean(),
    sessionResume: zod.boolean(),
    sessionClose: zod.boolean(),
    sessionFork: zod.boolean(),
    authLogout: zod.boolean(),
    fs: zod.boolean(),
    terminal: zod.boolean(),
  }),
  lastError: zod.string().nullable(),
});

export const providersRunAcpDebugActionRoute = defineRouteContract({
  name: "providers.runAcpDebugAction",
  input: zod.object({
    agentId: zod.string().min(1),
    action: AcpDebugActionTypeSchema,
    payload: zod.record(zod.string(), zod.unknown()).optional(),
    sessionId: zod.string().optional(),
    workdir: zod.string().optional(),
    methodName: zod.string().optional(),
    webContentsId: zod.number().optional(),
  }),
  output: zod.object({
    status: zod.enum(["ok", "error"]),
    sessionId: zod.string().optional(),
    error: zod.string().optional(),
    events: zod.array(AcpDebugEventEntrySchema),
  }),
});

export const providersGetAcpAgentDiagnosticsRoute = defineRouteContract({
  name: "providers.getAcpAgentDiagnostics",
  input: zod.object({
    agentId: zod.string().min(1),
    workdir: zod.string().nullable().optional(),
  }),
  output: zod.object({
    diagnostics: AcpAgentDiagnosticsSchema,
  }),
});

export const providersImportScanRoute = defineRouteContract({
  name: "providers.import.scan",
  input: zod.object({}).default({}),
  output: zod.object({
    sessionId: zod.string().min(1),
    sourceOrder: zod.array(ProviderImportSourceIdSchema),
    sources: zod.array(
      zod.object({
        id: ProviderImportSourceIdSchema,
        name: zod.string(),
        status: zod.enum(["found", "not_found", "error", "unsupported_platform"]),
        configPath: zod.string(),
        providerCount: zod.number().int().nonnegative(),
        selectable: zod.boolean(),
        defaultSelected: zod.boolean(),
        message: zod.string().optional(),
      }),
    ),
    providers: zod.array(
      zod.object({
        id: zod.string().min(1),
        sourceId: ProviderImportSourceIdSchema,
        sourceName: zod.string(),
        sourceProviderId: zod.string(),
        name: zod.string(),
        sourceType: zod.string(),
        targetKind: ProviderImportTargetKindSchema,
        targetProviderId: zod.string(),
        targetProviderName: zod.string(),
        targetApiType: zod.string(),
        apiKeyMasked: zod.string(),
        baseUrl: zod.string(),
        modelCount: zod.number().int().nonnegative(),
        modelPreview: zod.array(zod.string()),
        configured: zod.boolean(),
        selectable: zod.boolean(),
        defaultSelected: zod.boolean(),
        warnings: zod.array(ProviderImportWarningSchema),
      }),
    ),
  }),
});

export const providersImportApplyRoute = defineRouteContract({
  name: "providers.import.apply",
  input: zod.object({
    sessionId: zod.string().min(1),
    selections: zod.array(
      zod.object({
        sourceId: ProviderImportSourceIdSchema,
        providerIds: zod.array(zod.string().min(1)),
        providerOptions: zod
          .record(
            zod.string().min(1),
            zod.object({
              targetApiType: ProviderImportCustomApiTypeSchema.optional(),
            }),
          )
          .optional(),
      }),
    ),
  }),
  output: zod.object({
    summary: zod.object({
      imported: zod.number().int().nonnegative(),
      created: zod.number().int().nonnegative(),
      updated: zod.number().int().nonnegative(),
      skipped: zod.number().int().nonnegative(),
      overwritten: zod.number().int().nonnegative(),
      models: zod.number().int().nonnegative(),
    }),
    results: zod.array(
      zod.object({
        id: zod.string().min(1),
        sourceId: ProviderImportSourceIdSchema,
        sourceName: zod.string(),
        sourceProviderId: zod.string(),
        name: zod.string(),
        targetKind: ProviderImportTargetKindSchema,
        targetProviderId: zod.string(),
        targetProviderName: zod.string(),
        status: ProviderImportApplyStatusSchema,
        modelCount: zod.number().int().nonnegative(),
        message: zod.string().optional(),
      }),
    ),
  }),
});
