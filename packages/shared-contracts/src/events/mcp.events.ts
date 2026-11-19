import zod from "zod";
import type {
  MCPServerConfig,
  McpElicitationDecision,
  McpElicitationRequestPayload,
  McpSamplingDecision,
  McpSamplingRequestPayload,
} from "@argos/shared/presenter";
import { defineEventContract } from "../common";

const McpSamplingRequestSchema = zod.custom<McpSamplingRequestPayload>();
const McpSamplingDecisionSchema = zod.custom<McpSamplingDecision>();
const McpElicitationRequestSchema = zod.custom<McpElicitationRequestPayload>();
const McpElicitationDecisionSchema = zod.custom<McpElicitationDecision>();
const MCPServerConfigSchema = zod.custom<MCPServerConfig>();

export const mcpServerStartedEvent = defineEventContract({
  name: "mcp.server.started",
  payload: zod.object({
    serverName: zod.string(),
    version: zod.number().int(),
  }),
});

export const mcpServerStoppedEvent = defineEventContract({
  name: "mcp.server.stopped",
  payload: zod.object({
    serverName: zod.string(),
    version: zod.number().int(),
  }),
});

export const mcpConfigChangedEvent = defineEventContract({
  name: "mcp.config.changed",
  payload: zod.object({
    mcpServers: zod.record(zod.string(), MCPServerConfigSchema),
    mcpEnabled: zod.boolean(),
    version: zod.number().int(),
  }),
});

export const mcpServerStatusChangedEvent = defineEventContract({
  name: "mcp.server.status.changed",
  payload: zod.object({
    serverName: zod.string(),
    isRunning: zod.boolean(),
    version: zod.number().int(),
  }),
});

export const mcpToolCallResultEvent = defineEventContract({
  name: "mcp.toolCall.result",
  payload: zod.object({
    functionName: zod.string().optional(),
    content: zod.custom<string | { type: string; text: string }[]>(),
    version: zod.number().int(),
  }),
});

export const mcpToolCallProgressEvent = defineEventContract({
  name: "mcp:tool-call-progress",
  payload: zod.object({
    serverName: zod.string(),
    toolName: zod.string(),
    taskId: zod.string().nullable(),
    status: zod.string().nullable(),
    statusMessage: zod.string().nullable(),
  }),
});

export const mcpElicitationRequestEvent = defineEventContract({
  name: "mcp.elicitation.request",
  payload: zod.object({
    request: McpElicitationRequestSchema,
    version: zod.number().int(),
  }),
});

export const mcpElicitationDecisionEvent = defineEventContract({
  name: "mcp.elicitation.decision",
  payload: zod.object({
    decision: McpElicitationDecisionSchema,
    version: zod.number().int(),
  }),
});

export const mcpElicitationCancelledEvent = defineEventContract({
  name: "mcp.elicitation.cancelled",
  payload: zod.object({
    requestId: zod.string(),
  }),
});

export const mcpSamplingRequestEvent = defineEventContract({
  name: "mcp.sampling.request",
  payload: zod.object({
    request: McpSamplingRequestSchema,
    version: zod.number().int(),
  }),
});

export const mcpSamplingDecisionEvent = defineEventContract({
  name: "mcp.sampling.decision",
  payload: zod.object({
    decision: McpSamplingDecisionSchema,
    version: zod.number().int(),
  }),
});

export const mcpSamplingCancelledEvent = defineEventContract({
  name: "mcp.sampling.cancelled",
  payload: zod.object({
    requestId: zod.string(),
    reason: zod.string().optional(),
    version: zod.number().int(),
  }),
});
