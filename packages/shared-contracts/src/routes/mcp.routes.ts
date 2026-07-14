import zod from "zod";
import type {
  MCPServerConfig,
  MCPToolCall,
  MCPToolDefinition,
  MCPToolResponse,
  McpClient,
  McpSamplingDecision,
  PromptListEntry,
  Resource,
  ResourceListEntry,
} from "@argos/shared/presenter";
import { defineRouteContract } from "../common";

const MCPServerConfigSchema = zod.custom<MCPServerConfig>();
const McpClientSchema = zod.custom<McpClient>();
const MCPToolDefinitionSchema = zod.custom<MCPToolDefinition>();
const PromptListEntrySchema = zod.custom<PromptListEntry>();
const ResourceListEntrySchema = zod.custom<ResourceListEntry>();
const ResourceSchema = zod.custom<Resource>();
const MCPToolCallSchema = zod.custom<MCPToolCall>();
const MCPToolResponseSchema = zod.custom<MCPToolResponse>();
const McpSamplingDecisionSchema = zod.custom<McpSamplingDecision>();
const NpmRegistryStatusSchema = zod.custom<{
  currentRegistry: string | null;
  isFromCache: boolean;
  lastChecked?: number;
  autoDetectEnabled: boolean;
  customRegistry?: string;
}>();

export const mcpGetServersRoute = defineRouteContract({
  name: "mcp.getServers",
  input: zod.object({}),
  output: zod.object({
    servers: zod.record(zod.string(), MCPServerConfigSchema),
  }),
});

export const mcpGetEnabledRoute = defineRouteContract({
  name: "mcp.getEnabled",
  input: zod.object({}),
  output: zod.object({
    enabled: zod.boolean(),
  }),
});

export const mcpGetClientsRoute = defineRouteContract({
  name: "mcp.getClients",
  input: zod.object({}),
  output: zod.object({
    clients: zod.array(McpClientSchema),
  }),
});

export const mcpListToolDefinitionsRoute = defineRouteContract({
  name: "mcp.listToolDefinitions",
  input: zod.object({
    enabledMcpTools: zod.array(zod.string()).optional(),
  }),
  output: zod.object({
    tools: zod.array(MCPToolDefinitionSchema),
  }),
});

export const mcpListPromptsRoute = defineRouteContract({
  name: "mcp.listPrompts",
  input: zod.object({}),
  output: zod.object({
    prompts: zod.array(PromptListEntrySchema),
  }),
});

export const mcpListResourcesRoute = defineRouteContract({
  name: "mcp.listResources",
  input: zod.object({}),
  output: zod.object({
    resources: zod.array(ResourceListEntrySchema),
  }),
});

export const mcpCallToolRoute = defineRouteContract({
  name: "mcp.callTool",
  input: zod.object({
    request: MCPToolCallSchema,
  }),
  output: zod.object({
    content: zod.string(),
    rawData: MCPToolResponseSchema,
  }),
});

export const mcpAddServerRoute = defineRouteContract({
  name: "mcp.addServer",
  input: zod.object({
    serverName: zod.string(),
    config: MCPServerConfigSchema,
  }),
  output: zod.object({
    success: zod.boolean(),
  }),
});

export const mcpUpdateServerRoute = defineRouteContract({
  name: "mcp.updateServer",
  input: zod.object({
    serverName: zod.string(),
    config: zod.custom<Partial<MCPServerConfig>>(),
  }),
  output: zod.object({
    updated: zod.literal(true),
  }),
});

export const mcpRemoveServerRoute = defineRouteContract({
  name: "mcp.removeServer",
  input: zod.object({
    serverName: zod.string(),
  }),
  output: zod.object({
    removed: zod.literal(true),
  }),
});

export const mcpSetServerEnabledRoute = defineRouteContract({
  name: "mcp.setServerEnabled",
  input: zod.object({
    serverName: zod.string(),
    enabled: zod.boolean(),
  }),
  output: zod.object({
    enabled: zod.boolean(),
  }),
});

export const mcpSetEnabledRoute = defineRouteContract({
  name: "mcp.setEnabled",
  input: zod.object({
    enabled: zod.boolean(),
  }),
  output: zod.object({
    enabled: zod.boolean(),
  }),
});

export const mcpIsServerRunningRoute = defineRouteContract({
  name: "mcp.isServerRunning",
  input: zod.object({
    serverName: zod.string(),
  }),
  output: zod.object({
    running: zod.boolean(),
  }),
});

export const mcpStartServerRoute = defineRouteContract({
  name: "mcp.startServer",
  input: zod.object({
    serverName: zod.string(),
  }),
  output: zod.object({
    started: zod.literal(true),
  }),
});

export const mcpStopServerRoute = defineRouteContract({
  name: "mcp.stopServer",
  input: zod.object({
    serverName: zod.string(),
  }),
  output: zod.object({
    stopped: zod.literal(true),
  }),
});

export const mcpGetPromptRoute = defineRouteContract({
  name: "mcp.getPrompt",
  input: zod.object({
    prompt: PromptListEntrySchema,
    args: zod.record(zod.string(), zod.unknown()).optional(),
  }),
  output: zod.object({
    result: zod.unknown(),
  }),
});

export const mcpReadResourceRoute = defineRouteContract({
  name: "mcp.readResource",
  input: zod.object({
    resource: ResourceListEntrySchema,
  }),
  output: zod.object({
    resource: ResourceSchema,
  }),
});

export const mcpSubmitSamplingDecisionRoute = defineRouteContract({
  name: "mcp.submitSamplingDecision",
  input: zod.object({
    decision: McpSamplingDecisionSchema,
  }),
  output: zod.object({
    submitted: zod.literal(true),
  }),
});

export const mcpCancelSamplingRequestRoute = defineRouteContract({
  name: "mcp.cancelSamplingRequest",
  input: zod.object({
    requestId: zod.string(),
    reason: zod.string().optional(),
  }),
  output: zod.object({
    cancelled: zod.literal(true),
  }),
});

export const mcpGetNpmRegistryStatusRoute = defineRouteContract({
  name: "mcp.getNpmRegistryStatus",
  input: zod.object({}),
  output: zod.object({
    status: NpmRegistryStatusSchema,
  }),
});

export const mcpRefreshNpmRegistryRoute = defineRouteContract({
  name: "mcp.refreshNpmRegistry",
  input: zod.object({}),
  output: zod.object({
    registry: zod.string(),
  }),
});

export const mcpSetCustomNpmRegistryRoute = defineRouteContract({
  name: "mcp.setCustomNpmRegistry",
  input: zod.object({
    registry: zod.string().optional(),
  }),
  output: zod.object({
    updated: zod.literal(true),
  }),
});

export const mcpSetAutoDetectNpmRegistryRoute = defineRouteContract({
  name: "mcp.setAutoDetectNpmRegistry",
  input: zod.object({
    enabled: zod.boolean(),
  }),
  output: zod.object({
    enabled: zod.boolean(),
  }),
});

export const mcpClearNpmRegistryCacheRoute = defineRouteContract({
  name: "mcp.clearNpmRegistryCache",
  input: zod.object({}),
  output: zod.object({
    cleared: zod.literal(true),
  }),
});

const McpRouterServerSchema = zod.object({
  uuid: zod.string().optional(),
  created_at: zod.string(),
  updated_at: zod.string(),
  name: zod.string(),
  author_name: zod.string(),
  title: zod.string(),
  description: zod.string(),
  content: zod.string().optional(),
  server_key: zod.string(),
  config_name: zod.string().optional(),
  server_url: zod.string().optional(),
});

export const mcpListMcpRouterServersRoute = defineRouteContract({
  name: "mcp.listMcpRouterServers",
  input: zod.object({
    page: zod.number(),
    limit: zod.number(),
  }),
  output: zod.object({
    servers: zod.array(McpRouterServerSchema),
  }),
});

export const mcpInstallMcpRouterServerRoute = defineRouteContract({
  name: "mcp.installMcpRouterServer",
  input: zod.object({
    serverKey: zod.string(),
  }),
  output: zod.object({
    installed: zod.boolean(),
  }),
});

export const mcpGetMcpRouterApiKeyRoute = defineRouteContract({
  name: "mcp.getMcpRouterApiKey",
  input: zod.object({}),
  output: zod.object({
    apiKey: zod.string(),
  }),
});

export const mcpSetMcpRouterApiKeyRoute = defineRouteContract({
  name: "mcp.setMcpRouterApiKey",
  input: zod.object({
    key: zod.string(),
  }),
  output: zod.object({
    set: zod.literal(true),
  }),
});

export const mcpIsServerInstalledRoute = defineRouteContract({
  name: "mcp.isServerInstalled",
  input: zod.object({
    source: zod.string(),
    sourceId: zod.string(),
  }),
  output: zod.object({
    installed: zod.boolean(),
  }),
});

export const mcpUpdateMcpRouterServersAuthRoute = defineRouteContract({
  name: "mcp.updateMcpRouterServersAuth",
  input: zod.object({
    apiKey: zod.string(),
  }),
  output: zod.object({
    updated: zod.literal(true),
  }),
});
