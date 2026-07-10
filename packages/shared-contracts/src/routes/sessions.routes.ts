import zod from "zod";
import type { SearchResult } from "@shared/types/core/search";
import type {
  Agent,
  AgentTransferImpact,
  MessageTraceRecord,
  PendingSessionInputRecord,
  SendMessageInput,
} from "@shared/types/agent-interface";
import type { HistorySearchHit } from "@shared/types/presenters/agent-session.presenter";
import type { ArgosTapeViewManifestRecord } from "@shared/types/tape-view-manifest";
import {
  SessionListItemSchema,
  SessionPageCursorSchema,
  MessagePageCursorSchema,
  ChatMessageRecordSchema,
  ChatMessagePageResultSchema,
  EntityIdSchema,
  MessageFileSchema,
  PermissionModeSchema,
  SessionCompactionStateSchema,
  SessionGenerationSettingsSchema,
  SessionGenerationSettingsPatchSchema,
  SessionWithStateSchema,
  defineRouteContract,
} from "../common";
import { AcpConfigStateSchema } from "../domainSchemas";

const PendingSessionInputRecordSchema = zod.custom<PendingSessionInputRecord>();
const MessageTraceRecordSchema = zod.custom<MessageTraceRecord>();
const TapeViewManifestRecordSchema = zod.custom<ArgosTapeViewManifestRecord>();
const HistorySearchHitSchema = zod.custom<HistorySearchHit>();
const SearchResultSchema = zod.custom<SearchResult>();
const AgentSchema = zod.custom<Agent>();
const AgentTransferImpactSchema = zod.custom<AgentTransferImpact>();

const AcpSessionCommandSchema = zod.object({
  name: zod.string(),
  description: zod.string(),
  input: zod
    .object({
      hint: zod.string(),
    })
    .nullable()
    .optional(),
});

export const SessionListFiltersSchema = zod
  .object({
    agentId: EntityIdSchema.optional(),
    projectDir: zod.string().optional(),
    includeSubagents: zod.boolean().optional(),
    parentSessionId: EntityIdSchema.optional(),
  })
  .default({});

export const CreateSessionInputSchema = zod.object({
  agentId: EntityIdSchema,
  message: zod.string(),
  files: zod.array(MessageFileSchema).optional(),
  projectDir: zod.string().optional(),
  providerId: zod.string().optional(),
  modelId: zod.string().optional(),
  permissionMode: PermissionModeSchema.optional(),
  activeSkills: zod.array(zod.string()).optional(),
  disabledAgentTools: zod.array(zod.string()).optional(),
  subagentEnabled: zod.boolean().optional(),
  generationSettings: SessionGenerationSettingsPatchSchema.optional(),
});

export const sessionsCreateRoute = defineRouteContract({
  name: "sessions.create",
  input: CreateSessionInputSchema,
  output: zod.object({
    session: SessionWithStateSchema,
  }),
});

export const sessionsRestoreRoute = defineRouteContract({
  name: "sessions.restore",
  input: zod.object({
    sessionId: EntityIdSchema,
    limit: zod.number().int().positive().max(500).optional(),
  }),
  output: zod.object({
    session: SessionWithStateSchema.nullable(),
    messages: zod.array(ChatMessageRecordSchema),
    nextCursor: MessagePageCursorSchema.nullable(),
    hasMore: zod.boolean(),
  }),
});

export const sessionsListMessagesPageRoute = defineRouteContract({
  name: "sessions.listMessagesPage",
  input: zod.object({
    sessionId: EntityIdSchema,
    cursor: MessagePageCursorSchema.nullable().optional(),
    limit: zod.number().int().positive().max(500).optional(),
  }),
  output: ChatMessagePageResultSchema,
});

export const sessionsListRoute = defineRouteContract({
  name: "sessions.list",
  input: SessionListFiltersSchema,
  output: zod.object({
    sessions: zod.array(SessionWithStateSchema),
  }),
});

export const sessionsListLightweightRoute = defineRouteContract({
  name: "sessions.listLightweight",
  input: zod.object({
    limit: zod.number().int().positive().max(100).optional(),
    cursor: SessionPageCursorSchema.nullable().optional(),
    includeSubagents: zod.boolean().optional(),
    agentId: EntityIdSchema.optional(),
    prioritizeSessionId: EntityIdSchema.optional(),
  }),
  output: zod.object({
    items: zod.array(SessionListItemSchema),
    nextCursor: SessionPageCursorSchema.nullable(),
    hasMore: zod.boolean(),
  }),
});

export const sessionsGetLightweightByIdsRoute = defineRouteContract({
  name: "sessions.getLightweightByIds",
  input: zod.object({
    sessionIds: zod.array(EntityIdSchema),
  }),
  output: zod.object({
    items: zod.array(SessionListItemSchema),
  }),
});

export const sessionsActivateRoute = defineRouteContract({
  name: "sessions.activate",
  input: zod.object({
    sessionId: EntityIdSchema,
  }),
  output: zod.object({
    activated: zod.literal(true),
  }),
});

export const sessionsDeactivateRoute = defineRouteContract({
  name: "sessions.deactivate",
  input: zod.object({}),
  output: zod.object({
    deactivated: zod.literal(true),
  }),
});

export const sessionsGetActiveRoute = defineRouteContract({
  name: "sessions.getActive",
  input: zod.object({}),
  output: zod.object({
    session: SessionWithStateSchema.nullable(),
  }),
});

export const sessionsEnsureAcpDraftRoute = defineRouteContract({
  name: "sessions.ensureAcpDraft",
  input: zod.object({
    agentId: EntityIdSchema,
    projectDir: zod.string().min(1),
    permissionMode: PermissionModeSchema.optional(),
  }),
  output: zod.object({
    session: SessionWithStateSchema,
  }),
});

export const sessionsListPendingInputsRoute = defineRouteContract({
  name: "sessions.listPendingInputs",
  input: zod.object({
    sessionId: EntityIdSchema,
  }),
  output: zod.object({
    items: zod.array(PendingSessionInputRecordSchema),
  }),
});

const PendingInputPayloadSchema = zod.union([zod.string(), zod.custom<SendMessageInput>()]);

export const sessionsQueuePendingInputRoute = defineRouteContract({
  name: "sessions.queuePendingInput",
  input: zod.object({
    sessionId: EntityIdSchema,
    content: PendingInputPayloadSchema,
  }),
  output: zod.object({
    item: PendingSessionInputRecordSchema,
  }),
});

export const sessionsUpdateQueuedInputRoute = defineRouteContract({
  name: "sessions.updateQueuedInput",
  input: zod.object({
    sessionId: EntityIdSchema,
    itemId: EntityIdSchema,
    content: PendingInputPayloadSchema,
  }),
  output: zod.object({
    item: PendingSessionInputRecordSchema,
  }),
});

export const sessionsMoveQueuedInputRoute = defineRouteContract({
  name: "sessions.moveQueuedInput",
  input: zod.object({
    sessionId: EntityIdSchema,
    itemId: EntityIdSchema,
    toIndex: zod.number().int().nonnegative(),
  }),
  output: zod.object({
    items: zod.array(PendingSessionInputRecordSchema),
  }),
});

// Low-level, non-interrupting promote (queue -> steer lane) used by integration tests and external
// agent callers. Interactive clients use sessions.steerPendingInput, which promotes *and* interrupts.
export const sessionsConvertPendingInputToSteerRoute = defineRouteContract({
  name: "sessions.convertPendingInputToSteer",
  input: zod.object({
    sessionId: EntityIdSchema,
    itemId: EntityIdSchema,
  }),
  output: zod.object({
    item: PendingSessionInputRecordSchema,
  }),
});

export const sessionsSteerPendingInputRoute = defineRouteContract({
  name: "sessions.steerPendingInput",
  input: zod.object({
    sessionId: EntityIdSchema,
    itemId: EntityIdSchema,
  }),
  output: zod.object({
    item: PendingSessionInputRecordSchema,
  }),
});

export const sessionsDeletePendingInputRoute = defineRouteContract({
  name: "sessions.deletePendingInput",
  input: zod.object({
    sessionId: EntityIdSchema,
    itemId: EntityIdSchema,
  }),
  output: zod.object({
    deleted: zod.literal(true),
  }),
});

export const sessionsRetryMessageRoute = defineRouteContract({
  name: "sessions.retryMessage",
  input: zod.object({
    sessionId: EntityIdSchema,
    messageId: EntityIdSchema,
  }),
  output: zod.object({
    retried: zod.literal(true),
  }),
});

export const sessionsDeleteMessageRoute = defineRouteContract({
  name: "sessions.deleteMessage",
  input: zod.object({
    sessionId: EntityIdSchema,
    messageId: EntityIdSchema,
  }),
  output: zod.object({
    deleted: zod.literal(true),
  }),
});

export const sessionsEditUserMessageRoute = defineRouteContract({
  name: "sessions.editUserMessage",
  input: zod.object({
    sessionId: EntityIdSchema,
    messageId: EntityIdSchema,
    text: zod.string(),
  }),
  output: zod.object({
    message: ChatMessageRecordSchema,
  }),
});

export const sessionsForkRoute = defineRouteContract({
  name: "sessions.fork",
  input: zod.object({
    sourceSessionId: EntityIdSchema,
    targetMessageId: EntityIdSchema,
    newTitle: zod.string().optional(),
  }),
  output: zod.object({
    session: SessionWithStateSchema,
  }),
});

export const sessionsSearchHistoryRoute = defineRouteContract({
  name: "sessions.searchHistory",
  input: zod.object({
    query: zod.string(),
    options: zod
      .object({
        limit: zod.number().int().positive().optional(),
      })
      .optional(),
  }),
  output: zod.object({
    hits: zod.array(HistorySearchHitSchema),
  }),
});

export const sessionsGetSearchResultsRoute = defineRouteContract({
  name: "sessions.getSearchResults",
  input: zod.object({
    messageId: EntityIdSchema,
    searchId: zod.string().optional(),
  }),
  output: zod.object({
    results: zod.array(SearchResultSchema),
  }),
});

export const sessionsListMessageTracesRoute = defineRouteContract({
  name: "sessions.listMessageTraces",
  input: zod.object({
    messageId: EntityIdSchema,
  }),
  output: zod.object({
    traces: zod.array(MessageTraceRecordSchema),
  }),
});

export const sessionsGetViewManifestsRoute = defineRouteContract({
  name: "sessions.getViewManifests",
  input: zod.object({
    sessionId: EntityIdSchema,
  }),
  output: zod.object({
    manifests: zod.array(TapeViewManifestRecordSchema),
  }),
});

export const sessionsGetViewLineageRoute = defineRouteContract({
  name: "sessions.getViewLineage",
  input: zod.object({
    sessionId: EntityIdSchema,
  }),
  output: zod.object({
    lineage: zod.array(TapeViewManifestRecordSchema),
  }),
});

export const sessionsTranslateTextRoute = defineRouteContract({
  name: "sessions.translateText",
  input: zod.object({
    text: zod.string(),
    locale: zod.string().optional(),
    agentId: EntityIdSchema.optional(),
  }),
  output: zod.object({
    text: zod.string(),
  }),
});

export const sessionsGetAgentsRoute = defineRouteContract({
  name: "sessions.getAgents",
  input: zod.object({}),
  output: zod.object({
    agents: zod.array(AgentSchema),
  }),
});

export const sessionsRenameRoute = defineRouteContract({
  name: "sessions.rename",
  input: zod.object({
    sessionId: EntityIdSchema,
    title: zod.string().min(1),
  }),
  output: zod.object({
    updated: zod.literal(true),
  }),
});

export const sessionsTogglePinnedRoute = defineRouteContract({
  name: "sessions.togglePinned",
  input: zod.object({
    sessionId: EntityIdSchema,
    pinned: zod.boolean(),
  }),
  output: zod.object({
    updated: zod.literal(true),
  }),
});

export const sessionsClearMessagesRoute = defineRouteContract({
  name: "sessions.clearMessages",
  input: zod.object({
    sessionId: EntityIdSchema,
  }),
  output: zod.object({
    cleared: zod.literal(true),
  }),
});

export const sessionsCompactRoute = defineRouteContract({
  name: "sessions.compact",
  input: zod.object({
    sessionId: EntityIdSchema,
  }),
  output: zod.object({
    compacted: zod.boolean(),
    state: SessionCompactionStateSchema,
  }),
});

export const sessionsExportRoute = defineRouteContract({
  name: "sessions.export",
  input: zod.object({
    sessionId: EntityIdSchema,
    format: zod.enum(["markdown", "html", "txt", "nowledge-mem"]),
  }),
  output: zod.object({
    filename: zod.string(),
    content: zod.string(),
  }),
});

export const sessionsDeleteRoute = defineRouteContract({
  name: "sessions.delete",
  input: zod.object({
    sessionId: EntityIdSchema,
  }),
  output: zod.object({
    deleted: zod.literal(true),
  }),
});

export const sessionsGetAgentTransferImpactRoute = defineRouteContract({
  name: "sessions.getAgentTransferImpact",
  input: zod.object({
    agentId: EntityIdSchema,
  }),
  output: zod.object({
    impact: AgentTransferImpactSchema,
  }),
});

export const sessionsMoveAgentSessionsRoute = defineRouteContract({
  name: "sessions.moveAgentSessions",
  input: zod.object({
    fromAgentId: EntityIdSchema,
    toAgentId: EntityIdSchema,
  }),
  output: zod.object({
    movedSessionIds: zod.array(EntityIdSchema),
    deletedSessionIds: zod.array(EntityIdSchema),
  }),
});

export const sessionsDeleteAgentSessionsRoute = defineRouteContract({
  name: "sessions.deleteAgentSessions",
  input: zod.object({
    agentId: EntityIdSchema,
  }),
  output: zod.object({
    deletedSessionIds: zod.array(EntityIdSchema),
  }),
});

export const sessionsMoveToAgentRoute = defineRouteContract({
  name: "sessions.moveToAgent",
  input: zod.object({
    sessionId: EntityIdSchema,
    toAgentId: EntityIdSchema,
  }),
  output: zod.object({
    session: SessionWithStateSchema,
  }),
});

export const sessionsGetAcpSessionCommandsRoute = defineRouteContract({
  name: "sessions.getAcpSessionCommands",
  input: zod.object({
    sessionId: EntityIdSchema,
  }),
  output: zod.object({
    commands: zod.array(AcpSessionCommandSchema),
  }),
});

export const sessionsGetAcpSessionConfigOptionsRoute = defineRouteContract({
  name: "sessions.getAcpSessionConfigOptions",
  input: zod.object({
    sessionId: EntityIdSchema,
  }),
  output: zod.object({
    state: AcpConfigStateSchema.nullable(),
  }),
});

export const sessionsSetAcpSessionConfigOptionRoute = defineRouteContract({
  name: "sessions.setAcpSessionConfigOption",
  input: zod.object({
    sessionId: EntityIdSchema,
    configId: zod.string(),
    value: zod.union([zod.string(), zod.boolean()]),
  }),
  output: zod.object({
    state: AcpConfigStateSchema.nullable(),
  }),
});

export const sessionsGetPermissionModeRoute = defineRouteContract({
  name: "sessions.getPermissionMode",
  input: zod.object({
    sessionId: EntityIdSchema,
  }),
  output: zod.object({
    mode: PermissionModeSchema,
  }),
});

export const sessionsSetPermissionModeRoute = defineRouteContract({
  name: "sessions.setPermissionMode",
  input: zod.object({
    sessionId: EntityIdSchema,
    mode: PermissionModeSchema,
  }),
  output: zod.object({
    updated: zod.literal(true),
  }),
});

export const sessionsSetSubagentEnabledRoute = defineRouteContract({
  name: "sessions.setSubagentEnabled",
  input: zod.object({
    sessionId: EntityIdSchema,
    enabled: zod.boolean(),
  }),
  output: zod.object({
    session: SessionWithStateSchema,
  }),
});

export const sessionsSetModelRoute = defineRouteContract({
  name: "sessions.setModel",
  input: zod.object({
    sessionId: EntityIdSchema,
    providerId: zod.string().min(1),
    modelId: zod.string().min(1),
  }),
  output: zod.object({
    session: SessionWithStateSchema,
  }),
});

export const sessionsSetProjectDirRoute = defineRouteContract({
  name: "sessions.setProjectDir",
  input: zod.object({
    sessionId: EntityIdSchema,
    projectDir: zod.string().nullable(),
  }),
  output: zod.object({
    session: SessionWithStateSchema,
  }),
});

export const sessionsGetGenerationSettingsRoute = defineRouteContract({
  name: "sessions.getGenerationSettings",
  input: zod.object({
    sessionId: EntityIdSchema,
  }),
  output: zod.object({
    settings: SessionGenerationSettingsSchema.nullable(),
  }),
});

export const sessionsGetDisabledAgentToolsRoute = defineRouteContract({
  name: "sessions.getDisabledAgentTools",
  input: zod.object({
    sessionId: EntityIdSchema,
  }),
  output: zod.object({
    disabledAgentTools: zod.array(zod.string()),
  }),
});

export const sessionsUpdateDisabledAgentToolsRoute = defineRouteContract({
  name: "sessions.updateDisabledAgentTools",
  input: zod.object({
    sessionId: EntityIdSchema,
    disabledAgentTools: zod.array(zod.string()),
  }),
  output: zod.object({
    disabledAgentTools: zod.array(zod.string()),
  }),
});

export const sessionsUpdateGenerationSettingsRoute = defineRouteContract({
  name: "sessions.updateGenerationSettings",
  input: zod.object({
    sessionId: EntityIdSchema,
    settings: SessionGenerationSettingsPatchSchema,
  }),
  output: zod.object({
    settings: SessionGenerationSettingsSchema,
  }),
});

export const sessionsResumePendingQueueRoute = defineRouteContract({
  name: "sessions.resumePendingQueue",
  input: zod.object({
    sessionId: EntityIdSchema,
  }),
  output: zod.object({
    resumed: zod.literal(true),
  }),
});
