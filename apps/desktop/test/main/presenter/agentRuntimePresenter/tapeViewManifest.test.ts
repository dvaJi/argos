import { describe, it, expect } from "vitest";
import {
  createTapeViewManifest,
  buildIncludedRefs,
  buildExcludedRefs,
  hashJson,
  stableJsonStringify,
  resolveTapeViewManifestPolicy,
  type TapeViewContextSelection,
} from "@/presenter/agentRuntimePresenter/tapeViewManifest";
import type { ChatMessageRecord } from "@shared/types/agent-interface";

function makeRecord(overrides: Partial<ChatMessageRecord> = {}): ChatMessageRecord {
  return {
    id: "msg-1",
    sessionId: "s1",
    orderSeq: 1,
    role: "user",
    content: JSON.stringify({ text: "Hello" }),
    status: "sent",
    isContextEdge: 0,
    metadata: "{}",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("stableJsonStringify", () => {
  it("produces deterministic output regardless of key order", () => {
    expect(stableJsonStringify({ b: 1, a: 2 })).toBe(stableJsonStringify({ a: 2, b: 1 }));
  });

  it("handles nested objects", () => {
    expect(stableJsonStringify({ z: { y: 1, x: 2 } })).toBe(stableJsonStringify({ z: { x: 2, y: 1 } }));
  });

  it("drops undefined values", () => {
    expect(stableJsonStringify({ a: undefined, b: 1 })).toBe(stableJsonStringify({ b: 1 }));
  });
});

describe("hashJson", () => {
  it("returns a 64-char hex string", () => {
    expect(hashJson({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for key-order-independent inputs", () => {
    expect(hashJson({ a: 1, b: 2 })).toBe(hashJson({ b: 2, a: 1 }));
  });
});

describe("resolveTapeViewManifestPolicy", () => {
  it("returns context_pressure_recovery_shadow when recovered", () => {
    const result = resolveTapeViewManifestPolicy({
      recoveredFromContextPressure: true,
      isInitialViewRequest: false,
    });
    expect(result.policy).toBe("context_pressure_recovery_shadow");
  });

  it("returns the explicit policy for initial view requests", () => {
    const result = resolveTapeViewManifestPolicy({
      recoveredFromContextPressure: false,
      isInitialViewRequest: true,
      viewPolicy: "legacy_context_v1",
    });
    expect(result.policy).toBe("legacy_context_v1");
  });

  it("defaults to tool_loop_shadow", () => {
    const result = resolveTapeViewManifestPolicy({
      recoveredFromContextPressure: false,
      isInitialViewRequest: false,
    });
    expect(result.policy).toBe("tool_loop_shadow");
  });
});

describe("buildIncludedRefs", () => {
  it("includes a synthetic system ref when system prompt is present", () => {
    const selection: TapeViewContextSelection = {
      includedRecords: [],
      excludedRecords: [],
      includesSystemPrompt: true,
    };
    const refs = buildIncludedRefs(selection);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ role: "system", source: "synthetic", reason: "system_prompt" });
  });

  it("maps included records to entry refs with tape source", () => {
    const record = makeRecord({ id: "msg-1", role: "user", orderSeq: 5 });
    const selection: TapeViewContextSelection = {
      includedRecords: [{ record, reason: "selected_history" }],
      excludedRecords: [],
      includesSystemPrompt: false,
    };
    const sourceMaps = { entryIdByMessageId: new Map([["msg-1", 42]]) };
    const refs = buildIncludedRefs(selection, sourceMaps);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      entryId: 42,
      messageId: "msg-1",
      orderSeq: 5,
      role: "user",
      source: "tape",
      reason: "selected_history",
    });
  });

  it("adds a new-user-input ref when messageId is provided", () => {
    const selection: TapeViewContextSelection = {
      includedRecords: [],
      excludedRecords: [],
      includesSystemPrompt: false,
      newUserMessageId: "msg-new",
    };
    const refs = buildIncludedRefs(selection);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      messageId: "msg-new",
      role: "user",
      reason: "new_user_input",
      source: "synthetic",
    });
  });
});

describe("buildExcludedRefs", () => {
  it("maps excluded records with their reason", () => {
    const record = makeRecord({ id: "msg-2", orderSeq: 3 });
    const selection: TapeViewContextSelection = {
      includedRecords: [],
      excludedRecords: [{ record, reason: "out_of_budget" }],
      includesSystemPrompt: false,
    };
    const refs = buildExcludedRefs(selection);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({
      messageId: "msg-2",
      orderSeq: 3,
      reason: "out_of_budget",
    });
  });
});

describe("createTapeViewManifest", () => {
  const baseInput = {
    sessionId: "s1",
    messageId: "msg-1",
    requestSeq: 1,
    taskType: "chat" as const,
    policy: "legacy_context_v1" as const,
    messages: [
      { role: "system" as const, content: "prompt" },
      { role: "user" as const, content: "hello" },
    ],
    tools: [],
    latestEntryId: 10,
    anchorEntryIds: [1, 5],
    included: [],
    excluded: [],
    tokenBudget: {
      contextLength: 8000,
      requestedMaxTokens: 4000,
      effectiveMaxTokens: 4000,
      reserveTokens: 500,
      toolReserveTokens: 0,
    },
    providerId: "openai",
    modelId: "gpt-4",
    summaryCursorOrderSeq: 1,
    supportsVision: false,
    supportsAudioInput: false,
    traceDebugEnabled: false,
  };

  it("produces a manifest with deterministic hashes for the same input", () => {
    const a = createTapeViewManifest({ ...baseInput, assembledAt: 1000 });
    const b = createTapeViewManifest({ ...baseInput, assembledAt: 1000 });
    expect(a.hashes.manifestHash).toBe(b.hashes.manifestHash);
    expect(a.hashes.promptHash).toBe(b.hashes.promptHash);
    expect(a.viewId).toBe(b.viewId);
  });

  it("computes a non-empty manifest hash", () => {
    const manifest = createTapeViewManifest({ ...baseInput, assembledAt: 1000 });
    expect(manifest.hashes.manifestHash).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.hashes.manifestHash).not.toBe("");
  });

  it("changes the manifest hash when included refs change", () => {
    const a = createTapeViewManifest({
      ...baseInput,
      assembledAt: 1000,
      included: [
        {
          entryId: 1,
          messageId: "m1",
          orderSeq: 1,
          role: "user",
          source: "tape",
          reason: "selected_history",
        },
      ],
    });
    const b = createTapeViewManifest({
      ...baseInput,
      assembledAt: 1000,
      included: [
        {
          entryId: 2,
          messageId: "m2",
          orderSeq: 2,
          role: "user",
          source: "tape",
          reason: "selected_history",
        },
      ],
    });
    expect(a.hashes.manifestHash).not.toBe(b.hashes.manifestHash);
  });

  it("stores parentViewId when provided", () => {
    const manifest = createTapeViewManifest({
      ...baseInput,
      assembledAt: 1000,
      parentViewId: "view_abc123",
    });
    expect(manifest.parentViewId).toBe("view_abc123");
  });

  it("defaults parentViewId to null", () => {
    const manifest = createTapeViewManifest({ ...baseInput, assembledAt: 1000 });
    expect(manifest.parentViewId).toBeNull();
  });
});
