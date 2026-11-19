/**
 * Zod schemas for MCP protocol messages, sourced from
 * `@modelcontextprotocol/core` (v2's schema package — the successor of 1.x's
 * `@modelcontextprotocol/sdk/types.js` exports).
 *
 * In-memory MCP servers, backend-core's knowledge server, and the desktop
 * test-suite import these schemas (plus `Server`/`Transport` from the other
 * re-exports) instead of touching either SDK version directly.
 */
export {
  CallToolRequestSchema,
  CallToolRequestParamsSchema,
  CallToolResultSchema,
  ListToolsRequestSchema,
  ListToolsResultSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  GetPromptResultSchema,
  ListResourcesRequestSchema,
  ListResourcesResultSchema,
  ListResourceTemplatesRequestSchema,
  ReadResourceRequestSchema,
  ReadResourceResultSchema,
  CompleteRequestSchema,
  CompleteResultSchema,
  CreateMessageRequestSchema,
  CreateMessageResultSchema,
  ElicitRequestSchema,
  ElicitResultSchema,
  ListRootsRequestSchema,
  ListRootsResultSchema,
  LoggingMessageNotificationSchema,
  LoggingMessageNotificationParamsSchema,
  ToolListChangedNotificationSchema,
  PromptListChangedNotificationSchema,
  ResourceListChangedNotificationSchema,
  ResourceUpdatedNotificationSchema,
  ResourceUpdatedNotificationParamsSchema,
} from "@modelcontextprotocol/core";

/** Transport interface shared by client and server protocol instances. */
export type { Transport } from "@modelcontextprotocol/client";
