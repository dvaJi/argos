import { randomUUID } from "crypto";
import logger from "@shared/logger";
import { nanoid } from "nanoid";
import {
  isSafeAgentId,
  type AgentMemoryRow,
  type MemoryCandidate,
  type MemoryPresenterDeps,
  type MemoryRecallItem,
  type MemoryStatus,
  type MemoryUpdateReason,
  type MemoryVectorRecord,
  type WriteMemoriesOptions,
  type IMemoryVectorStore,
  type NormalizedMemoryCandidate,
  type MemoryConflictPair,
  type MemoryWriteOutcome,
  type MemoryExtractionInput,
  type MemoryExtractionResult,
  type MemoryPersonaDraftResult,
  type MemoryReflectionResult,
} from "./types";
import { CATEGORY_IMPORTANCE_FLOOR, isAgentMemoryCategory, type AgentMemoryCategory } from "@shared/types/agent-memory";
import { ADD_DECISION, buildDecisionPrompt, parseDecision, type MemoryDecision } from "./decision";
import {
  appendMemorySection,
  appendMemorySectionWithManifest,
  buildMemorySection,
  estimateTokens,
  resolveInjectionTokenBudget,
  type MemoryInjectionPayload,
  type MemoryInjectionPort,
  type MemoryInjectionResult,
  type MemoryRuntimePort,
} from "./injectionPort";
import {
  buildExtractionPrompt,
  buildReflectionInsightsPrompt,
  buildReflectionPrompt,
  buildTriagePrompt,
  parseMemoryCandidates,
  parseReflectionInsights,
  parseTriageDecision,
  personaChangeRatio,
  sanitizeSelfModel,
  PERSONA_MAX_CHANGE_RATIO,
} from "./extraction";
import { buildMemoryProvenanceKey, distanceToSimilarity, fuse, resolveRetrieval } from "./scoring";

const REINDEX_BATCH_SIZE = 50;
const REINDEX_MAX_BATCHES = 200;
const MIN_MEMORIES_FOR_REFLECTION = 3;
const REFLECTION_IMPORTANCE_THRESHOLD = 5.0;
const REFLECTION_IMPORTANCE = 0.8;
const REFLECTION_MEMORY_LIMIT = 20;
const MIN_MEMORIES_FOR_PERSONA = 3;
const PERSONA_EVOLUTION_IMPORTANCE_THRESHOLD = 5.0;
const PERSONA_MEMORY_LIMIT = 20;
const DECISION_NEIGHBOR_TOP_S = 10;
const CONSOLIDATION_IDLE_MS = 5 * 60 * 1000;
const CONSOLIDATION_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const CONSOLIDATION_MAX_LLM_CALLS = 8;
const CONSOLIDATION_MAX_INPUT_TOKENS = 24000;
const MAINTENANCE_START_DELAY_MS = 60 * 1000;
const MAINTENANCE_INTERVAL_MS = 30 * 60 * 1000;

function embeddingFingerprint(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

function isUniqueConstraintError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  if (code === "SQLITE_CONSTRAINT_UNIQUE" || code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed/i.test(message);
}

function createdIdsFromOutcome(outcome: MemoryWriteOutcome): string[] {
  switch (outcome.action) {
    case "created":
      return [outcome.id];
    case "superseded":
      return outcome.created === false ? [] : [outcome.id];
    case "challenged":
      return [outcome.challengerId];
    default:
      return [];
  }
}

function outcomeTouched(outcome: MemoryWriteOutcome): boolean {
  return outcome.action !== "noop";
}

function clampImportance(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return 0.5;
  return Math.min(1, Math.max(0, num));
}

function normalizeMemoryCandidate(candidate: MemoryCandidate): NormalizedMemoryCandidate | null {
  const content = candidate.content.trim();
  if (!content) return null;
  const rawCategory = typeof candidate.category === "string" ? candidate.category.trim() : "";
  const category = isAgentMemoryCategory(rawCategory) ? rawCategory : null;
  const categoryWasProvided = rawCategory.length > 0;
  const kind =
    category !== null
      ? category === "task_outcome"
        ? "episodic"
        : "semantic"
      : categoryWasProvided
        ? "semantic"
        : candidate.kind === "episodic" || candidate.kind === "semantic"
          ? candidate.kind
          : "semantic";
  const importance = category
    ? Math.max(clampImportance(candidate.importance), CATEGORY_IMPORTANCE_FLOOR[category])
    : clampImportance(candidate.importance);
  return { kind, category, content, importance };
}

export class MemoryPresenter {
  private readonly vectorStores = new Map<string, Promise<IMemoryVectorStore>>();
  private readonly vectorStoreIdentities = new Map<string, string>();
  private readonly vectorStoreLocks = new Map<string, Promise<unknown>>();
  private readonly embeddingDrains = new Map<string, Promise<unknown>>();
  private readonly reindexing = new Map<string, Promise<void>>();
  private readonly backfilling = new Map<string, Promise<void>>();
  private readonly consolidationTimers = new Map<string, NodeJS.Timeout>();
  private readonly lastConsolidationAt = new Map<string, number>();
  private readonly consolidationRuns = new Set<Promise<unknown>>();
  private readonly maintenanceAgents = new Set<string>();
  private maintenanceStartTimer: NodeJS.Timeout | null = null;
  private maintenanceInterval: NodeJS.Timeout | null = null;
  private readonly reflectionAttemptWatermark = new Map<string, number>();
  private readonly personaAttemptWatermark = new Map<string, number>();
  private readonly personaLocks = new Map<string, Promise<unknown>>();
  private disposed = false;

  constructor(private readonly deps: MemoryPresenterDeps) {}

  isEnabled(agentId: string): boolean {
    return this.deps.resolveAgentConfig(agentId)?.memoryEnabled === true;
  }

  private assertSafeAgentId(agentId: string): void {
    if (!isSafeAgentId(agentId)) {
      throw new Error(`[Memory] invalid agentId: ${JSON.stringify(agentId)}`);
    }
  }

  private isManagedAgent(agentId: string): boolean {
    return this.deps.isManagedAgent ? this.deps.isManagedAgent(agentId) : true;
  }

  private emitChanged(agentId: string, reason: MemoryUpdateReason): void {
    this.deps.onMemoryChanged?.(agentId, reason);
  }

  writeMemoriesSync(candidates: MemoryCandidate[], options: WriteMemoriesOptions): string[] {
    if (!candidates.length) {
      return [];
    }

    const sourceSession = options.sourceSession ?? null;
    const sourceEntryIds = sourceSession ? (options.sourceEntryIds ?? null) : null;
    const created: string[] = [];

    for (const candidate of candidates) {
      const content = candidate.content.trim();
      if (!content) {
        continue;
      }

      const provenanceKey = buildMemoryProvenanceKey(options.agentId, candidate.kind, content);
      if (this.deps.repository.getByProvenanceKey(options.agentId, provenanceKey)) {
        continue;
      }

      const id = `mem-${randomUUID()}`;
      try {
        this.deps.repository.insert({
          id,
          agentId: options.agentId,
          kind: candidate.kind,
          content,
          importance: candidate.importance,
          confidence: candidate.confidence,
          status: "pending_embedding",
          category: candidate.category ?? null,
          sourceSession,
          userScope: options.userScope ?? null,
          provenanceKey,
          sourceEntryIds,
          isAnchor: candidate.isAnchor ?? false,
        });
        created.push(id);
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error;
        }
      }
    }

    return created;
  }

  processPendingEmbeddings(agentId: string, limit = 50): Promise<void> {
    const prev = this.embeddingDrains.get(agentId);
    const run = prev
      ? prev.then(
          () => this.drainPendingEmbeddings(agentId, limit),
          () => this.drainPendingEmbeddings(agentId, limit),
        )
      : this.drainPendingEmbeddings(agentId, limit);
    const tracked = run.then(
      () => undefined,
      () => undefined,
    );
    this.embeddingDrains.set(agentId, tracked);
    void tracked.finally(() => {
      if (this.embeddingDrains.get(agentId) === tracked) {
        this.embeddingDrains.delete(agentId);
      }
    });
    return run;
  }

  private async drainPendingEmbeddings(agentId: string, limit: number): Promise<void> {
    const config = this.deps.resolveAgentConfig(agentId);
    const pending = this.deps.repository.listPendingEmbedding(limit, agentId);
    if (!pending.length) {
      return;
    }

    const embedding = config?.memoryEmbedding;
    if (!embedding?.providerId || !embedding?.modelId) {
      for (const row of pending) {
        this.deps.repository.updateStatus(row.id, "fts_only");
      }
      return;
    }

    let vectors: number[][];
    try {
      vectors = await this.deps.getEmbeddings(
        embedding.providerId,
        embedding.modelId,
        pending.map((row) => row.content),
      );
    } catch {
      for (const row of pending) {
        this.deps.repository.updateStatus(row.id, "pending_embedding");
      }
      return;
    }

    try {
      const dim = vectors.find((vector) => vector?.length)?.length ?? 0;
      const records: MemoryVectorRecord[] = [];
      for (let i = 0; i < pending.length; i += 1) {
        const vector = vectors[i];
        if (dim > 0 && vector?.length === dim) {
          records.push({ memoryId: pending[i].id, embedding: vector });
        } else {
          this.deps.repository.updateStatus(pending[i].id, "error");
        }
      }

      if (!records.length) {
        return;
      }

      const outcome = await this.runExclusiveForAgent(agentId, async () => {
        const live = records.filter((record) => this.deps.repository.getById(record.memoryId));
        if (!live.length) {
          return { written: new Set<string>(), usable: true };
        }

        const store = await this.openVectorStoreLocked(
          agentId,
          { providerId: embedding.providerId, modelId: embedding.modelId },
          dim,
        );
        if (!store.isUsable()) {
          return { written: new Set<string>(), usable: false };
        }

        await store.upsert(live);
        return { written: new Set(live.map((record) => record.memoryId)), usable: true };
      });

      const fingerprint = embeddingFingerprint(embedding.providerId, embedding.modelId);
      for (const record of records) {
        if (outcome.written.has(record.memoryId)) {
          this.deps.repository.updateStatus(record.memoryId, "embedded", {
            embeddingId: record.memoryId,
            embeddingDim: dim,
            embeddingModel: fingerprint,
          });
        } else if (!outcome.usable) {
          this.deps.repository.updateStatus(record.memoryId, "error");
        }
      }
    } catch {
      for (const row of pending) {
        this.deps.repository.updateStatus(row.id, "error");
      }
    }
  }

  reindexEmbeddings(agentId: string, force = false): Promise<void> {
    const inflight = this.reindexing.get(agentId);
    if (inflight) {
      return inflight;
    }

    const tracked = this.runReindex(agentId, force).finally(() => {
      if (this.reindexing.get(agentId) === tracked) {
        this.reindexing.delete(agentId);
      }
    });
    this.reindexing.set(agentId, tracked);
    return tracked;
  }

  private async runReindex(agentId: string, force: boolean): Promise<void> {
    const requeued = this.deps.repository.requeueForEmbedding(agentId, ["embedded", "error", "fts_only"]);
    if (!requeued && !force) {
      return;
    }

    await this.runExclusiveForAgent(agentId, async () => {
      await this.closeVectorStore(agentId);
      await this.deps.resetVectorStore(agentId);
    });

    this.emitChanged(agentId, "reindex");
    await this.drainUntilExhausted(agentId);
  }

  backfillEmbeddings(agentId: string): Promise<void> {
    const inflight = this.backfilling.get(agentId);
    if (inflight) {
      return inflight;
    }

    const tracked = this.runBackfill(agentId).finally(() => {
      if (this.backfilling.get(agentId) === tracked) {
        this.backfilling.delete(agentId);
      }
    });
    this.backfilling.set(agentId, tracked);
    return tracked;
  }

  private async runBackfill(agentId: string): Promise<void> {
    await Promise.resolve();
    this.deps.repository.requeueForEmbedding(agentId, ["fts_only"]);
    await this.drainUntilExhausted(agentId);
  }

  private async drainUntilExhausted(agentId: string): Promise<void> {
    for (let i = 0; i < REINDEX_MAX_BATCHES; i += 1) {
      const head = this.deps.repository.listPendingEmbedding(1, agentId);
      if (!head.length) {
        break;
      }
      await this.processPendingEmbeddings(agentId, REINDEX_BATCH_SIZE);
      const next = this.deps.repository.listPendingEmbedding(1, agentId);
      if (next.length && next[0].id === head[0].id) {
        break;
      }
    }
  }

  async recall(agentId: string, query: string, now = Date.now()): Promise<MemoryRecallItem[]> {
    const config = this.deps.resolveAgentConfig(agentId);
    const { topK, rrfK, similarityThreshold, weights } = resolveRetrieval(config?.memoryRetrieval);
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return [];
    }

    const candidateLimit = topK * 2;
    const ftsRows = this.deps.repository
      .search(agentId, normalizedQuery, candidateLimit)
      .filter((row) => row.kind !== "persona");

    const vecMatches: { row: AgentMemoryRow; similarity: number }[] = [];
    const embedding = config?.memoryEmbedding;
    if (embedding?.providerId && embedding?.modelId) {
      try {
        const vectors = await this.deps.getEmbeddings(embedding.providerId, embedding.modelId, [normalizedQuery]);
        const vector = vectors[0];
        if (vector?.length) {
          const fingerprint = embeddingFingerprint(embedding.providerId, embedding.modelId);
          if (this.hasStaleEmbeddings(agentId, vector.length, fingerprint)) {
            void this.reindexEmbeddings(agentId).catch(() => undefined);
          } else {
            const store = await this.getVectorStore(
              agentId,
              { providerId: embedding.providerId, modelId: embedding.modelId },
              vector.length,
            );
            if (store.isUsable()) {
              const matches = await store.query(vector, { topK: candidateLimit });
              for (const match of matches) {
                const similarity = distanceToSimilarity(match.distance);
                if (similarity < similarityThreshold) {
                  continue;
                }
                const row = this.deps.repository.getById(match.memoryId);
                if (!row || row.superseded_by || row.kind === "persona") {
                  continue;
                }
                vecMatches.push({ row, similarity });
              }
              if (!this.reindexing.has(agentId)) {
                void this.backfillEmbeddings(agentId).catch(() => undefined);
              }
            } else if (!this.reindexing.has(agentId)) {
              void this.reindexEmbeddings(agentId, true).catch(() => undefined);
            }
          }
        }
      } catch {
        // fall back to FTS only
      }
    }

    const results = fuse(ftsRows, vecMatches, { topK, rrfK, weights, now });
    for (const item of results) {
      this.deps.repository.recordAccess(item.id, now);
    }
    return results;
  }

  async retrieve(agentId: string, query: string, now = Date.now()): Promise<MemoryRecallItem[]> {
    return this.recall(agentId, query, now);
  }

  async deleteMemory(agentId: string, memoryId: string): Promise<boolean> {
    this.assertSafeAgentId(agentId);
    if (!this.isManagedAgent(agentId)) {
      return false;
    }

    const row = this.deps.repository.getById(memoryId);
    if (!row || row.agent_id !== agentId) {
      return false;
    }

    this.deps.repository.delete(memoryId);
    const store = await this.vectorStoreForAgent(agentId);
    if (store) {
      await store.deleteByMemoryIds([memoryId]).catch(() => undefined);
    }
    this.emitChanged(agentId, "delete");
    return true;
  }

  async clearMemories(agentId: string): Promise<number> {
    this.assertSafeAgentId(agentId);
    if (!this.isManagedAgent(agentId)) {
      return 0;
    }

    const removed = this.deps.repository.clearByAgent(agentId);
    await this.runExclusiveForAgent(agentId, async () => {
      await this.closeVectorStore(agentId);
      await this.deps.resetVectorStore(agentId);
    }).catch(() => undefined);
    if (removed > 0) {
      this.emitChanged(agentId, "clear");
    }
    return removed;
  }

  getStatus(agentId: string): MemoryStatus {
    this.assertSafeAgentId(agentId);
    if (!this.isManagedAgent(agentId)) {
      return { total: 0, pendingEmbedding: 0, hasPersona: false };
    }

    const all = this.deps.repository.listByAgent(agentId, { includeSuperseded: true });
    return {
      total: all.length,
      pendingEmbedding: all.filter((row) => row.status === "pending_embedding").length,
      hasPersona: all.some((row) => row.kind === "persona" && !row.superseded_by),
      reindexing: this.reindexing.has(agentId),
    };
  }

  async extractAndStore(input: MemoryExtractionInput): Promise<MemoryExtractionResult> {
    const { agentId, spanText, model, sourceSession, sourceEntryIds } = input;
    if (this.disposed || !this.canWriteAgentMemory(agentId)) {
      return { ok: false };
    }

    const trimmed = spanText.trim();
    if (!trimmed) {
      return { ok: true, createdIds: [] };
    }

    const fallbackModel = model ?? this.resolveExtractionModel(agentId, null);
    if (!fallbackModel) {
      return { ok: false };
    }

    try {
      const triagePrompt = buildTriagePrompt(trimmed);
      const triageRaw = await this.deps.generateText(fallbackModel.providerId, fallbackModel.modelId, triagePrompt);
      const shouldKeep = parseTriageDecision(triageRaw);
      if (!shouldKeep) {
        return { ok: true, createdIds: [] };
      }
    } catch {
      return { ok: false };
    }

    let candidates: MemoryCandidate[];
    try {
      const extractionPrompt = buildExtractionPrompt(trimmed);
      const extractionRaw = await this.deps.generateText(
        fallbackModel.providerId,
        fallbackModel.modelId,
        extractionPrompt,
      );
      const result = parseMemoryCandidates(extractionRaw);
      if (!result.ok || !result.candidates.length) {
        return { ok: true, createdIds: [] };
      }
      candidates = result.candidates;
    } catch {
      return { ok: false };
    }

    const createdIds: string[] = [];
    const now = Date.now();
    for (const candidate of candidates) {
      if (!this.canContinueAgentMemoryTask(agentId)) {
        break;
      }
      try {
        const outcome = await this.coordinateWrite(
          agentId,
          candidate,
          fallbackModel,
          {
            sourceSession,
            sourceEntryIds,
          },
          now,
        );
        if (outcomeTouched(outcome)) {
          const ids = createdIdsFromOutcome(outcome);
          createdIds.push(...ids);
          this.registerMaintenanceAgent(agentId);
          this.emitChanged(agentId, "extract");
          void this.processPendingEmbeddings(agentId).catch(() => undefined);
          this.scheduleConsolidation(agentId);
        }
      } catch (error) {
        logger.warn("[Memory] coordinateWrite failed", { agentId, error });
      }
    }

    if (createdIds.length > 0) {
      this.syncWorkingMemoryAfterMutation(agentId);
    }

    return createdIds.length > 0 ? { ok: true, createdIds } : { ok: true, createdIds: [] };
  }

  private async coordinateWrite(
    agentId: string,
    candidate: MemoryCandidate,
    model: { providerId: string; modelId: string },
    options: { sourceSession?: string | null; sourceEntryIds?: number[] | null },
    now: number,
  ): Promise<MemoryWriteOutcome> {
    const normalized = normalizeMemoryCandidate(candidate);
    if (!normalized) {
      return { action: "noop", reason: "empty-candidate" };
    }

    const provenanceKey = buildMemoryProvenanceKey(agentId, normalized.kind, normalized.content);
    const existingByProvenance = this.deps.repository.getByProvenanceKey(agentId, provenanceKey);
    if (existingByProvenance) {
      this.absorbProvenanceHit(agentId, existingByProvenance);
      return { action: "noop", reason: "duplicate-provenance", id: existingByProvenance.id };
    }

    const recallResults = await this.recall(agentId, normalized.content, now);
    const neighbors = recallResults.slice(0, DECISION_NEIGHBOR_TOP_S);

    if (neighbors.length === 0) {
      const id = this.insertMemory(agentId, candidate, normalized.content, provenanceKey, options);
      if (id) {
        return { action: "created", id };
      }
      return { action: "noop", reason: "insert-failed" };
    }

    let decision: MemoryDecision;
    try {
      const prompt = buildDecisionPrompt(
        normalized,
        neighbors.map((n) => ({ content: n.content })),
      );
      const raw = await this.deps.generateText(model.providerId, model.modelId, prompt);
      decision = parseDecision(raw, neighbors.length);
    } catch {
      decision = ADD_DECISION;
    }

    switch (decision.decision) {
      case "ADD": {
        const id = this.insertMemory(agentId, candidate, normalized.content, provenanceKey, options);
        if (id) {
          return { action: "created", id };
        }
        return { action: "noop", reason: "insert-failed" };
      }
      case "UPDATE": {
        if (decision.targetIndex === null || decision.targetIndex >= neighbors.length) {
          const id = this.insertMemory(agentId, candidate, normalized.content, provenanceKey, options);
          return id ? { action: "created", id } : { action: "noop", reason: "insert-failed" };
        }
        const targetRow = this.deps.repository.getById(neighbors[decision.targetIndex].id);
        if (!targetRow) {
          const id = this.insertMemory(agentId, candidate, normalized.content, provenanceKey, options);
          return id ? { action: "created", id } : { action: "noop", reason: "target-gone" };
        }
        const merged = decision.mergedContent ?? normalized.content;
        const updatedId = this.applyContentUpdate(agentId, targetRow, merged, now, normalized.category);
        this.bumpConfidence(updatedId);
        return { action: "updated", id: updatedId };
      }
      case "SUPERSEDE": {
        if (decision.targetIndex === null || decision.targetIndex >= neighbors.length) {
          const id = this.insertMemory(agentId, candidate, normalized.content, provenanceKey, options);
          return id ? { action: "created", id } : { action: "noop", reason: "insert-failed" };
        }
        const oldRow = this.deps.repository.getById(neighbors[decision.targetIndex].id);
        if (!oldRow) {
          const id = this.insertMemory(agentId, candidate, normalized.content, provenanceKey, options);
          return id ? { action: "created", id } : { action: "noop", reason: "target-gone" };
        }
        const merged = decision.mergedContent ?? normalized.content;
        const newId = this.insertMemory(agentId, candidate, merged, provenanceKey, options);
        if (newId) {
          this.deps.repository.markSuperseded(oldRow.id, newId);
          return { action: "superseded", id: newId, supersededId: oldRow.id, created: true };
        }
        return { action: "noop", reason: "supersede-insert-failed" };
      }
      case "NOOP": {
        return {
          action: "noop",
          reason: "llm-noop",
          id: decision.targetIndex !== null ? neighbors[decision.targetIndex]?.id : undefined,
        };
      }
      case "CHALLENGE": {
        if (decision.targetIndex === null || decision.targetIndex >= neighbors.length) {
          const id = this.insertMemory(agentId, candidate, normalized.content, provenanceKey, options);
          return id ? { action: "created", id } : { action: "noop", reason: "insert-failed" };
        }
        const challengerId = this.insertMemory(agentId, candidate, normalized.content, provenanceKey, options);
        if (challengerId) {
          return { action: "challenged", targetId: neighbors[decision.targetIndex].id, challengerId };
        }
        return { action: "noop", reason: "challenge-insert-failed" };
      }
      default:
        return { action: "noop", reason: "unknown-decision" };
    }
  }

  async buildInjection(agentId: string, query: string): Promise<MemoryInjectionResult | MemoryInjectionPayload | null> {
    if (!this.isEnabled(agentId)) {
      return null;
    }

    const persona = this.deps.repository.getActivePersona(agentId);
    const selfModel = persona?.content ?? null;

    const memories = await this.recall(agentId, query);

    const tokenBudget = resolveInjectionTokenBudget(null);

    return {
      selfModel,
      memories: memories.map((m) => ({
        id: m.id,
        kind: m.kind,
        content: m.content,
        score: m.score,
        sources: m.sources,
        similarity: m.similarity,
      })),
      tokenBudget,
    };
  }

  private insertMemory(
    agentId: string,
    candidate: MemoryCandidate,
    content: string,
    provenanceKey: string,
    options: { sourceSession?: string | null; sourceEntryIds?: number[] | null },
  ): string | null {
    const id = `mem-${nanoid()}`;
    try {
      this.deps.repository.insert({
        id,
        agentId,
        kind: candidate.kind,
        content,
        importance: candidate.importance,
        confidence: candidate.confidence,
        status: "pending_embedding",
        category: candidate.category ?? null,
        sourceSession: options.sourceSession ?? null,
        userScope: null,
        provenanceKey,
        sourceEntryIds: options.sourceEntryIds ?? null,
        isAnchor: candidate.isAnchor ?? false,
      });
      return id;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return null;
      }
      throw error;
    }
  }

  private absorbProvenanceHit(_agentId: string, duplicate: AgentMemoryRow): boolean {
    this.deps.repository.recordAccess(duplicate.id);
    return true;
  }

  private applyContentUpdate(
    _agentId: string,
    targetRow: AgentMemoryRow,
    merged: string,
    _now: number,
    category: AgentMemoryCategory | null,
  ): string {
    const provenanceKey = buildMemoryProvenanceKey(targetRow.agent_id, targetRow.kind, merged);
    const existing = this.deps.repository.getByProvenanceKey(targetRow.agent_id, provenanceKey);
    if (existing && existing.id !== targetRow.id) {
      this.deps.repository.markSuperseded(targetRow.id, existing.id);
      return existing.id;
    }

    this.deps.repository.insert({
      id: targetRow.id,
      agentId: targetRow.agent_id,
      kind: targetRow.kind,
      content: merged,
      importance: targetRow.importance,
      confidence: targetRow.confidence,
      status: "pending_embedding",
      category: category ?? targetRow.category,
      sourceSession: targetRow.source_session,
      userScope: targetRow.user_scope,
      provenanceKey,
      sourceEntryIds: null,
      isAnchor: targetRow.is_anchor === 1,
    });
    return targetRow.id;
  }

  private bumpConfidence(id: string): void {
    const row = this.deps.repository.getById(id);
    if (!row) return;
    const newConfidence = Math.min(1, (row.confidence ?? 0.7) + 0.1);
    this.deps.repository.insert({
      id: row.id,
      agentId: row.agent_id,
      kind: row.kind,
      content: row.content,
      importance: row.importance,
      confidence: newConfidence,
      status: row.status,
      category: row.category,
      sourceSession: row.source_session,
      userScope: row.user_scope,
      provenanceKey: row.provenance_key,
      sourceEntryIds: null,
      isAnchor: row.is_anchor === 1,
    });
  }

  private resolveExtractionModel(
    agentId: string,
    fallback: { providerId: string; modelId: string } | null,
  ): { providerId: string; modelId: string } | null {
    const config = this.deps.resolveAgentConfig(agentId);
    const model = config?.memoryExtractionModel;
    if (model?.providerId && model?.modelId) {
      return {
        providerId: model.providerId,
        modelId: model.modelId,
      };
    }
    return fallback;
  }

  private scheduleConsolidation(agentId: string): void {
    if (this.consolidationTimers.has(agentId)) {
      return;
    }
    const timer = setTimeout(() => {
      this.consolidationTimers.delete(agentId);
      void this.runConsolidationPass(agentId).catch(() => undefined);
    }, CONSOLIDATION_IDLE_MS);
    this.consolidationTimers.set(agentId, timer);
  }

  private async runConsolidationPass(agentId: string): Promise<void> {
    const lastRun = this.lastConsolidationAt.get(agentId) ?? 0;
    const now = Date.now();
    if (now - lastRun < CONSOLIDATION_COOLDOWN_MS) {
      return;
    }
    this.lastConsolidationAt.set(agentId, now);

    const memories = this.deps.repository.listByAgent(agentId, {
      statuses: ["embedded", "fts_only"],
      includeSuperseded: false,
    });

    if (memories.length < MIN_MEMORIES_FOR_REFLECTION) {
      return;
    }

    const extractionModel = this.resolveExtractionModel(agentId, null);
    if (!extractionModel) {
      return;
    }

    const model = extractionModel;
    let llmCalls = 0;
    let inputTokens = 0;

    const pairs: MemoryConflictPair[] = [];
    for (let i = 0; i < memories.length && pairs.length < CONSOLIDATION_MAX_LLM_CALLS; i++) {
      for (let j = i + 1; j < memories.length && pairs.length < CONSOLIDATION_MAX_LLM_CALLS; j++) {
        const a = memories[i];
        const b = memories[j];
        if (a.kind === "persona" || b.kind === "persona") continue;
        if (a.superseded_by || b.superseded_by) continue;
        pairs.push({ a, b });
      }
    }

    for (const pair of pairs) {
      if (llmCalls >= CONSOLIDATION_MAX_LLM_CALLS) break;
      if (inputTokens >= CONSOLIDATION_MAX_INPUT_TOKENS) break;

      const prompt = buildDecisionPrompt(
        {
          kind: pair.a.kind,
          category: pair.a.category,
          content: pair.a.content,
          importance: pair.a.importance,
        },
        [{ content: pair.b.content }],
      );
      inputTokens += estimateTokens(prompt);

      try {
        llmCalls++;
        const raw = await this.deps.generateText(model.providerId, model.modelId, prompt);
        const decision = parseDecision(raw, 1);

        if (decision.decision === "SUPERSEDE" && decision.mergedContent) {
          this.deps.repository.markSuperseded(pair.b.id, pair.a.id);
          this.applyContentUpdate(agentId, pair.a, decision.mergedContent, now, pair.a.category);
        }
      } catch {
        // continue to next pair
      }
    }
  }

  async maybeReflect(
    agentId: string,
    model: { providerId: string; modelId: string },
    sourceSession?: string | null,
  ): Promise<MemoryReflectionResult | null> {
    if (this.disposed || !this.canWriteAgentMemory(agentId)) {
      return null;
    }

    const memories = this.deps.repository.listByAgent(agentId, {
      statuses: ["embedded", "fts_only"],
      includeSuperseded: false,
    });

    const highImportance = memories.filter(
      (m) => m.kind !== "persona" && m.importance >= REFLECTION_IMPORTANCE_THRESHOLD,
    );

    if (highImportance.length < MIN_MEMORIES_FOR_REFLECTION) {
      return null;
    }

    const watermark = this.reflectionAttemptWatermark.get(agentId) ?? 0;
    if (highImportance.length <= watermark) {
      return null;
    }

    const selected = highImportance.slice(0, REFLECTION_MEMORY_LIMIT);
    this.reflectionAttemptWatermark.set(agentId, highImportance.length);

    const memoriesText = selected.map((m) => m.content);

    let insights: string[];
    try {
      const prompt = buildReflectionInsightsPrompt(memoriesText);
      const raw = await this.deps.generateText(model.providerId, model.modelId, prompt);
      insights = parseReflectionInsights(raw);
    } catch {
      return null;
    }

    if (insights.length === 0) {
      return null;
    }

    const reflectionIds: string[] = [];
    for (const insight of insights) {
      const id = `mem-${nanoid()}`;
      const provenanceKey = buildMemoryProvenanceKey(agentId, "semantic", insight);
      try {
        this.deps.repository.insert({
          id,
          agentId,
          kind: "semantic",
          content: insight,
          importance: REFLECTION_IMPORTANCE,
          confidence: 0.8,
          status: "pending_embedding",
          category: "heuristic",
          sourceSession: sourceSession ?? null,
          userScope: null,
          provenanceKey,
          sourceEntryIds: null,
          isAnchor: false,
        });
        reflectionIds.push(id);
        this.registerMaintenanceAgent(agentId);
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          continue;
        }
        throw error;
      }
    }

    if (reflectionIds.length > 0) {
      this.emitChanged(agentId, "extract");
      void this.processPendingEmbeddings(agentId).catch(() => undefined);
    }

    return {
      reflectionIds,
      sourceMemoryIds: selected.map((m) => m.id),
    };
  }

  async maybeEvolvePersona(
    agentId: string,
    model: { providerId: string; modelId: string },
    sourceSession?: string | null,
  ): Promise<MemoryPersonaDraftResult | null> {
    if (this.disposed || !this.canWriteAgentMemory(agentId) || !this.isPersonaEvolutionEnabled(agentId)) {
      return null;
    }

    return this.withPersonaLock(agentId, async () => {
      const memories = this.deps.repository.listByAgent(agentId, {
        statuses: ["embedded", "fts_only"],
        includeSuperseded: false,
      });

      const highImportance = memories.filter(
        (m) => m.kind !== "persona" && m.importance >= PERSONA_EVOLUTION_IMPORTANCE_THRESHOLD,
      );

      if (highImportance.length < MIN_MEMORIES_FOR_PERSONA) {
        return null;
      }

      const watermark = this.personaAttemptWatermark.get(agentId) ?? 0;
      if (highImportance.length <= watermark) {
        return null;
      }

      const selected = highImportance.slice(0, PERSONA_MEMORY_LIMIT);
      this.personaAttemptWatermark.set(agentId, highImportance.length);

      const previousPersona = this.deps.repository.getActivePersona(agentId);
      const memoriesText = selected.map((m) => m.content);

      let newSelfModel: string;
      try {
        const prompt = buildReflectionPrompt(previousPersona?.content ?? null, memoriesText);
        const raw = await this.deps.generateText(model.providerId, model.modelId, prompt);
        newSelfModel = sanitizeSelfModel(raw);
      } catch {
        return null;
      }

      if (!newSelfModel) {
        return null;
      }

      const changeRatio = personaChangeRatio(previousPersona?.content, newSelfModel);
      if (changeRatio > PERSONA_MAX_CHANGE_RATIO) {
        return null;
      }

      const draftId = `persona-${nanoid()}`;
      const provenanceKey = buildMemoryProvenanceKey(agentId, "persona", newSelfModel);

      try {
        this.deps.repository.insert({
          id: draftId,
          agentId,
          kind: "persona",
          content: newSelfModel,
          importance: 1.0,
          confidence: 1.0,
          status: "pending_embedding",
          category: null,
          sourceSession: sourceSession ?? null,
          userScope: null,
          provenanceKey,
          sourceEntryIds: null,
          isAnchor: false,
        });

        if (previousPersona) {
          this.deps.repository.markSuperseded(previousPersona.id, draftId);
        }

        this.emitChanged(agentId, "persona-evolve");
        void this.processPendingEmbeddings(agentId).catch(() => undefined);

        return {
          draftId,
          needsReview: changeRatio > 0.1,
          changeRatio,
        };
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          return null;
        }
        throw error;
      }
    });
  }

  async approvePersonaDraft(agentId: string, draftId: string): Promise<boolean> {
    return this.withPersonaLock(agentId, async () => {
      const row = this.deps.repository.getById(draftId);
      if (!row || row.agent_id !== agentId || row.kind !== "persona") {
        return false;
      }
      this.emitChanged(agentId, "persona-evolve");
      return true;
    });
  }

  async rejectPersonaDraft(agentId: string, draftId: string): Promise<boolean> {
    return this.withPersonaLock(agentId, async () => {
      const row = this.deps.repository.getById(draftId);
      if (!row || row.agent_id !== agentId || row.kind !== "persona") {
        return false;
      }
      this.deps.repository.markSuperseded(draftId, null);
      this.deps.repository.delete(draftId);
      this.emitChanged(agentId, "persona-rollback");
      return true;
    });
  }

  async setPersonaAnchor(agentId: string, versionId: string, anchored: boolean): Promise<boolean> {
    return this.withPersonaLock(agentId, async () => {
      const row = this.deps.repository.getById(versionId);
      if (!row || row.agent_id !== agentId || row.kind !== "persona") {
        return false;
      }
      this.deps.repository.insert({
        id: row.id,
        agentId: row.agent_id,
        kind: row.kind,
        content: row.content,
        importance: row.importance,
        confidence: row.confidence,
        status: row.status,
        category: row.category,
        sourceSession: row.source_session,
        userScope: row.user_scope,
        provenanceKey: row.provenance_key,
        sourceEntryIds: null,
        isAnchor: anchored,
      });
      return true;
    });
  }

  listPersonaVersions(agentId: string): AgentMemoryRow[] {
    return this.deps.repository.listPersonaVersions(agentId);
  }

  listPersonaDrafts(agentId: string): { row: AgentMemoryRow; needsReview: boolean }[] {
    const versions = this.deps.repository.listPersonaVersions(agentId);
    return versions
      .filter((v) => v.superseded_by === null)
      .map((row) => ({
        row,
        needsReview: false,
      }));
  }

  async rollbackPersona(agentId: string, versionId: string): Promise<boolean> {
    return this.withPersonaLock(agentId, async () => {
      const row = this.deps.repository.getById(versionId);
      if (!row || row.agent_id !== agentId || row.kind !== "persona") {
        return false;
      }

      const active = this.deps.repository.getActivePersona(agentId);
      if (active) {
        this.deps.repository.markSuperseded(active.id, versionId);
      }

      this.deps.repository.markSuperseded(versionId, null);
      this.emitChanged(agentId, "persona-rollback");
      return true;
    });
  }

  listMemories(agentId: string): AgentMemoryRow[] {
    return this.deps.repository.listByAgent(agentId, { includeSuperseded: true });
  }

  startBackgroundMaintenance(): void {
    if (this.maintenanceInterval) {
      return;
    }

    this.maintenanceStartTimer = setTimeout(() => {
      this.maintenanceStartTimer = null;
      this.runBackgroundMaintenanceSweep();
      this.maintenanceInterval = setInterval(() => {
        this.runBackgroundMaintenanceSweep();
      }, MAINTENANCE_INTERVAL_MS);
    }, MAINTENANCE_START_DELAY_MS);
  }

  stopBackgroundMaintenance(): void {
    if (this.maintenanceStartTimer) {
      clearTimeout(this.maintenanceStartTimer);
      this.maintenanceStartTimer = null;
    }
    if (this.maintenanceInterval) {
      clearInterval(this.maintenanceInterval);
      this.maintenanceInterval = null;
    }
  }

  private runBackgroundMaintenanceSweep(): void {
    for (const agentId of this.maintenanceAgents) {
      if (!this.canContinueAgentMemoryTask(agentId)) {
        continue;
      }
      void this.runConsolidationPass(agentId).catch(() => undefined);
    }
  }

  private registerMaintenanceAgent(agentId: string): void {
    this.maintenanceAgents.add(agentId);
  }

  private async withPersonaLock<T>(agentId: string, task: () => Promise<T>): Promise<T> {
    const prev = this.personaLocks.get(agentId) ?? Promise.resolve();
    let resolve!: (value: unknown) => void;
    const current = new Promise((r) => {
      resolve = r;
    });
    this.personaLocks.set(
      agentId,
      current.then(
        () => undefined,
        () => undefined,
      ),
    );

    await prev;
    try {
      const result = await task();
      resolve(undefined);
      return result;
    } catch (error) {
      resolve(undefined);
      throw error;
    }
  }

  private canWriteAgentMemory(agentId: string): boolean {
    if (!this.isEnabled(agentId)) {
      return false;
    }
    if (!this.isManagedAgent(agentId)) {
      return false;
    }
    return true;
  }

  private canContinueAgentMemoryTask(agentId: string): boolean {
    if (this.disposed) {
      return false;
    }
    return this.canWriteAgentMemory(agentId);
  }

  private isPersonaEvolutionEnabled(agentId: string): boolean {
    const config = this.deps.resolveAgentConfig(agentId);
    return config?.memoryEnabled === true && config?.personaEvolutionEnabled === true;
  }

  private syncWorkingMemoryAfterMutation(_agentId: string): void {
    // Placeholder for working memory refresh
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.stopBackgroundMaintenance();

    for (const timer of this.consolidationTimers.values()) {
      clearTimeout(timer);
    }
    this.consolidationTimers.clear();
    this.lastConsolidationAt.clear();

    await Promise.allSettled(this.consolidationRuns);

    for (const pending of this.vectorStores.values()) {
      const store = await pending.catch(() => null);
      if (store) {
        await store.close().catch(() => undefined);
      }
    }
    this.vectorStores.clear();
    this.vectorStoreIdentities.clear();
    this.vectorStoreLocks.clear();
  }

  private async vectorStoreForAgent(agentId: string): Promise<IMemoryVectorStore | null> {
    const pending = this.vectorStores.get(agentId);
    return pending ? pending.catch(() => null) : null;
  }

  private async closeVectorStore(agentId: string): Promise<void> {
    const pending = this.vectorStores.get(agentId);
    if (!pending) {
      return;
    }
    this.vectorStores.delete(agentId);
    this.vectorStoreIdentities.delete(agentId);
    const store = await pending.catch(() => null);
    if (store) {
      await store.close().catch(() => undefined);
    }
  }

  private vectorStoreCacheKey(
    agentId: string,
    embedding: { providerId: string; modelId: string },
    dimensions: number,
  ): string {
    return `${agentId}::${embedding.providerId}::${embedding.modelId}::${dimensions}`;
  }

  private runExclusiveForAgent<T>(agentId: string, task: () => Promise<T>): Promise<T> {
    const prev = this.vectorStoreLocks.get(agentId) ?? Promise.resolve();
    const run = prev.then(() => task());
    this.vectorStoreLocks.set(
      agentId,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  }

  private async getVectorStore(
    agentId: string,
    embedding: { providerId: string; modelId: string },
    dimensions: number,
  ): Promise<IMemoryVectorStore> {
    return this.runExclusiveForAgent(agentId, () => this.openVectorStoreLocked(agentId, embedding, dimensions));
  }

  private async openVectorStoreLocked(
    agentId: string,
    embedding: { providerId: string; modelId: string },
    dimensions: number,
  ): Promise<IMemoryVectorStore> {
    const identity = this.vectorStoreCacheKey(agentId, embedding, dimensions);
    const cached = this.vectorStores.get(agentId);
    if (cached && this.vectorStoreIdentities.get(agentId) === identity) {
      return cached;
    }

    await this.closeVectorStore(agentId);
    const pending = this.deps.createVectorStore(agentId, embedding, dimensions).catch((error) => {
      this.vectorStores.delete(agentId);
      this.vectorStoreIdentities.delete(agentId);
      throw error;
    });
    this.vectorStores.set(agentId, pending);
    this.vectorStoreIdentities.set(agentId, identity);
    return pending;
  }

  private hasStaleEmbeddings(agentId: string, currentDim: number, fingerprint: string): boolean {
    return this.deps.repository
      .listByAgent(agentId, { statuses: ["embedded"] })
      .some(
        (row) => row.kind !== "persona" && (row.embedding_dim !== currentDim || row.embedding_model !== fingerprint),
      );
  }
}

export { appendMemorySection, appendMemorySectionWithManifest, buildMemorySection, isSafeAgentId };
export type { MemoryInjectionPayload, MemoryInjectionPort, MemoryInjectionResult, MemoryRuntimePort };
