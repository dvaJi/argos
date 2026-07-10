import zod from "zod";
import { BrowserPageStatus } from "@shared/types/browser";
import { ApiEndpointType, ModelType, NEW_API_ENDPOINT_TYPES } from "@shared/model";
import {
  FileMetadataValueSchema,
  ImageGenerationOptionsSchema,
  VideoGenerationOptionsSchema,
  TtsSettingsSchema,
  JsonValueSchema,
  ProviderModelSummarySchema,
} from "./common";
import {
  ReasoningEffortSchema,
  ReasoningModeSchema,
  ReasoningVisibilitySchema,
  VerbositySchema,
} from "@shared/types/model-db";

export const ThemeModeSchema = zod.enum(["dark", "light", "system"]);

export const LanguageDirectionSchema = zod.enum(["auto", "rtl", "ltr"]);

export const ModelSelectionSchema = zod.object({
  providerId: zod.string().min(1),
  modelId: zod.string().min(1),
});

export const BuiltinKnowledgeConfigSchema = zod.object({
  id: zod.string().min(1),
  description: zod.string(),
  embedding: ModelSelectionSchema,
  rerank: ModelSelectionSchema.optional(),
  dimensions: zod.number(),
  normalized: zod.boolean(),
  chunkSize: zod.number().optional(),
  chunkOverlap: zod.number().optional(),
  fragmentsNumber: zod.number(),
  separators: zod.array(zod.string()).optional(),
  enabled: zod.boolean(),
});

export const ArgosAgentModelPresetSchema = ModelSelectionSchema.extend({
  temperature: zod.number().optional(),
  contextLength: zod.number().int().optional(),
  maxTokens: zod.number().int().optional(),
  thinkingBudget: zod.number().int().optional(),
  reasoningEffort: ReasoningEffortSchema.optional(),
  verbosity: VerbositySchema.optional(),
  forceInterleavedThinkingCompat: zod.boolean().optional(),
});

export const ProviderRateLimitStatusSchema = zod.object({
  config: zod.object({
    enabled: zod.boolean(),
    qpsLimit: zod.number(),
  }),
  currentQps: zod.number(),
  queueLength: zod.number().int(),
  lastRequestTime: zod.number().int(),
});

export const LlmProviderSchema = zod.looseObject({
  id: zod.string().min(1),
  capabilityProviderId: zod.string().optional(),
  name: zod.string(),
  apiType: zod.string(),
  apiKey: zod.string(),
  copilotClientId: zod.string().optional(),
  baseUrl: zod.string(),
  models: zod.array(ProviderModelSummarySchema).optional(),
  customModels: zod.array(ProviderModelSummarySchema).optional(),
  enable: zod.boolean(),
  enabledModels: zod.array(zod.string()).optional(),
  disabledModels: zod.array(zod.string()).optional(),
  custom: zod.boolean().optional(),
  oauthToken: zod.string().optional(),
  websites: zod
    .object({
      official: zod.string(),
      apiKey: zod.string(),
      name: zod.string().optional(),
      icon: zod.string().optional(),
      docs: zod.string().optional(),
      models: zod.string().optional(),
      defaultBaseUrl: zod.string().optional(),
    })
    .optional(),
  rateLimit: zod
    .object({
      enabled: zod.boolean(),
      qpsLimit: zod.number(),
    })
    .optional(),
  rateLimitConfig: zod
    .object({
      enabled: zod.boolean(),
      qpsLimit: zod.number(),
    })
    .optional(),
  credential: zod
    .object({
      accessKeyId: zod.string(),
      secretAccessKey: zod.string(),
      region: zod.string().optional(),
    })
    .optional(),
  projectId: zod.string().optional(),
  location: zod.string().optional(),
  accountPrivateKey: zod.string().optional(),
  accountClientEmail: zod.string().optional(),
  apiVersion: zod.enum(["v1", "v1beta1"]).optional(),
  endpointMode: zod.enum(["standard", "express"]).optional(),
});

export const LlmProviderSummarySchema = LlmProviderSchema.omit({
  models: true,
  customModels: true,
  enabledModels: true,
  disabledModels: true,
});

export const FileItemSchema = zod.looseObject({
  id: zod.string().min(1),
  name: zod.string(),
  type: zod.string(),
  size: zod.number().optional(),
  path: zod.string(),
  description: zod.string().optional(),
  content: zod.string().optional(),
  createdAt: zod.number().int().optional(),
  updatedAt: zod.number().int().optional(),
});

export const PromptParameterSchema = zod.object({
  name: zod.string(),
  description: zod.string().optional(),
  required: zod.boolean(),
});

export const PromptMessageSchema = zod.object({
  role: zod.string(),
  content: zod.object({
    text: zod.string(),
  }),
});

export const PromptSchema = zod.looseObject({
  id: zod.string().min(1),
  name: zod.string(),
  description: zod.string(),
  content: zod.string().optional(),
  parameters: zod.array(PromptParameterSchema).optional(),
  files: zod.array(FileItemSchema).optional(),
  messages: zod.array(PromptMessageSchema).optional(),
  enabled: zod.boolean().optional(),
  source: zod.enum(["local", "imported", "builtin"]).optional(),
  createdAt: zod.number().int().optional(),
  updatedAt: zod.number().int().optional(),
});

export const SystemPromptSchema = zod.looseObject({
  id: zod.string().min(1),
  name: zod.string(),
  content: zod.string(),
  isDefault: zod.boolean().optional(),
  createdAt: zod.number().int().optional(),
  updatedAt: zod.number().int().optional(),
});

export const ShortcutKeySettingSchema = zod.record(zod.string(), zod.string());

export const ReasoningPortraitSchema = zod.looseObject({
  supported: zod.boolean().optional(),
  defaultEnabled: zod.boolean().optional(),
  mode: ReasoningModeSchema.optional(),
  budget: zod
    .object({
      default: zod.number().int().optional(),
      min: zod.number().int().optional(),
      max: zod.number().int().optional(),
      auto: zod.number().int().optional(),
      off: zod.number().int().optional(),
      unit: zod.string().optional(),
    })
    .optional(),
  effort: ReasoningEffortSchema.optional(),
  effortOptions: zod.array(ReasoningEffortSchema).optional(),
  verbosity: VerbositySchema.optional(),
  verbosityOptions: zod.array(VerbositySchema).optional(),
  level: zod.string().optional(),
  levelOptions: zod.array(zod.string()).optional(),
  interleaved: zod.boolean().optional(),
  summaries: zod.boolean().optional(),
  visibility: ReasoningVisibilitySchema.optional(),
  continuation: zod.array(zod.string()).optional(),
  notes: zod.array(zod.string()).optional(),
});

export const ModelCapabilitiesSchema = zod.object({
  supportsAudioInput: zod.boolean().nullable(),
  supportsReasoning: zod.boolean().nullable(),
  reasoningPortrait: ReasoningPortraitSchema.nullable(),
  thinkingBudgetRange: zod
    .object({
      min: zod.number().int().optional(),
      max: zod.number().int().optional(),
      default: zod.number().int().optional(),
    })
    .nullable(),
  supportsSearch: zod.boolean().nullable(),
  searchDefaults: zod
    .object({
      default: zod.boolean().optional(),
      forced: zod.boolean().optional(),
      strategy: zod.enum(["turbo", "max"]).optional(),
    })
    .nullable(),
  supportsTemperatureControl: zod.boolean().nullable(),
  temperatureCapability: zod.boolean().nullable(),
});

export const ModelConfigSchema = zod.looseObject({
  maxTokens: zod.number().int(),
  contextLength: zod.number().int(),
  temperature: zod.number().optional(),
  topP: zod.number().min(0.1).max(1).optional(),
  vision: zod.boolean(),
  speechRecognition: zod.boolean().optional(),
  functionCall: zod.boolean(),
  reasoning: zod.boolean(),
  type: zod.enum(ModelType),
  isUserDefined: zod.boolean().optional(),
  thinkingBudget: zod.number().int().optional(),
  forceInterleavedThinkingCompat: zod.boolean().optional(),
  reasoningEffort: ReasoningEffortSchema.optional(),
  reasoningVisibility: ReasoningVisibilitySchema.optional(),
  verbosity: VerbositySchema.optional(),
  maxCompletionTokens: zod.number().int().optional(),
  conversationId: zod.string().optional(),
  apiEndpoint: zod.enum(ApiEndpointType).optional(),
  endpointType: zod.enum(NEW_API_ENDPOINT_TYPES).optional(),
  ownedBy: zod.string().optional(),
  enableSearch: zod.boolean().optional(),
  forcedSearch: zod.boolean().optional(),
  searchStrategy: zod.enum(["turbo", "balanced", "precise"]).optional(),
  imageGeneration: ImageGenerationOptionsSchema,
  videoGeneration: VideoGenerationOptionsSchema,
  tts: TtsSettingsSchema,
});

export const ProviderModelConfigEntrySchema = zod.object({
  modelId: zod.string().min(1),
  config: ModelConfigSchema,
});

export const ModelConfigExportEntrySchema = zod.object({
  id: zod.string().min(1),
  providerId: zod.string().min(1),
  config: ModelConfigSchema,
  source: zod.enum(["user", "provider", "system"]).optional(),
});

export const ModelStatusMapSchema = zod.record(zod.string(), zod.boolean());

export const ProviderModelCatalogSchema = zod.object({
  providerModels: zod.array(ProviderModelSummarySchema),
  customModels: zod.array(ProviderModelSummarySchema),
  dbProviderModels: zod.array(ProviderModelSummarySchema),
  modelStatusMap: ModelStatusMapSchema,
});

export const AcpConfigOptionValueSchema = zod.looseObject({
  value: zod.string(),
  label: zod.string(),
  description: zod.string().nullable().optional(),
  groupId: zod.string().nullable().optional(),
  groupLabel: zod.string().nullable().optional(),
});

export const AcpConfigOptionSchema = zod.looseObject({
  id: zod.string(),
  label: zod.string(),
  description: zod.string().nullable().optional(),
  type: zod.enum(["select", "boolean"]),
  category: zod.string().nullable().optional(),
  currentValue: zod.union([zod.string(), zod.boolean()]),
  options: zod.array(AcpConfigOptionValueSchema).optional(),
});

export const AcpConfigStateSchema = zod.object({
  source: zod.enum(["configOptions", "legacy"]),
  options: zod.array(AcpConfigOptionSchema),
});

export const OllamaModelSchema = zod.looseObject({
  name: zod.string(),
  model: zod.string().optional(),
  size: zod.number(),
  digest: zod.string(),
  modified_at: zod.union([zod.string(), zod.date()]),
  details: zod.looseObject({
    format: zod.string(),
    family: zod.string(),
    families: zod.array(zod.string()).optional(),
    parameter_size: zod.string(),
    quantization_level: zod.string(),
  }),
  model_info: zod
    .looseObject({
      context_length: zod.number().int().optional(),
      embedding_length: zod.number().int().optional(),
      vision: zod
        .object({
          embedding_length: zod.number().int(),
        })
        .optional(),
      general: zod
        .object({
          architecture: zod.string().optional(),
          file_type: zod.string().optional(),
          parameter_count: zod.number().optional(),
          quantization_version: zod.number().optional(),
        })
        .optional(),
    })
    .optional(),
  capabilities: zod.array(zod.string()).optional(),
});

export const McpServerConfigSchema = zod.looseObject({
  type: zod.string().optional(),
  enabled: zod.boolean().optional(),
  command: zod.string().optional(),
  args: zod.array(zod.string()).optional(),
  name: zod.string().optional(),
  env: zod.record(zod.string(), zod.unknown()).optional(),
});

export const AcpAgentConfigSchema = zod.looseObject({
  id: zod.string().min(1),
  name: zod.string(),
  description: zod.string().optional(),
  icon: zod.string().optional(),
  command: zod.string().optional(),
  args: zod.array(zod.string()).optional(),
});

export const AcpAgentInstallStateSchema = zod.looseObject({
  status: zod.enum(["not_installed", "installing", "installed", "error"]),
  version: zod.string().optional(),
  distributionType: zod.string().optional(),
  lastCheckedAt: zod.number().optional(),
  installedAt: zod.number().nullable().optional(),
  installDir: zod.string().nullable().optional(),
  error: zod.string().nullable().optional(),
});

export const AcpRegistryAgentSchema = zod.looseObject({
  id: zod.string().min(1),
  name: zod.string(),
  version: zod.string(),
  description: zod.string().optional(),
  icon: zod.string().optional(),
  repository: zod.string().optional(),
  enabled: zod.boolean().optional(),
  envOverride: zod.record(zod.string(), zod.string()).optional(),
  installState: AcpAgentInstallStateSchema.nullable().optional(),
});

export const AcpManualAgentSchema = zod.looseObject({
  id: zod.string().min(1),
  name: zod.string(),
  command: zod.string(),
  args: zod.array(zod.string()).optional(),
  env: zod.record(zod.string(), zod.string()).optional(),
  enabled: zod.boolean().optional(),
});

export const ArgosAgentConfigSchema = zod.looseObject({
  defaultModelPreset: ArgosAgentModelPresetSchema.nullable().optional(),
  assistantModel: ModelSelectionSchema.nullable().optional(),
  visionModel: ModelSelectionSchema.nullable().optional(),
  imageGenerationModel: ModelSelectionSchema.nullable().optional(),
  systemPrompt: zod.string().optional(),
  permissionMode: zod.enum(["default", "full_access"]).optional(),
  disabledAgentTools: zod.array(zod.string()).optional(),
  enabledMcpServerIds: zod.array(zod.string()).optional(),
  enabledPluginIds: zod.array(zod.string()).optional(),
  enabledSkillNames: zod.array(zod.string()).optional(),
  subagentEnabled: zod.boolean().optional(),
  defaultProjectPath: zod.string().nullable().optional(),
});

export const ConfigValueSchema = zod.union([zod.boolean(), zod.number(), zod.string(), zod.null(), JsonValueSchema]);

export const PreparedMessageFileSchema = zod.object({
  name: zod.string(),
  path: zod.string(),
  type: zod.string().optional(),
  size: zod.number().optional(),
  content: zod.string().optional(),
  mimeType: zod.string().optional(),
  token: zod.number().optional(),
  thumbnail: zod.string().optional(),
  metadata: zod.record(zod.string(), FileMetadataValueSchema).optional(),
});

export const DeviceInfoSchema = zod.object({
  platform: zod.string(),
  arch: zod.string(),
  cpuModel: zod.string(),
  totalMemory: zod.number(),
  osVersion: zod.string(),
  osVersionMetadata: zod.array(
    zod.object({
      name: zod.string(),
      build: zod.number().int(),
    }),
  ),
});

export const ProjectSchema = zod.object({
  path: zod.string().min(1),
  name: zod.string(),
  icon: zod.string().nullable(),
  lastAccessedAt: zod.number().int(),
});

export const EnvironmentSummarySchema = zod.object({
  path: zod.string().min(1),
  name: zod.string(),
  sessionCount: zod.number().int(),
  lastUsedAt: zod.number().int(),
  isTemp: zod.boolean(),
  exists: zod.boolean(),
});

export const WorkspaceInvalidationKindSchema = zod.enum(["fs", "git", "full"]);
export const WorkspaceInvalidationSourceSchema = zod.enum(["watcher", "fallback", "lifecycle"]);
export const WorkspaceFilePreviewKindSchema = zod.enum(["text", "markdown", "html", "pdf", "svg", "image", "binary"]);
export const WorkspaceGitChangeTypeSchema = zod.enum([
  "modified",
  "added",
  "deleted",
  "renamed",
  "copied",
  "untracked",
  "ignored",
  "unmerged",
]);

export const WorkspaceFileNodeSchema: zod.ZodType<{
  name: string;
  path: string;
  isDirectory: boolean;
  children?: Array<{
    name: string;
    path: string;
    isDirectory: boolean;
    children?: unknown[];
    expanded?: boolean;
  }>;
  expanded?: boolean;
}> = zod.lazy(() =>
  zod.object({
    name: zod.string(),
    path: zod.string(),
    isDirectory: zod.boolean(),
    children: zod.array(WorkspaceFileNodeSchema).optional(),
    expanded: zod.boolean().optional(),
  }),
);

export const WorkspaceFileMetadataSchema = zod.object({
  fileName: zod.string(),
  fileSize: zod.number(),
  fileDescription: zod.string().optional(),
  fileCreated: zod.date(),
  fileModified: zod.date(),
});

export const WorkspaceFilePreviewSchema = zod.object({
  path: zod.string(),
  relativePath: zod.string(),
  name: zod.string(),
  mimeType: zod.string(),
  kind: WorkspaceFilePreviewKindSchema,
  content: zod.string(),
  previewUrl: zod.string().optional(),
  thumbnail: zod.string().optional(),
  language: zod.string().nullable().optional(),
  metadata: WorkspaceFileMetadataSchema,
});

export const WorkspaceGitFileChangeSchema = zod.object({
  path: zod.string(),
  relativePath: zod.string(),
  previousPath: zod.string().nullable().optional(),
  stagedStatus: zod.string().nullable(),
  unstagedStatus: zod.string().nullable(),
  type: WorkspaceGitChangeTypeSchema,
});

export const WorkspaceGitStateSchema = zod.object({
  workspacePath: zod.string(),
  branch: zod.string().nullable(),
  ahead: zod.number().int(),
  behind: zod.number().int(),
  changes: zod.array(WorkspaceGitFileChangeSchema),
});

export const WorkspaceGitDiffSchema = zod.object({
  workspacePath: zod.string(),
  filePath: zod.string().nullable(),
  relativePath: zod.string().nullable(),
  staged: zod.string(),
  unstaged: zod.string(),
});

export const WorkspaceLinkedFileResolutionSchema = zod.object({
  path: zod.string(),
  name: zod.string(),
  relativePath: zod.string(),
  workspaceRoot: zod.string().nullable(),
});

export const BrowserPageInfoSchema = zod.object({
  id: zod.string(),
  url: zod.string(),
  title: zod.string().optional(),
  favicon: zod.string().optional(),
  status: zod.enum(BrowserPageStatus),
  createdAt: zod.number().int(),
  updatedAt: zod.number().int(),
});

export const YoBrowserStatusSchema = zod.object({
  initialized: zod.boolean(),
  page: BrowserPageInfoSchema.nullable(),
  canGoBack: zod.boolean(),
  canGoForward: zod.boolean(),
  visible: zod.boolean(),
  loading: zod.boolean(),
});

export const RectangleSchema = zod.object({
  x: zod.number(),
  y: zod.number(),
  width: zod.number(),
  height: zod.number(),
});

export const WindowStateSchema = zod.object({
  windowId: zod.number().int().nullable(),
  exists: zod.boolean(),
  isMaximized: zod.boolean(),
  isFullScreen: zod.boolean(),
  isFocused: zod.boolean(),
});
