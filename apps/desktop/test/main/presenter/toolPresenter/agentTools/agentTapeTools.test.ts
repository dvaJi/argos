import { describe, expect, it, vi } from "vitest";
import { AgentToolManager } from "@/presenter/toolPresenter/agentTools/agentToolManager";
import { TAPE_TOOL_NAMES } from "@/presenter/toolPresenter/agentTools";

vi.mock("electron", () => ({
  app: {
    getPath: () => "/tmp/argos-test",
  },
  nativeImage: {
    createFromPath: () => ({
      getSize: () => ({ width: 1, height: 1 }),
    }),
  },
}));

const buildRuntimePort = (overrides: Record<string, unknown> = {}) =>
  ({
    resolveConversationWorkdir: vi.fn<(...args: any[]) => any>().mockResolvedValue("/workspace"),
    resolveConversationSessionInfo: vi.fn<(...args: any[]) => any>().mockResolvedValue({
      sessionId: "conv-1",
      agentId: "argos",
      agentName: "Argos",
      agentType: "argos",
      providerId: "openai",
      modelId: "gpt-4.1",
      projectDir: "/workspace",
      permissionMode: "full_access",
      generationSettings: null,
      disabledAgentTools: [],
      activeSkills: [],
      sessionKind: "regular",
      parentSessionId: null,
      subagentEnabled: false,
      subagentMeta: null,
      availableSubagentSlots: [],
    }),
    getTapeInfo: vi.fn<(...args: any[]) => any>().mockResolvedValue({
      sessionId: "conv-1",
      entries: 3,
      anchors: 1,
      lastAnchor: "session/start",
      lastAnchorEntryId: 1,
      entriesSinceLastAnchor: 2,
      lastTokenUsage: 42,
      migrationState: "ready",
    }),
    searchTape: vi.fn<(...args: any[]) => any>().mockResolvedValue([
      {
        entryId: 2,
        kind: "message",
        name: "user/message",
        payload: { text: "auth flow" },
        meta: {},
        createdAt: 10,
      },
    ]),
    listTapeAnchors: vi.fn<(...args: any[]) => any>().mockResolvedValue([
      {
        sessionId: "conv-1",
        entryId: 1,
        kind: "anchor",
        name: "session/start",
        payload: { state: { owner: "human" } },
        meta: {},
        createdAt: 1,
      },
    ]),
    handoffTape: vi.fn<(...args: any[]) => any>().mockResolvedValue({
      sessionId: "conv-1",
      entryId: 4,
      kind: "anchor",
      name: "handoff/manual",
      payload: { state: { summary: "done" } },
      meta: { handoff: true },
      createdAt: 20,
    }),
    createSubagentSession: vi.fn<(...args: any[]) => any>(),
    sendConversationMessage: vi.fn<(...args: any[]) => any>(),
    cancelConversation: vi.fn<(...args: any[]) => any>(),
    subscribeArgosSessionUpdates: vi.fn<(...args: any[]) => any>(() => () => undefined),
    getSkillPresenter: () =>
      ({
        getActiveSkills: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
        getActiveSkillsAllowedTools: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
        listSkillScripts: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
        getSkillExtension: vi.fn<(...args: any[]) => any>().mockResolvedValue({
          version: 1,
          env: {},
          runtimePolicy: { python: "auto", node: "auto" },
          scriptOverrides: {},
        }),
      }) as any,
    getYoBrowserToolHandler: () => ({
      getToolDefinitions: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
      callTool: vi.fn<(...args: any[]) => any>(),
    }),
    getFilePresenter: () => ({
      getMimeType: vi.fn<(...args: any[]) => any>(),
      prepareFileCompletely: vi.fn<(...args: any[]) => any>(),
    }),
    getLlmProviderPresenter: () => ({
      executeWithRateLimit: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      generateCompletionStandalone: vi.fn<(...args: any[]) => any>(),
      generateImageStandalone: vi.fn<(...args: any[]) => any>(),
    }),
    cacheImage: vi.fn<(...args: any[]) => any>(),
    createSettingsWindow: vi.fn<(...args: any[]) => any>(),
    sendToWindow: vi.fn<(...args: any[]) => any>(),
    getApprovedFilePaths: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
    consumeSettingsApproval: vi.fn<(...args: any[]) => any>().mockReturnValue(false),
    ...overrides,
  }) as any;

const buildManager = (runtimePort = buildRuntimePort()) =>
  new AgentToolManager({
    agentWorkspacePath: "/workspace",
    configPresenter: {
      getSkillsEnabled: vi.fn<(...args: any[]) => any>().mockReturnValue(false),
      getSkillsPath: vi.fn<(...args: any[]) => any>().mockReturnValue("/skills"),
      resolveArgosAgentConfig: vi.fn<(...args: any[]) => any>().mockResolvedValue({}),
      getModelConfig: vi.fn<(...args: any[]) => any>().mockReturnValue({}),
    } as any,
    runtimePort,
  });

describe("Agent tape tools", () => {
  it("exposes tape tools for Argos sessions", async () => {
    const manager = buildManager();

    const defs = await manager.getAllToolDefinitions({
      chatMode: "agent",
      supportsVision: false,
      agentWorkspacePath: "/workspace",
      conversationId: "conv-1",
    });

    expect(defs.map((def) => def.function.name)).toEqual(
      expect.arrayContaining([
        TAPE_TOOL_NAMES.info,
        TAPE_TOOL_NAMES.search,
        TAPE_TOOL_NAMES.anchors,
        TAPE_TOOL_NAMES.handoff,
      ]),
    );
    const handoffDef = defs.find((def) => def.function.name === TAPE_TOOL_NAMES.handoff);
    const handoffParameters = handoffDef?.function.parameters as
      | { additionalProperties?: unknown; properties?: Record<string, unknown> }
      | undefined;
    expect(handoffParameters?.properties).toHaveProperty("summary");
    expect(handoffParameters?.properties).not.toHaveProperty("state");
    expect(handoffParameters?.additionalProperties).toBe(false);
  });

  it("does not expose tape tools outside Argos sessions", async () => {
    const manager = buildManager(
      buildRuntimePort({
        resolveConversationSessionInfo: vi.fn<(...args: any[]) => any>().mockResolvedValue({
          agentType: "acp",
        }),
      }),
    );

    const defs = await manager.getAllToolDefinitions({
      chatMode: "agent",
      supportsVision: false,
      agentWorkspacePath: "/workspace",
      conversationId: "conv-1",
    });

    expect(defs.some((def) => def.function.name === TAPE_TOOL_NAMES.info)).toBe(false);
  });

  it("routes tape tool calls through the runtime port", async () => {
    const runtimePort = buildRuntimePort();
    const manager = buildManager(runtimePort);

    const info = (await manager.callTool(TAPE_TOOL_NAMES.info, {}, "conv-1")) as {
      content: string;
    };
    const search = (await manager.callTool(
      TAPE_TOOL_NAMES.search,
      {
        query: "auth",
        limit: 5,
        kinds: ["message"],
        start: "1970-01-01T00:00:00.000Z",
        end: "999",
      },
      "conv-1",
    )) as {
      content: string;
    };
    const handoff = (await manager.callTool(
      TAPE_TOOL_NAMES.handoff,
      { name: "manual", summary: "done" },
      "conv-1",
    )) as {
      content: string;
    };
    const anchors = (await manager.callTool(TAPE_TOOL_NAMES.anchors, { limit: 5 }, "conv-1")) as {
      content: string;
    };

    expect(JSON.parse(info.content)).toMatchObject({ entries: 3, migrationState: "ready" });
    expect(JSON.parse(search.content)).toHaveLength(1);
    expect(JSON.parse(handoff.content)).toEqual({
      name: "handoff/manual",
      entryId: 4,
      createdAt: 20,
    });
    expect(JSON.parse(anchors.content)).toEqual([{ name: "session/start", entryId: 1, createdAt: 1 }]);
    expect(JSON.parse(anchors.content)[0]).not.toHaveProperty("payload");
    expect(runtimePort.getTapeInfo).toHaveBeenCalledWith("conv-1");
    expect(runtimePort.searchTape).toHaveBeenCalledWith("conv-1", "auth", {
      limit: 5,
      kinds: ["message"],
      start: "1970-01-01T00:00:00.000Z",
      end: "999",
    });
    expect(runtimePort.listTapeAnchors).toHaveBeenCalledWith("conv-1", { limit: 5 });
    expect(runtimePort.handoffTape).toHaveBeenCalledWith("conv-1", "manual", { summary: "done" });
  });

  it("rejects legacy tape_handoff state without writing an empty anchor", async () => {
    const runtimePort = buildRuntimePort();
    const manager = buildManager(runtimePort);

    await expect(
      manager.callTool(TAPE_TOOL_NAMES.handoff, { name: "manual", state: { summary: "done" } }, "conv-1"),
    ).rejects.toThrow('do not pass "state"');

    expect(runtimePort.handoffTape).not.toHaveBeenCalled();
  });
});
