import { describe, expect, it, vi } from "vitest";

import { MemoryPresenter } from "@argos/memory-runtime";
import type {
  MemoryDecisionsAnswerMap,
  MemoryDecisionsRequest,
  MemoryDecisionsResult,
  MemoryPresenterDeps,
  MemoryVectorRecord,
} from "@argos/memory-runtime";
import {
  DECISIONS_ACTION_MIN_PROBABILITY,
  DECISIONS_CONFLICT_SUPERSEDE_THRESHOLD,
  DECISIONS_TARGET_MIN_PROBABILITY,
  DECISIONS_TRIAGE_KEEP_THRESHOLD,
  buildConflictDecisionsRequest,
  buildTriageDecisionsRequest,
  buildWriteDecisionRequest,
  resolveConflictFromDecisions,
  resolveTriageFromDecisions,
  resolveWriteDecisionFromDecisions,
} from "@argos/memory-runtime";

// ---- decisionsQuestions mappers ----

describe("decisionsQuestions", () => {
  describe("buildTriageDecisionsRequest", () => {
    it("builds a noul keep_memory question over the conversation span", () => {
      const request = buildTriageDecisionsRequest("User prefers Bun over npm.");
      expect(request.state).toEqual({ conversation_span: "User prefers Bun over npm." });
      expect(request.questions.keep_memory.type).toBe("noul");
    });

    it("truncates long spans from the end", () => {
      const long = "x".repeat(5000);
      const request = buildTriageDecisionsRequest(long);
      const state = request.state as { conversation_span: string };
      expect(state.conversation_span.length).toBeLessThan(5000);
      expect(long.endsWith(state.conversation_span)).toBe(true);
    });
  });

  describe("resolveTriageFromDecisions", () => {
    it("keeps at or above the threshold", () => {
      expect(
        resolveTriageFromDecisions({ keep_memory: { type: "noul", noul: DECISIONS_TRIAGE_KEEP_THRESHOLD } }),
      ).toEqual({
        kept: true,
      });
    });

    it("skips below the threshold", () => {
      expect(
        resolveTriageFromDecisions({ keep_memory: { type: "noul", noul: DECISIONS_TRIAGE_KEEP_THRESHOLD - 0.01 } }),
      ).toEqual({ kept: false });
    });

    it("escalates on missing, invalid, or refused answers", () => {
      expect(resolveTriageFromDecisions({})).toBeNull();
      expect(resolveTriageFromDecisions({ keep_memory: { type: "refusal" } })).toBeNull();
      expect(resolveTriageFromDecisions({ keep_memory: { type: "noul", noul: Number.NaN } })).toBeNull();
    });
  });

  describe("buildWriteDecisionRequest", () => {
    it("exposes the five decision options and one target option per neighbor", () => {
      const request = buildWriteDecisionRequest(
        { kind: "semantic", content: "User prefers dark mode.", category: "user_preference", importance: 0.5 },
        [{ content: "User likes dark UI." }, { content: "User uses Bun." }],
      );
      const action = request.questions.action;
      if (action.type !== "choice") throw new Error("action must be a choice question");
      expect(Object.keys(action.criteria).sort()).toEqual(["add", "challenge", "noop", "supersede", "update"]);
      const target = request.questions.target;
      if (target.type !== "choice") throw new Error("target must be a choice question");
      expect(Object.keys(target.criteria).sort()).toEqual(["0", "1", "none"]);
    });
  });

  describe("resolveWriteDecisionFromDecisions", () => {
    const confident = (choice: string, probability: number): MemoryDecisionsAnswerMap => ({
      action: { type: "choice", choice, probabilities: { [choice]: probability } },
      target: { type: "choice", choice: "none", probabilities: { none: 0.9 } },
    });

    it("maps a confident add", () => {
      const decision = resolveWriteDecisionFromDecisions(confident("add", 0.9), 2);
      expect(decision).toEqual({ decision: "ADD", targetIndex: null, mergedContent: null });
    });

    it("maps a confident update with a valid target", () => {
      const decision = resolveWriteDecisionFromDecisions(
        {
          action: { type: "choice", choice: "update", probabilities: { update: 0.8 } },
          target: { type: "choice", choice: "1", probabilities: { "1": 0.7 } },
        },
        2,
      );
      expect(decision).toEqual({ decision: "UPDATE", targetIndex: 1, mergedContent: null });
    });

    it("escalates when the action probability is below the threshold", () => {
      expect(resolveWriteDecisionFromDecisions(confident("add", DECISIONS_ACTION_MIN_PROBABILITY - 0.1), 2)).toBeNull();
    });

    it("escalates when a targeted action has no usable target", () => {
      expect(
        resolveWriteDecisionFromDecisions(
          {
            action: { type: "choice", choice: "update", probabilities: { update: 0.9 } },
            target: { type: "refusal" },
          },
          2,
        ),
      ).toBeNull();
      expect(
        resolveWriteDecisionFromDecisions(
          {
            action: { type: "choice", choice: "supersede", probabilities: { supersede: 0.9 } },
            target: { type: "choice", choice: "9", probabilities: { "9": 0.9 } },
          },
          2,
        ),
      ).toBeNull();
      expect(
        resolveWriteDecisionFromDecisions(
          {
            action: { type: "choice", choice: "challenge", probabilities: { challenge: 0.9 } },
            target: { type: "choice", choice: "0", probabilities: { "0": DECISIONS_TARGET_MIN_PROBABILITY - 0.1 } },
          },
          2,
        ),
      ).toBeNull();
    });

    it("escalates on refusal or unknown option", () => {
      expect(resolveWriteDecisionFromDecisions({ action: { type: "refusal" } }, 2)).toBeNull();
      expect(resolveWriteDecisionFromDecisions(confident("merge", 0.9), 2)).toBeNull();
    });
  });

  describe("buildConflictDecisionsRequest / resolveConflictFromDecisions", () => {
    it("builds a noul question over both memories", () => {
      const request = buildConflictDecisionsRequest("A content", "B content");
      expect(request.state).toEqual({ memory_a: "A content", memory_b: "B content" });
      expect(request.questions.b_obsolete.type).toBe("noul");
    });

    it("supersedes at or above the threshold and keeps below it", () => {
      expect(
        resolveConflictFromDecisions({ b_obsolete: { type: "noul", noul: DECISIONS_CONFLICT_SUPERSEDE_THRESHOLD } }),
      ).toEqual({ superseded: true });
      expect(
        resolveConflictFromDecisions({
          b_obsolete: { type: "noul", noul: DECISIONS_CONFLICT_SUPERSEDE_THRESHOLD - 0.1 },
        }),
      ).toEqual({ superseded: false });
    });

    it("escalates on invalid answers", () => {
      expect(resolveConflictFromDecisions({})).toBeNull();
      expect(resolveConflictFromDecisions({ b_obsolete: { type: "refusal" } })).toBeNull();
    });
  });
});

// ---- MemoryPresenter decisions-path integration ----

type MemoryRow = Record<string, any>;

function createRow(overrides: Partial<MemoryRow> & Pick<MemoryRow, "id" | "agent_id" | "kind" | "content">): MemoryRow {
  return {
    category: null,
    confidence: null,
    content: overrides.content,
    created_at: Date.now(),
    decay_score: null,
    embedding_dim: null,
    embedding_id: null,
    embedding_model: null,
    importance: 0.5,
    accessed_at: null,
    access_count: 0,
    conflict_state: null,
    conflict_with: null,
    consolidated_at: null,
    id: overrides.id,
    is_anchor: 0,
    kind: overrides.kind,
    last_consolidated_at: null,
    persona_state: null,
    provenance_key: `${overrides.kind}:${overrides.id}`,
    source_entry_ids: null,
    source_session: null,
    status: "pending_embedding",
    superseded_by: null,
    user_scope: null,
    agent_id: overrides.agent_id,
    ...overrides,
  };
}

function createDecisionDeps(
  answers: (providerId: string, modelId: string, request: MemoryDecisionsRequest) => MemoryDecisionsResult | null,
) {
  const rows = new Map<string, MemoryRow>();
  const generateText = vi.fn(async (_providerId: string, _modelId: string, prompt: string) => {
    if (prompt.includes("Choose exactly ONE decision")) {
      return '{"decision":"ADD","targetIndex":null,"mergedContent":null,"reason":"chat"}';
    }
    if (prompt.includes("Output ONLY one word: KEEP or SKIP")) {
      return "KEEP";
    }
    return '[{"category":"user_preference","content":"User prefers dark mode","importance":0.5}]';
  });

  const repository = {
    insert: (input: any) => {
      const row = createRow({
        id: input.id,
        agent_id: input.agentId,
        kind: input.kind,
        content: input.content,
        importance: input.importance ?? 0.5,
        confidence: input.confidence ?? null,
        category: input.category ?? null,
        status: input.status ?? "pending_embedding",
        provenance_key: input.provenanceKey ?? `${input.kind}:${input.id}`,
      });
      rows.set(row.id, row);
      return row;
    },
    getById: (id: string) => rows.get(id),
    getByProvenanceKey: (_agentId: string, provenanceKey: string) =>
      Array.from(rows.values()).find((row) => row.provenance_key === provenanceKey),
    listByAgent: (agentId: string) => Array.from(rows.values()).filter((row) => row.agent_id === agentId),
    getActivePersona: () => undefined,
    listPersonaVersions: () => [],
    search: (agentId: string, query: string) =>
      Array.from(rows.values()).filter(
        (row) =>
          row.agent_id === agentId && row.content.toLowerCase().includes(query.toLowerCase()) && !row.superseded_by,
      ),
    listPendingEmbedding: () => [],
    updateStatus: () => undefined,
    requeueForEmbedding: () => 0,
    markSuperseded: (id: string, supersededBy: string | null) => {
      const row = rows.get(id);
      if (row) row.superseded_by = supersededBy;
    },
    recordAccess: (id: string) => {
      const row = rows.get(id);
      if (row) row.access_count += 1;
    },
    delete: (id: string) => {
      rows.delete(id);
    },
    clearByAgent: (agentId: string) => {
      let removed = 0;
      for (const [id, row] of rows.entries()) {
        if (row.agent_id === agentId) {
          rows.delete(id);
          removed += 1;
        }
      }
      return removed;
    },
    countByAgent: (agentId: string) => Array.from(rows.values()).filter((row) => row.agent_id === agentId).length,
  };

  const vectorStore = {
    upsert: async (_records: MemoryVectorRecord[]) => undefined,
    query: async () => [],
    deleteByMemoryIds: async () => undefined,
    close: async () => undefined,
    isUsable: () => true,
  };

  const askDecisions = vi.fn(answers);

  const deps: MemoryPresenterDeps = {
    repository: repository as never,
    resolveAgentConfig: (agentId: string) =>
      ({
        memoryEnabled: true,
        memoryEmbedding: null,
        decisionModel: { providerId: "openrouter", modelId: "typesafe/jev-1.14" },
        agentId,
      }) as never,
    isManagedAgent: () => true,
    getEmbeddings: async (_providerId: string, _modelId: string, texts: string[]) => texts.map(() => [0, 1, 0]),
    generateText: generateText as unknown as MemoryPresenterDeps["generateText"],
    askDecisions: askDecisions as unknown as NonNullable<MemoryPresenterDeps["askDecisions"]>,
    createVectorStore: async () => vectorStore as never,
    resetVectorStore: async () => undefined,
  };

  return { deps, rows, generateText, askDecisions };
}

const noul = (p: number): MemoryDecisionsResult => ({ answers: { keep_memory: { type: "noul", noul: p } } });

describe("MemoryPresenter decisions path", () => {
  it("skips extraction on a conclusive low triage probability without any chat call", async () => {
    const { deps, generateText, askDecisions } = createDecisionDeps((_providerId, _modelId, request) =>
      "keep_memory" in request.questions ? noul(0.1) : null,
    );
    const presenter = new MemoryPresenter(deps);

    const result = await presenter.extractAndStore({
      agentId: "agent-1",
      spanText: "User prefers dark mode.",
      model: { providerId: "prov", modelId: "chat" },
    });

    expect(result).toEqual({ ok: true, createdIds: [] });
    expect(askDecisions).toHaveBeenCalledTimes(1);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("escalates to the chat triage when the decisions answer is inconclusive", async () => {
    const { deps, generateText, askDecisions } = createDecisionDeps((_providerId, _modelId, request) =>
      "keep_memory" in request.questions ? { answers: { keep_memory: { type: "refusal" } } } : null,
    );
    const presenter = new MemoryPresenter(deps);

    const result = await presenter.extractAndStore({
      agentId: "agent-1",
      spanText: "User prefers dark mode.",
      model: { providerId: "prov", modelId: "chat" },
    });

    expect(result.ok).toBe(true);
    // Chat triage ran (its answer is KEEP) followed by extraction.
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(askDecisions).toHaveBeenCalledTimes(1);
  });

  it("applies a confident decisions write update using the candidate content", async () => {
    const { deps, rows, generateText, askDecisions } = createDecisionDeps((_providerId, _modelId, request) => {
      if ("keep_memory" in request.questions) return noul(0.9);
      if ("action" in request.questions) {
        return {
          answers: {
            action: { type: "choice", choice: "update", probabilities: { update: 0.85 } },
            target: { type: "choice", choice: "0", probabilities: { "0": 0.8 } },
          },
        };
      }
      return null;
    });
    const presenter = new MemoryPresenter(deps);

    const neighbor = createRow({
      id: "mem-neighbor",
      agent_id: "agent-1",
      kind: "semantic",
      content: "User prefers dark mode always",
      status: "embedded",
      embedding_dim: 2,
      embedding_model: "prov:embed",
    });
    rows.set(neighbor.id, neighbor);

    const result = await presenter.extractAndStore({
      agentId: "agent-1",
      spanText: "ignored",
      model: { providerId: "prov", modelId: "chat" },
    });

    expect(result.ok).toBe(true);
    expect(generateText).toHaveBeenCalledTimes(1); // extraction only; decision came from the API
    expect(askDecisions).toHaveBeenCalledTimes(2); // triage + write decision
    expect(rows.get("mem-neighbor")?.content).toBe("User prefers dark mode");
    expect(rows.get("mem-neighbor")?.superseded_by).toBeNull();
  });

  it("falls back to the chat decision when the decisions action confidence is low", async () => {
    const { deps, rows, generateText } = createDecisionDeps((_providerId, _modelId, request) => {
      if ("keep_memory" in request.questions) return noul(0.9);
      if ("action" in request.questions) {
        return {
          answers: {
            action: { type: "choice", choice: "noop", probabilities: { noop: 0.2, add: 0.1 } },
            target: { type: "choice", choice: "none", probabilities: { none: 0.7 } },
          },
        };
      }
      return null;
    });
    const presenter = new MemoryPresenter(deps);

    const neighbor = createRow({
      id: "mem-neighbor",
      agent_id: "agent-1",
      kind: "semantic",
      content: "User prefers dark mode always",
      status: "embedded",
      embedding_dim: 2,
      embedding_model: "prov:embed",
    });
    rows.set(neighbor.id, neighbor);

    const result = await presenter.extractAndStore({
      agentId: "agent-1",
      spanText: "ignored",
      model: { providerId: "prov", modelId: "chat" },
    });

    expect(result.ok).toBe(true);
    expect(generateText).toHaveBeenCalledTimes(2); // extraction + chat decision fallback
    const contents = Array.from(rows.values()).map((row) => row.content);
    expect(contents).toContain("User prefers dark mode");
    expect(contents).toContain("User prefers dark mode always");
  });
});
