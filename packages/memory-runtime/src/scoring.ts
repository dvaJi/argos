import type { ArgosAgentMemoryRetrieval } from "@shared/types/agent-interface";
import {
  CONFIDENCE_BOOST,
  DEFAULT_CONFIDENCE,
  DEFAULT_RECENCY_HALF_LIFE_MS,
  DEFAULT_RETRIEVAL,
  DEFAULT_SIMILARITY_THRESHOLD,
  FTS_SIMILARITY_BASELINE,
  FORGET_HALF_LIFE_MS,
  IMPORTANCE_FLOOR_COEF,
  MAX_RRF_K,
  MAX_TOP_K,
  type AgentMemoryRow,
  type FuseOptions,
  type MemoryRecallItem,
} from "./types";

function resolvePositiveInt(value: number | undefined, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  const floored = Math.floor(value);
  if (floored < 1) {
    return fallback;
  }
  return Math.min(floored, max);
}

function resolveWeights(weights: ArgosAgentMemoryRetrieval["weights"]): {
  similarity: number;
  recency: number;
  importance: number;
} {
  if (
    !weights ||
    !Number.isFinite(weights.similarity) ||
    weights.similarity < 0 ||
    !Number.isFinite(weights.recency) ||
    weights.recency < 0 ||
    !Number.isFinite(weights.importance) ||
    weights.importance < 0
  ) {
    return DEFAULT_RETRIEVAL.weights;
  }

  return {
    similarity: weights.similarity,
    recency: weights.recency,
    importance: weights.importance,
  };
}

export function distanceToSimilarity(distance: number): number {
  const similarity = 1 - distance;
  if (!Number.isFinite(similarity)) {
    return 0;
  }
  return Math.min(1, Math.max(0, similarity));
}

export function recencyScore(
  createdAt: number,
  now: number,
  halfLifeMs: number = DEFAULT_RECENCY_HALF_LIFE_MS,
): number {
  const age = Math.max(0, now - createdAt);
  return Math.pow(0.5, age / halfLifeMs);
}

export function resolveRetrieval(config?: ArgosAgentMemoryRetrieval | null): {
  topK: number;
  rrfK: number;
  similarityThreshold: number;
  weights: { similarity: number; recency: number; importance: number };
} {
  const similarityThreshold =
    typeof config?.similarityThreshold === "number" &&
    Number.isFinite(config.similarityThreshold) &&
    config.similarityThreshold >= 0 &&
    config.similarityThreshold <= 1
      ? config.similarityThreshold
      : DEFAULT_SIMILARITY_THRESHOLD;

  return {
    topK: resolvePositiveInt(config?.topK, DEFAULT_RETRIEVAL.topK, MAX_TOP_K),
    rrfK: resolvePositiveInt(config?.rrfK, DEFAULT_RETRIEVAL.rrfK, MAX_RRF_K),
    similarityThreshold,
    weights: resolveWeights(config?.weights),
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

export function retrievalScore(
  row: Pick<AgentMemoryRow, "importance" | "created_at" | "confidence">,
  similarity: number,
  now: number,
  weights: { similarity: number; recency: number; importance: number },
  halfLifeMs?: number,
): number {
  const recency = recencyScore(row.created_at, now, halfLifeMs);
  const importance = clamp01(row.importance);
  const confidence = clamp01(row.confidence ?? DEFAULT_CONFIDENCE);
  const base = weights.similarity * similarity + weights.recency * recency + weights.importance * importance;
  const confidenceFactor = Math.max(0, 1 + CONFIDENCE_BOOST * (confidence - DEFAULT_CONFIDENCE));
  const floor = IMPORTANCE_FLOOR_COEF * importance;
  return Math.max(base * confidenceFactor, floor);
}

export function decayScore(
  row: Pick<AgentMemoryRow, "created_at" | "accessed_at">,
  now: number,
  halfLifeMs: number = FORGET_HALF_LIFE_MS,
): number {
  const anchor = row.accessed_at ?? row.created_at;
  return recencyScore(anchor, now, halfLifeMs);
}

export function parseSourceEntryIds(raw: string | null | undefined): number[] | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return null;
    }
    const ids = parsed.filter((id): id is number => Number.isInteger(id) && id >= 0);
    return ids.length ? ids : null;
  } catch {
    return null;
  }
}

function toRecallItem(
  row: AgentMemoryRow,
  score: number,
  sources: { vec?: boolean; fts?: boolean },
  similarity?: number,
): MemoryRecallItem {
  return {
    id: row.id,
    kind: row.kind,
    content: row.content,
    importance: row.importance,
    score,
    sources,
    similarity,
    sourceSession: row.source_session,
    sourceEntryIds: parseSourceEntryIds(row.source_entry_ids),
  };
}

export function fuse(
  fts: AgentMemoryRow[],
  vec: { row: AgentMemoryRow; similarity: number }[],
  opts: FuseOptions,
): MemoryRecallItem[] {
  const baseline = opts.ftsBaseline ?? FTS_SIMILARITY_BASELINE;
  const candidates = new Map<
    string,
    {
      row: AgentMemoryRow;
      rrf: number;
      similarity?: number;
      sources: { vec?: boolean; fts?: boolean };
    }
  >();

  const add = (row: AgentMemoryRow, rank: number, source: "fts" | "vec", similarity?: number) => {
    const contribution = 1 / (opts.rrfK + rank + 1);
    const existing = candidates.get(row.id);
    if (existing) {
      existing.rrf += contribution;
      existing.sources[source] = true;
      if (similarity !== undefined) {
        existing.similarity = similarity;
      }
      return;
    }

    const sources: { vec?: boolean; fts?: boolean } = {};
    sources[source] = true;
    candidates.set(row.id, { row, rrf: contribution, similarity, sources });
  };

  fts.forEach((row, index) => add(row, index, "fts"));
  vec.forEach(({ row, similarity }, index) => add(row, index, "vec", similarity));

  return Array.from(candidates.values())
    .map((candidate) => {
      const score = retrievalScore(
        candidate.row,
        candidate.similarity ?? baseline,
        opts.now,
        opts.weights,
        opts.halfLifeMs,
      );
      return {
        combined: score + candidate.rrf,
        score,
        item: toRecallItem(candidate.row, score, candidate.sources, candidate.similarity),
      };
    })
    .sort((a, b) => b.combined - a.combined || b.score - a.score)
    .slice(0, opts.topK)
    .map((entry) => entry.item);
}

export function normalizeForProvenance(content: string): string {
  return content.trim().toLowerCase().replace(/\s+/g, " ");
}

export function stableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

export function buildMemoryProvenanceKey(agentId: string, kind: string, content: string): string {
  return `${kind}:${stableHash(`${agentId}:${kind}:${normalizeForProvenance(content)}`)}`;
}
