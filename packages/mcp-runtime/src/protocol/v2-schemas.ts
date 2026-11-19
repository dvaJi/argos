import zod from "zod";

/**
 * Zod schemas for MCP protocol messages, providing the schemas that the v2
 * packages no longer export. These are used with the v2 3-arg
 * `setRequestHandler(method, { params, result }, handler)` form and with
 * `client.request(method, params)` calls.
 *
 * Only the message shapes Argos actually uses are defined here.
 */

// ── Content blocks ────────────────────────────────────────────────────

export const TextContentSchema = zod.object({
  type: zod.literal("text"),
  text: zod.string(),
});

export const ImageContentSchema = zod.object({
  type: zod.literal("image"),
  data: zod.string(),
  mimeType: zod.string(),
});

export const ContentBlockSchema = zod.union([
  TextContentSchema,
  ImageContentSchema,
  zod.object({ type: zod.literal("audio"), data: zod.string(), mimeType: zod.string() }),
  zod.object({ type: zod.literal("resource_link"), uri: zod.string(), name: zod.string().optional() }),
  zod.object({ type: zod.literal("resource"), resource: zod.unknown() }),
  zod.object({ type: zod.string() }),
]);

// ── Tools ─────────────────────────────────────────────────────────────

export const CallToolRequestParamsSchema = zod.object({
  name: zod.string(),
  arguments: zod.record(zod.string(), zod.unknown()).optional(),
});

export const CallToolResultSchema = zod.object({
  content: zod.array(
    zod.union([
      zod.object({ type: zod.literal("text"), text: zod.string() }),
      zod.object({ type: zod.literal("image"), data: zod.string(), mimeType: zod.string() }),
      zod.object({ type: zod.literal("audio"), data: zod.string(), mimeType: zod.string() }),
      zod.object({ type: zod.literal("resource_link"), uri: zod.string(), name: zod.string().optional() }),
      zod.object({ type: zod.literal("resource"), resource: zod.unknown() }),
    ]),
  ),
  isError: zod.boolean().optional(),
});

export const ListToolsRequestSchema = zod.object({});

/** Full request schema with method literal (for server-side setRequestHandler). */
export const CallToolRequestSchema = zod.object({
  method: zod.literal("tools/call"),
  params: CallToolRequestParamsSchema,
});

export const ListToolsResultSchema = zod.object({
  tools: zod.array(zod.unknown()),
});

// ── Prompts ───────────────────────────────────────────────────────────

export const ListPromptsRequestSchema = zod.object({});
export const GetPromptRequestSchema = zod.object({
  name: zod.string(),
  arguments: zod.record(zod.string(), zod.string()).optional(),
});

// ── Resources ─────────────────────────────────────────────────────────

export const ListResourcesRequestSchema = zod.object({});
export const ListResourceTemplatesRequestSchema = zod.object({});
export const ReadResourceRequestSchema = zod.object({ uri: zod.string() });

// ── Roots ─────────────────────────────────────────────────────────────

export const ListRootsRequestSchema = zod.object({});
export const ListRootsResultSchema = zod.object({
  roots: zod.array(
    zod.object({
      uri: zod.string(),
      name: zod.string().optional(),
    }),
  ),
});

// ── Sampling ──────────────────────────────────────────────────────────

export const CreateMessageRequestSchema = zod.object({
  messages: zod.array(zod.unknown()),
  systemPrompt: zod.string().optional(),
  maxTokens: zod.number().optional(),
  modelPreferences: zod.unknown().optional(),
});

// ── Elicitation ───────────────────────────────────────────────────────

export const ElicitRequestParamsSchema = zod.object({
  message: zod.string(),
  requestedSchema: zod.unknown().optional(),
  url: zod.string().optional(),
  elicitationId: zod.string().optional(),
  mode: zod.string().optional(),
  sessionId: zod.string().optional(),
  toolCallId: zod.string().nullable().optional(),
});

export const ElicitResultSchema = zod.object({
  action: zod.enum(["accept", "decline", "cancel"]),
  content: zod
    .record(zod.string(), zod.union([zod.string(), zod.number(), zod.boolean(), zod.array(zod.string())]))
    .optional(),
});

// ── Notifications ─────────────────────────────────────────────────────

export const ToolListChangedNotificationSchema = zod.object({});
export const PromptListChangedNotificationSchema = zod.object({});
export const ResourceListChangedNotificationSchema = zod.object({});
export const ResourceUpdatedNotificationSchema = zod.object({ uri: zod.string() });
export const LoggingMessageNotificationSchema = zod.object({
  level: zod.string(),
  data: zod.unknown().optional(),
});
