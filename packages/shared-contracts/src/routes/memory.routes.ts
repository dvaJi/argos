import { z } from "zod";
import { defineRouteContract } from "../common";
import { AGENT_MEMORY_CATEGORIES } from "@shared/types/agent-memory";

const AgentIdSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/, "invalid agentId");

export const MemoryItemSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  kind: z.enum(["episodic", "semantic", "reflection", "persona", "working"]),
  category: z.enum(AGENT_MEMORY_CATEGORIES).nullable(),
  content: z.string(),
  importance: z.number(),
  status: z.enum(["pending_embedding", "embedded", "error", "fts_only", "archived", "conflicted"]),
  sourceSession: z.string().nullable(),
  sourceEntryIds: z.array(z.number().int().nonnegative()).nullable(),
  supersededBy: z.string().nullable(),
  createdAt: z.number(),
  confidence: z.number().nullable().optional(),
  personaState: z.enum(["draft", "active", "superseded", "rejected"]).nullable().optional(),
  isAnchor: z.boolean().optional(),
});

export const MemorySearchResultSchema = MemoryItemSchema.extend({
  score: z.number(),
  sources: z.object({ vec: z.boolean().optional(), fts: z.boolean().optional() }).optional(),
  similarity: z.number().optional(),
});

export const MemoryAddResultSchema = z.object({
  action: z.enum(["created", "updated", "superseded", "challenged", "noop"]),
  memoryId: z.string().optional(),
  supersededId: z.string().optional(),
  conflictWith: z.string().optional(),
  reason: z.string().optional(),
});

export const MemoryStatusSchema = z.object({
  total: z.number(),
  pendingEmbedding: z.number(),
  hasPersona: z.boolean(),
  reindexing: z.boolean().optional(),
});

export const memoryListRoute = defineRouteContract({
  name: "memory.list",
  input: z.object({ agentId: AgentIdSchema }),
  output: z.object({ memories: z.array(MemoryItemSchema) }),
});

export const memoryGetStatusRoute = defineRouteContract({
  name: "memory.getStatus",
  input: z.object({ agentId: AgentIdSchema }),
  output: z.object({ status: MemoryStatusSchema }),
});

export const memorySearchRoute = defineRouteContract({
  name: "memory.search",
  input: z.object({
    agentId: AgentIdSchema,
    query: z.string(),
    limit: z.number().int().positive().max(500).optional(),
  }),
  output: z.object({ results: z.array(MemorySearchResultSchema) }),
});

export const memoryAddRoute = defineRouteContract({
  name: "memory.add",
  input: z.object({
    agentId: AgentIdSchema,
    content: z.string().min(1),
    kind: z.enum(["episodic", "semantic"]).optional(),
    category: z.enum(AGENT_MEMORY_CATEGORIES).optional(),
    importance: z.number().min(0).max(1).optional(),
  }),
  output: z.object({ result: MemoryAddResultSchema }),
});

export const memoryDeleteRoute = defineRouteContract({
  name: "memory.delete",
  input: z.object({ agentId: AgentIdSchema, memoryId: z.string() }),
  output: z.object({ ok: z.boolean() }),
});

export const memoryClearRoute = defineRouteContract({
  name: "memory.clear",
  input: z.object({ agentId: AgentIdSchema }),
  output: z.object({ removed: z.number() }),
});

export type MemoryItem = z.infer<typeof MemoryItemSchema>;
export type MemorySearchResult = z.infer<typeof MemorySearchResultSchema>;
export type MemoryAddResult = z.infer<typeof MemoryAddResultSchema>;
export type MemoryStatusDto = z.infer<typeof MemoryStatusSchema>;
