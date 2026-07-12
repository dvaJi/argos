import zod from "zod";
import { ModelType, NEW_API_ENDPOINT_TYPES } from "@argos/shared/model";
import type { Agent } from "@argos/shared/types/agent-interface";
import { ReasoningEffortSchema, ReasoningVisibilitySchema, VerbositySchema } from "@argos/shared/types/model-db";
import {
  OPENAI_IMAGE_GENERATION_BACKGROUND_VALUES,
  IMAGE_GENERATION_MODERATION_VALUES,
  IMAGE_GENERATION_OUTPUT_FORMAT_VALUES,
  IMAGE_GENERATION_QUALITY_VALUES,
} from "@argos/shared/imageGenerationSettings";
import { TTS_RESPONSE_FORMAT_VALUES } from "@argos/shared/ttsSettings";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | {
      [key: string]: JsonValue;
    };

export const EntityIdSchema = zod.string().min(1);
export const TimestampMsSchema = zod.number().int().nonnegative();

export const ToolCallImagePreviewSchema = zod.object({
  id: zod.string().min(1),
  data: zod.string().min(1).nullable().optional(),
  mimeType: zod.string().min(1),
  title: zod.string().optional(),
  source: zod.enum(["tool_output", "file_read", "screenshot", "mcp_image"]),
});

export const JsonValueSchema: zod.ZodType<JsonValue, unknown> = zod.lazy(() =>
  zod.union([
    zod.string(),
    zod.number(),
    zod.boolean(),
    zod.null(),
    zod.array(JsonValueSchema),
    zod.record(zod.string(), JsonValueSchema),
  ]),
);

export const FileMetadataValueSchema = zod.union([JsonValueSchema, zod.date()]);

export const ImageGenerationOptionsSchema = zod
  .object({
    size: zod.string().optional(),
    quality: zod.enum(IMAGE_GENERATION_QUALITY_VALUES).optional(),
    outputFormat: zod.enum(IMAGE_GENERATION_OUTPUT_FORMAT_VALUES).optional(),
    outputCompression: zod.number().int().min(0).max(100).optional(),
    background: zod.enum(OPENAI_IMAGE_GENERATION_BACKGROUND_VALUES).optional(),
    moderation: zod.enum(IMAGE_GENERATION_MODERATION_VALUES).optional(),
  })
  .optional();

export const VideoGenerationOptionsSchema = zod
  .object({
    seconds: zod.string().optional(),
    size: zod.string().optional(),
    ratio: zod.string().optional(),
    duration: zod.number().int().min(-1).optional(),
    resolution: zod.string().optional(),
    watermark: zod.boolean().optional(),
    generateAudio: zod.boolean().optional(),
    inputReference: zod
      .union([
        zod.string(),
        zod.object({
          data: zod.string(),
          mimeType: zod.string().optional(),
        }),
      ])
      .optional(),
    references: zod
      .array(
        zod
          .object({
            type: zod.enum(["image", "video", "audio"]),
            url: zod.string().optional(),
            data: zod.string().optional(),
            mimeType: zod.string().optional(),
          })
          .refine((value) => Boolean(value.url || value.data)),
      )
      .optional(),
  })
  .optional();

export const TtsSettingsSchema = zod
  .object({
    voice: zod.string().optional(),
    responseFormat: zod.enum(TTS_RESPONSE_FORMAT_VALUES).optional(),
    speed: zod.number().min(0.25).max(4.0).optional(),
    instructions: zod.string().optional(),
  })
  .optional();

export const AppErrorSchema = zod.object({
  code: zod.string(),
  message: zod.string(),
  retriable: zod.boolean().default(false),
  details: zod.record(zod.string(), JsonValueSchema).optional(),
});

export const PermissionModeSchema = zod.enum(["default", "full_access"]);
export const SessionStatusSchema = zod.enum(["idle", "generating", "blocked", "done", "error"]);
export const SessionKindSchema = zod.enum(["regular", "subagent"]);
export const AgentTypeSchema = zod.enum(["argos", "acp"]);
export const AgentSourceSchema = zod.enum(["builtin", "manual", "registry"]);
export const SessionCompactionStateSchema = zod.object({
  status: zod.enum(["idle", "compacting", "compacted"]),
  cursorOrderSeq: zod.number().int().positive(),
  summaryUpdatedAt: TimestampMsSchema.nullable(),
});

export const ArgosSubagentMetaSchema = zod
  .object({
    slotId: EntityIdSchema,
    displayName: zod.string(),
    targetAgentId: EntityIdSchema.nullable().optional(),
  })
  .nullable();

export const SessionGenerationSettingsSchema = zod.object({
  systemPrompt: zod.string(),
  temperature: zod.number(),
  topP: zod.number().min(0.1).max(1).optional(),
  contextLength: zod.number().int(),
  maxTokens: zod.number().int(),
  timeout: zod.number().int(),
  thinkingBudget: zod.number().int().optional(),
  reasoningEffort: ReasoningEffortSchema.optional(),
  reasoningVisibility: ReasoningVisibilitySchema.optional(),
  verbosity: VerbositySchema.optional(),
  forceInterleavedThinkingCompat: zod.boolean().optional(),
  imageGeneration: ImageGenerationOptionsSchema,
  videoGeneration: VideoGenerationOptionsSchema,
});

export const SessionGenerationSettingsPatchSchema = SessionGenerationSettingsSchema.partial();

export const MessageFileSchema = zod.object({
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

export const SendMessageInputSchema = zod.object({
  text: zod.string(),
  files: zod.array(MessageFileSchema).optional(),
});

export const ToolInteractionResponseSchema = zod.discriminatedUnion("kind", [
  zod.object({
    kind: zod.literal("permission"),
    granted: zod.boolean(),
  }),
  zod.object({
    kind: zod.literal("question_option"),
    optionLabel: zod.string(),
  }),
  zod.object({
    kind: zod.literal("question_custom"),
    answerText: zod.string(),
  }),
  zod.object({
    kind: zod.literal("question_other"),
  }),
]);

export const ToolInteractionResultSchema = zod.object({
  resumed: zod.boolean().optional(),
  waitingForUserMessage: zod.boolean().optional(),
  handledInline: zod.boolean().optional(),
});

export const ProviderModelSummarySchema = zod.object({
  id: zod.string().min(1),
  name: zod.string(),
  group: zod.string(),
  providerId: zod.string(),
  enabled: zod.boolean().optional(),
  isCustom: zod.boolean().optional(),
  vision: zod.boolean().optional(),
  functionCall: zod.boolean().optional(),
  reasoning: zod.boolean().optional(),
  enableSearch: zod.boolean().optional(),
  type: zod.enum(ModelType).optional(),
  contextLength: zod.number().int().optional(),
  maxTokens: zod.number().int().optional(),
  description: zod.string().optional(),
  supportedEndpointTypes: zod.array(zod.enum(NEW_API_ENDPOINT_TYPES)).optional(),
  endpointType: zod.enum(NEW_API_ENDPOINT_TYPES).optional(),
  ownedBy: zod.string().optional(),
});

export const SessionWithStateSchema = zod.object({
  id: EntityIdSchema,
  agentId: EntityIdSchema,
  title: zod.string(),
  projectDir: zod.string().nullable(),
  isPinned: zod.boolean(),
  isDraft: zod.boolean().optional(),
  sessionKind: SessionKindSchema,
  parentSessionId: EntityIdSchema.nullable().optional(),
  subagentEnabled: zod.boolean(),
  subagentMeta: ArgosSubagentMetaSchema.optional(),
  createdAt: TimestampMsSchema,
  updatedAt: TimestampMsSchema,
  status: SessionStatusSchema,
  providerId: zod.string(),
  modelId: zod.string(),
});

export const SessionListItemSchema = SessionWithStateSchema.omit({
  providerId: true,
  modelId: true,
});

export const ActiveSessionSummarySchema = SessionWithStateSchema;

export const SessionPageCursorSchema = zod.object({
  updatedAt: TimestampMsSchema,
  id: EntityIdSchema,
});

export const MessagePageCursorSchema = zod.object({
  orderSeq: zod.number().int(),
  id: EntityIdSchema,
});

export const AgentBootstrapItemSchema = zod.object({
  id: EntityIdSchema,
  name: zod.string(),
  type: AgentTypeSchema,
  agentType: AgentTypeSchema.optional(),
  enabled: zod.boolean(),
  protected: zod.boolean().optional(),
  icon: zod.string().optional(),
  description: zod.string().optional(),
  source: AgentSourceSchema.optional(),
  avatar: zod.custom<Agent["avatar"]>().optional(),
});

export const StartupBootstrapShellSchema = zod.object({
  startupRunId: zod.string(),
  activeSessionId: EntityIdSchema.nullable(),
  activeSession: SessionListItemSchema.nullable().optional(),
  agents: zod.array(AgentBootstrapItemSchema),
  defaultProjectPath: zod.string().nullable(),
});

export const StartupWorkloadTargetSchema = zod.enum(["main", "settings"]);
export const StartupWorkloadPhaseSchema = zod.enum(["interactive", "deferred", "background"]);
export const StartupWorkloadStateSchema = zod.enum(["pending", "running", "completed", "failed", "cancelled"]);
export const StartupWorkloadTaskIdSchema = zod.enum([
  "main.bootstrap",
  "main.session.firstPage",
  "main.provider.warmup",
  "settings.providers.summary",
  "settings.provider.models",
  "settings.ollama",
  "settings.skills.catalog",
  "settings.skills.syncScan",
  "settings.mcp.runtime",
  "settings.remote.runtime",
]);

export const StartupWorkloadTaskSchema = zod.object({
  id: StartupWorkloadTaskIdSchema,
  phase: StartupWorkloadPhaseSchema,
  state: StartupWorkloadStateSchema,
  labelKey: zod.string().min(1),
  progress: zod.number().min(0).max(1).optional(),
  startedAt: TimestampMsSchema.optional(),
  updatedAt: TimestampMsSchema.optional(),
});

export const StartupWorkloadChangedPayloadSchema = zod.object({
  startupRunId: zod.string(),
  target: StartupWorkloadTargetSchema,
  tasks: zod.array(StartupWorkloadTaskSchema),
});

export const ChatMessageRecordSchema = zod.object({
  id: EntityIdSchema,
  sessionId: EntityIdSchema,
  orderSeq: zod.number().int(),
  role: zod.enum(["user", "assistant"]),
  content: zod.string(),
  status: zod.enum(["pending", "sent", "error"]),
  isContextEdge: zod.number().int(),
  metadata: zod.string(),
  traceCount: zod.number().int().optional(),
  createdAt: TimestampMsSchema,
  updatedAt: TimestampMsSchema,
});

export const ChatMessagePageResultSchema = zod.object({
  messages: zod.array(ChatMessageRecordSchema),
  nextCursor: MessagePageCursorSchema.nullable(),
  hasMore: zod.boolean(),
});

export const AssistantMessageBlockSchema = zod.object({
  id: EntityIdSchema.optional(),
  type: zod.enum(["content", "search", "reasoning_content", "plan", "error", "tool_call", "action", "image"]),
  content: zod.string().optional(),
  status: zod.enum(["pending", "success", "error", "loading", "granted", "denied"]),
  timestamp: TimestampMsSchema,
  reasoning_time: zod
    .union([
      zod.number(),
      zod.object({
        start: TimestampMsSchema,
        end: TimestampMsSchema,
      }),
    ])
    .optional(),
  image_data: zod
    .object({
      data: zod.string(),
      mimeType: zod.string(),
    })
    .optional(),
  tool_call: zod
    .object({
      id: EntityIdSchema.optional(),
      name: zod.string().optional(),
      params: zod.string().optional(),
      response: zod.string().optional(),
      rtkApplied: zod.boolean().optional(),
      rtkMode: zod.enum(["rewrite", "direct", "bypass"]).optional(),
      rtkFallbackReason: zod.string().optional(),
      imagePreviews: zod.array(ToolCallImagePreviewSchema).optional(),
      server_name: zod.string().optional(),
      server_icons: zod.string().optional(),
      server_description: zod.string().optional(),
    })
    .optional(),
  extra: zod.record(zod.string(), JsonValueSchema).optional(),
  action_type: zod.enum(["tool_call_permission", "question_request", "rate_limit"]).optional(),
});

export interface RouteContract<
  Name extends string = string,
  InputSchema extends zod.ZodTypeAny = zod.ZodTypeAny,
  OutputSchema extends zod.ZodTypeAny = zod.ZodTypeAny,
> {
  name: Name;
  input: InputSchema;
  output: OutputSchema;
}

export interface EventContract<Name extends string = string, PayloadSchema extends zod.ZodTypeAny = zod.ZodTypeAny> {
  name: Name;
  payload: PayloadSchema;
}

export function defineRouteContract<
  const Name extends string,
  InputSchema extends zod.ZodTypeAny,
  OutputSchema extends zod.ZodTypeAny,
>(contract: { name: Name; input: InputSchema; output: OutputSchema }): RouteContract<Name, InputSchema, OutputSchema> {
  return contract;
}

export function defineEventContract<const Name extends string, PayloadSchema extends zod.ZodTypeAny>(contract: {
  name: Name;
  payload: PayloadSchema;
}): EventContract<Name, PayloadSchema> {
  return contract;
}
