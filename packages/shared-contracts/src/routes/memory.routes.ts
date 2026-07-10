import zod from "zod";
import { defineRouteContract } from "../common";
import { AGENT_MEMORY_CATEGORIES } from "@shared/types/agent-memory";

const AgentIdSchema = zod.string().regex(/^[a-zA-Z0-9_-]{1,128}$/, "invalid agentId");

export const MemoryItemSchema = zod.object({
  id: zod.string(),
  agentId: zod.string(),
  kind: zod.enum(["episodic", "semantic", "reflection", "persona", "working"]),
  category: zod.enum(AGENT_MEMORY_CATEGORIES).nullable(),
  content: zod.string(),
  importance: zod.number(),
  status: zod.enum(["pending_embedding", "embedded", "error", "fts_only", "archived", "conflicted"]),
  sourceSession: zod.string().nullable(),
  sourceEntryIds: zod.array(zod.number().int().nonnegative()).nullable(),
  supersededBy: zod.string().nullable(),
  createdAt: zod.number(),
  confidence: zod.number().nullable().optional(),
  personaState: zod.enum(["draft", "active", "superseded", "rejected"]).nullable().optional(),
  isAnchor: zod.boolean().optional(),
});

export const MemorySearchResultSchema = MemoryItemSchema.extend({
  score: zod.number(),
  sources: zod.object({ vec: zod.boolean().optional(), fts: zod.boolean().optional() }).optional(),
  similarity: zod.number().optional(),
});

export const MemoryAddResultSchema = zod.object({
  action: zod.enum(["created", "updated", "superseded", "challenged", "noop"]),
  memoryId: zod.string().optional(),
  supersededId: zod.string().optional(),
  conflictWith: zod.string().optional(),
  reason: zod.string().optional(),
});

export const MemoryStatusSchema = zod.object({
  total: zod.number(),
  pendingEmbedding: zod.number(),
  hasPersona: zod.boolean(),
  reindexing: zod.boolean().optional(),
});

export const memoryListRoute = defineRouteContract({
  name: "memory.list",
  input: zod.object({ agentId: AgentIdSchema }),
  output: zod.object({ memories: zod.array(MemoryItemSchema) }),
});

export const memoryGetStatusRoute = defineRouteContract({
  name: "memory.getStatus",
  input: zod.object({ agentId: AgentIdSchema }),
  output: zod.object({ status: MemoryStatusSchema }),
});

export const memorySearchRoute = defineRouteContract({
  name: "memory.search",
  input: zod.object({
    agentId: AgentIdSchema,
    query: zod.string(),
    limit: zod.number().int().positive().max(500).optional(),
  }),
  output: zod.object({ results: zod.array(MemorySearchResultSchema) }),
});

export const memoryAddRoute = defineRouteContract({
  name: "memory.add",
  input: zod.object({
    agentId: AgentIdSchema,
    content: zod.string().min(1),
    kind: zod.enum(["episodic", "semantic"]).optional(),
    category: zod.enum(AGENT_MEMORY_CATEGORIES).optional(),
    importance: zod.number().min(0).max(1).optional(),
  }),
  output: zod.object({ result: MemoryAddResultSchema }),
});

export const memoryDeleteRoute = defineRouteContract({
  name: "memory.delete",
  input: zod.object({ agentId: AgentIdSchema, memoryId: zod.string() }),
  output: zod.object({ ok: zod.boolean() }),
});

export const memoryClearRoute = defineRouteContract({
  name: "memory.clear",
  input: zod.object({ agentId: AgentIdSchema }),
  output: zod.object({ removed: zod.number() }),
});

export type MemoryItem = zod.infer<typeof MemoryItemSchema>;
export type MemorySearchResult = zod.infer<typeof MemorySearchResultSchema>;
export type MemoryAddResult = zod.infer<typeof MemoryAddResultSchema>;
export type MemoryStatusDto = zod.infer<typeof MemoryStatusSchema>;
