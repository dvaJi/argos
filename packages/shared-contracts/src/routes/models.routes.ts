import zod from "zod";
import { EntityIdSchema, ProviderModelSummarySchema, defineRouteContract } from "../common";
import {
  ModelCapabilitiesSchema,
  ModelConfigExportEntrySchema,
  ModelConfigSchema,
  ProviderModelCatalogSchema,
  ProviderModelConfigEntrySchema,
} from "../domainSchemas";

export const modelsGetProviderCatalogRoute = defineRouteContract({
  name: "models.getProviderCatalog",
  input: zod.object({
    providerId: EntityIdSchema,
  }),
  output: zod.object({
    catalog: ProviderModelCatalogSchema,
  }),
});

export const modelsListRuntimeRoute = defineRouteContract({
  name: "models.listRuntime",
  input: zod.object({
    providerId: EntityIdSchema,
  }),
  output: zod.object({
    models: zod.array(ProviderModelSummarySchema),
  }),
});

export const modelsSetStatusRoute = defineRouteContract({
  name: "models.setStatus",
  input: zod.object({
    providerId: EntityIdSchema,
    modelId: zod.string().min(1),
    enabled: zod.boolean(),
  }),
  output: zod.object({
    providerId: EntityIdSchema,
    modelId: zod.string().min(1),
    enabled: zod.boolean(),
  }),
});

export const modelsAddCustomRoute = defineRouteContract({
  name: "models.addCustom",
  input: zod.object({
    providerId: EntityIdSchema,
    model: ProviderModelSummarySchema.omit({
      providerId: true,
      group: true,
      isCustom: true,
    }).loose(),
  }),
  output: zod.object({
    model: ProviderModelSummarySchema,
  }),
});

export const modelsRemoveCustomRoute = defineRouteContract({
  name: "models.removeCustom",
  input: zod.object({
    providerId: EntityIdSchema,
    modelId: zod.string().min(1),
  }),
  output: zod.object({
    removed: zod.boolean(),
  }),
});

export const modelsUpdateCustomRoute = defineRouteContract({
  name: "models.updateCustom",
  input: zod.object({
    providerId: EntityIdSchema,
    modelId: zod.string().min(1),
    updates: ProviderModelSummarySchema.partial(),
  }),
  output: zod.object({
    updated: zod.boolean(),
  }),
});

export const modelsGetConfigRoute = defineRouteContract({
  name: "models.getConfig",
  input: zod.object({
    modelId: zod.string().min(1),
    providerId: zod.string().min(1).optional(),
  }),
  output: zod.object({
    config: ModelConfigSchema,
  }),
});

export const modelsSetConfigRoute = defineRouteContract({
  name: "models.setConfig",
  input: zod.object({
    modelId: zod.string().min(1),
    providerId: EntityIdSchema,
    config: ModelConfigSchema,
  }),
  output: zod.object({
    config: ModelConfigSchema,
  }),
});

export const modelsResetConfigRoute = defineRouteContract({
  name: "models.resetConfig",
  input: zod.object({
    modelId: zod.string().min(1),
    providerId: EntityIdSchema,
  }),
  output: zod.object({
    reset: zod.boolean(),
  }),
});

export const modelsGetProviderConfigsRoute = defineRouteContract({
  name: "models.getProviderConfigs",
  input: zod.object({
    providerId: EntityIdSchema,
  }),
  output: zod.object({
    configs: zod.array(ProviderModelConfigEntrySchema),
  }),
});

export const modelsHasUserConfigRoute = defineRouteContract({
  name: "models.hasUserConfig",
  input: zod.object({
    modelId: zod.string().min(1),
    providerId: EntityIdSchema,
  }),
  output: zod.object({
    hasConfig: zod.boolean(),
  }),
});

export const modelsExportConfigsRoute = defineRouteContract({
  name: "models.exportConfigs",
  input: zod.object({}).default({}),
  output: zod.object({
    configs: zod.record(zod.string(), ModelConfigExportEntrySchema),
  }),
});

export const modelsImportConfigsRoute = defineRouteContract({
  name: "models.importConfigs",
  input: zod.object({
    configs: zod.record(zod.string(), ModelConfigExportEntrySchema),
    overwrite: zod.boolean().default(false),
  }),
  output: zod.object({
    imported: zod.boolean(),
    overwrite: zod.boolean(),
  }),
});

export const modelsSetBatchStatusRoute = defineRouteContract({
  name: "models.setBatchStatus",
  input: zod.object({
    providerId: EntityIdSchema,
    updates: zod.array(
      zod.object({
        modelId: zod.string().min(1),
        enabled: zod.boolean(),
      }),
    ),
  }),
  output: zod.object({
    results: zod.array(
      zod.object({
        modelId: zod.string().min(1),
        enabled: zod.boolean(),
      }),
    ),
  }),
});

export const modelsGetCapabilitiesRoute = defineRouteContract({
  name: "models.getCapabilities",
  input: zod.object({
    providerId: EntityIdSchema,
    modelId: zod.string().min(1),
  }),
  output: zod.object({
    capabilities: ModelCapabilitiesSchema,
  }),
});

export const modelsTranscribeAudioRoute = defineRouteContract({
  name: "models.transcribeAudio",
  input: zod.object({
    providerId: EntityIdSchema,
    modelId: zod.string().min(1),
    audioBase64: zod.string().min(1).max(15_000_000),
    mimeType: zod.string().min(1).max(255),
    filename: zod.string().min(1).max(255).optional(),
  }),
  output: zod.object({
    text: zod.string(),
  }),
});
