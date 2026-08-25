import type { AgentMemoryCategory } from "@argos/shared/types/agent-memory";
import type { ArgosAgentConfig, ArgosAgentMemoryRetrieval } from "@argos/shared/types/agent-interface";
import type {
  AgentMemoryInsertInput,
  AgentMemoryKind,
  AgentMemoryListOptions,
  AgentMemoryRow,
  AgentMemoryStatus,
} from "@argos/memory-runtime";

export type { AgentMemoryInsertInput, AgentMemoryKind, AgentMemoryListOptions, AgentMemoryRow, AgentMemoryStatus };

export interface MemoryRepositoryPort {
  insert(input: AgentMemoryInsertInput): AgentMemoryRow;
  getById(id: string): AgentMemoryRow | undefined;
  getByProvenanceKey(agentId: string, provenanceKey: string): AgentMemoryRow | undefined;
  listByAgent(agentId: string, options?: AgentMemoryListOptions): AgentMemoryRow[];
  getActivePersona(agentId: string): AgentMemoryRow | undefined;
  listPersonaVersions(agentId: string): AgentMemoryRow[];
  search(agentId: string, query: string, limit?: number): AgentMemoryRow[];
  listPendingEmbedding(limit?: number, agentId?: string): AgentMemoryRow[];
  updateStatus(
    id: string,
    status: AgentMemoryStatus,
    embedding?: {
      embeddingId?: string | null;
      embeddingDim?: number | null;
      embeddingModel?: string | null;
    },
  ): void;
  requeueForEmbedding(agentId: string, statuses: AgentMemoryStatus[]): number;
  markSuperseded(id: string, supersededBy: string | null): void;
  recordAccess(id: string, accessedAt?: number): void;
  delete(id: string): void;
  clearByAgent(agentId: string): number;
  countByAgent(agentId: string): number;
}

export interface MemoryVectorRecord {
  memoryId: string;
  embedding: number[];
}

export interface MemoryVectorMatch {
  memoryId: string;
  distance: number;
}

export interface MemoryVectorQueryOptions {
  topK: number;
  threshold?: number;
}

export interface IMemoryVectorStore {
  upsert(records: MemoryVectorRecord[]): Promise<void>;
  query(embedding: number[], options: MemoryVectorQueryOptions): Promise<MemoryVectorMatch[]>;
  deleteByMemoryIds(memoryIds: string[]): Promise<void>;
  close(): Promise<void>;
  isUsable(): boolean;
}

export interface MemoryCandidate {
  kind: AgentMemoryKind;
  content: string;
  category?: AgentMemoryCategory | null;
  confidence?: number | null;
  importance?: number;
  isAnchor?: boolean;
}

export interface NormalizedMemoryCandidate {
  kind: AgentMemoryKind;
  category: AgentMemoryCategory | null;
  content: string;
  importance: number;
}

export type MemoryWriteOutcome =
  | { action: "created"; id: string }
  | { action: "updated"; id: string }
  | { action: "superseded"; id: string; supersededId: string; created?: boolean }
  | { action: "noop"; reason: string; id?: string }
  | { action: "challenged"; targetId: string; challengerId: string };

export interface WriteMemoriesOptions {
  agentId: string;
  sourceSession?: string | null;
  userScope?: string | null;
  sourceEntryIds?: number[] | null;
}

export interface MemoryRecallItem {
  id: string;
  kind: AgentMemoryKind;
  content: string;
  score: number;
  importance: number;
  similarity?: number;
  sources?: { vec?: boolean; fts?: boolean };
  sourceSession?: string | null;
  sourceEntryIds?: number[] | null;
}

export interface RetrievalCandidate {
  row: AgentMemoryRow;
  similarity?: number;
  sources: { vec?: boolean; fts?: boolean };
}

export interface FuseOptions {
  topK: number;
  rrfK: number;
  weights: { similarity: number; recency: number; importance: number };
  now: number;
  halfLifeMs?: number;
  ftsBaseline?: number;
}

export interface MemoryRetrievalPort {
  fuse(
    fts: AgentMemoryRow[],
    vec: { row: AgentMemoryRow; similarity: number }[],
    opts: FuseOptions,
  ): MemoryRecallItem[];
}

export interface MemoryStatus {
  total: number;
  pendingEmbedding: number;
  hasPersona: boolean;
  reindexing?: boolean;
}

export interface MemoryPresenterDeps {
  repository: MemoryRepositoryPort;
  resolveAgentConfig: (agentId: string) => ArgosAgentConfig | null;
  isManagedAgent?: (agentId: string) => boolean;
  getEmbeddings: (providerId: string, modelId: string, texts: string[]) => Promise<number[][]>;
  generateText: (providerId: string, modelId: string, prompt: string) => Promise<string>;
  createVectorStore: (
    agentId: string,
    embedding: { providerId: string; modelId: string },
    dimensions: number,
  ) => Promise<IMemoryVectorStore>;
  resetVectorStore: (agentId: string) => Promise<void>;
  onMemoryChanged?: (agentId: string, reason: MemoryUpdateReason) => void;
}

export type MemoryUpdateReason = "extract" | "delete" | "clear" | "persona-evolve" | "persona-rollback" | "reindex";

export interface MemoryExtractionInput {
  agentId: string;
  spanText: string;
  model: { providerId: string; modelId: string };
  sourceSession?: string | null;
  sourceEntryIds?: number[] | null;
}

export type MemoryExtractionResult = { ok: true; createdIds: string[] } | { ok: false };

export interface MemoryReflectionResult {
  reflectionIds: string[];
  sourceMemoryIds: string[];
}

export interface MemoryPersonaDraftResult {
  draftId: string;
  needsReview: boolean;
  changeRatio: number;
}

export interface MemoryConflictPair {
  a: AgentMemoryRow;
  b: AgentMemoryRow;
}

export interface MemoryConflictResolution {
  keep: string[];
  supersede: string[];
}

export interface MemorySearchHit {
  id: string;
  kind: AgentMemoryKind;
  content: string;
  score: number;
  importance: number;
  similarity?: number;
  sources?: { vec?: boolean; fts?: boolean };
}

const SAFE_AGENT_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;
export function isSafeAgentId(agentId: unknown): agentId is string {
  return typeof agentId === "string" && SAFE_AGENT_ID_PATTERN.test(agentId);
}

export const DEFAULT_SIMILARITY_THRESHOLD = 0.2;
export const DEFAULT_RRF_K = 60;
export const MAX_TOP_K = 100;
export const MAX_RRF_K = 1000;

export const DEFAULT_RETRIEVAL: Required<Omit<ArgosAgentMemoryRetrieval, "weights">> & {
  weights: { similarity: number; recency: number; importance: number };
} = {
  topK: 6,
  rrfK: DEFAULT_RRF_K,
  similarityThreshold: DEFAULT_SIMILARITY_THRESHOLD,
  weights: { similarity: 0.6, recency: 0.25, importance: 0.15 },
};

export const DEFAULT_RECENCY_HALF_LIFE_MS = 14 * 24 * 60 * 60 * 1000;
export const FORGET_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000;
export const DEFAULT_CONFIDENCE = 0.7;
export const CONFIDENCE_INCREMENT = 0.1;
export const CONFIDENCE_BOOST = 0.5;
export const IMPORTANCE_FLOOR_COEF = 0.15;
export const FTS_SIMILARITY_BASELINE = 0.3;
