import zod from "zod";

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

/**
 * Params-only schemas for the v2 3-arg `setRequestHandler(method, { params }, handler)`
 * form: v2 validates the request's PARAMS against the schema and hands the
 * handler the parsed params directly (loose objects keep unknown keys so
 * `_meta` and task extensions survive). Core's `*RequestSchema` exports are
 * FULL-request shapes (with `method` literals) and cannot be used here.
 */
export const ToolsListParamsSchema = zod.looseObject({
  cursor: zod.string().optional(),
});

export const ToolsCallParamsSchema = zod.looseObject({
  name: zod.string(),
  arguments: zod.record(zod.string(), zod.unknown()).optional(),
});

export type ToolsCallParams = zod.infer<typeof ToolsCallParamsSchema>;

/** Transport interface shared by client and server protocol instances. */
export type { Transport } from "@modelcontextprotocol/client";
