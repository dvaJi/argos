import { describe, expect, it, vi } from "vitest";
import { createDaemonDispatcher } from "../src/dispatch/daemonDispatcher";
import { BunSessionRepository } from "../src/host/bun-session-repository";
import { AcpProviderExecutionPort } from "../src/host/acp-provider-execution";
import {
  providersGetAcpProcessConfigOptionsRoute,
  providersWarmupAcpProcessRoute,
  skillsOpenFolderRoute,
} from "@argos/shared-contracts/routes";

type SessionRow = Record<string, any>;
type MessageRow = Record<string, any>;
type PendingRow = Record<string, any>;

function createFakeDb() {
  const sessions = new Map<string, SessionRow>();
  const messages = new Map<string, MessageRow>();
  const pendingInputs = new Map<string, PendingRow>();
  const searchResults = new Map<string, SessionRow>();
  const traces = new Map<string, SessionRow>();
  const tapeEntries = new Map<string, SessionRow[]>();

  const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

  return {
    state: {
      sessions,
      messages,
      pendingInputs,
      searchResults,
      traces,
      tapeEntries,
    },
    exec: vi.fn(),
    prepare(sql: string) {
      return {
        run: (...params: unknown[]) => {
          if (sql.includes("INSERT INTO daemon_sessions")) {
            const [
              id,
              agent_id,
              title,
              project_dir,
              permission_mode,
              is_pinned,
              is_draft,
              session_kind,
              parent_session_id,
              subagent_enabled,
              provider_id,
              model_id,
              status,
              generation_status,
              created_at,
              updated_at,
              metadata,
            ] = params as any[];
            sessions.set(String(id), {
              id,
              agent_id,
              title,
              project_dir,
              permission_mode,
              is_pinned,
              is_draft,
              session_kind,
              parent_session_id,
              subagent_enabled,
              provider_id,
              model_id,
              status,
              generation_status,
              created_at,
              updated_at,
              metadata,
            });
            return { changes: 1 };
          }

          if (sql.includes("INSERT INTO daemon_messages")) {
            const [id, session_id, role, content, created_at, updated_at, metadata] = params as any[];
            messages.set(String(id), {
              id,
              session_id,
              role,
              content,
              created_at,
              updated_at,
              metadata: metadata ?? "{}",
              status: "sent",
              is_context_edge: 0,
              trace_count: 0,
            });
            return { changes: 1 };
          }

          if (sql.includes("INSERT INTO daemon_pending_inputs")) {
            const [
              id,
              session_id,
              mode,
              state,
              payload_json,
              queue_order,
              claimed_at,
              consumed_at,
              created_at,
              updated_at,
            ] = params as any[];
            pendingInputs.set(String(id), {
              id,
              session_id,
              mode,
              state,
              payload_json,
              queue_order,
              claimed_at,
              consumed_at,
              created_at,
              updated_at,
            });
            return { changes: 1 };
          }

          if (sql.includes("UPDATE daemon_pending_inputs SET payload_json = ?")) {
            const [payload_json, updated_at, id] = params as any[];
            const row = pendingInputs.get(String(id));
            if (row) {
              row.payload_json = payload_json;
              row.updated_at = updated_at;
            }
            return { changes: row ? 1 : 0 };
          }

          if (sql.includes("UPDATE daemon_pending_inputs SET mode = 'steer'")) {
            const [updated_at, id] = params as any[];
            const row = pendingInputs.get(String(id));
            if (row) {
              row.mode = "steer";
              row.queue_order = null;
              row.updated_at = updated_at;
            }
            return { changes: row ? 1 : 0 };
          }

          if (sql.includes("UPDATE daemon_pending_inputs SET queue_order = ?")) {
            const [queue_order, updated_at, id] = params as any[];
            const row = pendingInputs.get(String(id));
            if (row) {
              row.queue_order = queue_order;
              row.updated_at = updated_at;
            }
            return { changes: row ? 1 : 0 };
          }

          if (sql.includes("DELETE FROM daemon_pending_inputs WHERE id = ?")) {
            const [id] = params as any[];
            const deleted = pendingInputs.delete(String(id));
            return { changes: deleted ? 1 : 0 };
          }

          if (sql.includes("DELETE FROM daemon_pending_inputs WHERE session_id = ?")) {
            const [sessionId] = params as any[];
            for (const [id, row] of pendingInputs) {
              if (row.session_id === sessionId) {
                pendingInputs.delete(id);
              }
            }
            return { changes: 1 };
          }

          if (sql.includes("DELETE FROM daemon_messages WHERE session_id = ?")) {
            const [sessionId] = params as any[];
            for (const [id, row] of messages) {
              if (row.session_id === sessionId) {
                messages.delete(id);
              }
            }
            return { changes: 1 };
          }

          if (sql.includes("DELETE FROM daemon_messages WHERE id = ?")) {
            const [id] = params as any[];
            const deleted = messages.delete(String(id));
            return { changes: deleted ? 1 : 0 };
          }

          if (sql.includes("UPDATE daemon_sessions SET subagent_enabled = ?")) {
            const [enabled, updated_at, id] = params as any[];
            const row = sessions.get(String(id));
            if (row) {
              row.subagent_enabled = enabled;
              row.updated_at = updated_at;
            }
            return { changes: row ? 1 : 0 };
          }

          if (sql.includes("UPDATE daemon_sessions SET permission_mode = ?")) {
            const [mode, updated_at, id] = params as any[];
            const row = sessions.get(String(id));
            if (row) {
              row.permission_mode = mode;
              row.updated_at = updated_at;
            }
            return { changes: row ? 1 : 0 };
          }

          if (sql.includes("UPDATE daemon_sessions SET provider_id = ?")) {
            const [providerId, modelId, updated_at, id] = params as any[];
            const row = sessions.get(String(id));
            if (row) {
              row.provider_id = providerId;
              row.model_id = modelId;
              row.updated_at = updated_at;
            }
            return { changes: row ? 1 : 0 };
          }

          if (sql.includes("UPDATE daemon_sessions SET project_dir = ?")) {
            const [projectDir, updated_at, id] = params as any[];
            const row = sessions.get(String(id));
            if (row) {
              row.project_dir = projectDir;
              row.updated_at = updated_at;
            }
            return { changes: row ? 1 : 0 };
          }

          if (sql.includes("UPDATE daemon_sessions SET title = ?")) {
            const [title, updated_at, id] = params as any[];
            const row = sessions.get(String(id));
            if (row) {
              row.title = title;
              row.updated_at = updated_at;
            }
            return { changes: row ? 1 : 0 };
          }

          if (sql.includes("UPDATE daemon_sessions SET is_pinned = NOT is_pinned")) {
            const [updated_at, id] = params as any[];
            const row = sessions.get(String(id));
            if (row) {
              row.is_pinned = row.is_pinned ? 0 : 1;
              row.updated_at = updated_at;
            }
            return { changes: row ? 1 : 0 };
          }

          if (sql.includes("UPDATE daemon_sessions SET is_pinned = ?")) {
            const [pinned, updated_at, id] = params as any[];
            const row = sessions.get(String(id));
            if (row) {
              row.is_pinned = pinned;
              row.updated_at = updated_at;
            }
            return { changes: row ? 1 : 0 };
          }

          if (sql.includes("UPDATE daemon_sessions SET status = 'active'")) {
            const [updated_at, id] = params as any[];
            const row = sessions.get(String(id));
            if (row) {
              row.status = "active";
              row.updated_at = updated_at;
            }
            return { changes: row ? 1 : 0 };
          }

          if (sql.includes("UPDATE daemon_sessions SET status = 'idle'")) {
            const [updated_at] = params as any[];
            for (const row of sessions.values()) {
              if (row.status === "active") {
                row.status = "idle";
                row.updated_at = updated_at;
              }
            }
            return { changes: 1 };
          }

          if (sql.includes("UPDATE daemon_messages SET content = ?")) {
            const [content, updated_at, id] = params as any[];
            const row = messages.get(String(id));
            if (row) {
              row.content = content;
              row.updated_at = updated_at;
            }
            return { changes: row ? 1 : 0 };
          }

          if (sql.includes("UPDATE daemon_sessions SET metadata = ?")) {
            const [metadata, updated_at, id] = params as any[];
            const row = sessions.get(String(id));
            if (row) {
              row.metadata = metadata;
              row.updated_at = updated_at;
            }
            return { changes: row ? 1 : 0 };
          }

          return { changes: 0 };
        },
        get: (...params: unknown[]) => {
          if (sql.includes("PRAGMA table_info(daemon_sessions)")) {
            return null;
          }
          if (sql.includes("SELECT * FROM daemon_sessions WHERE id = ?")) {
            return clone(sessions.get(String(params[0])));
          }
          if (sql.includes("SELECT permission_mode FROM daemon_sessions WHERE id = ?")) {
            const row = sessions.get(String(params[0]));
            return row ? { permission_mode: row.permission_mode } : undefined;
          }
          if (sql.includes("SELECT metadata FROM daemon_sessions WHERE id = ?")) {
            const row = sessions.get(String(params[0]));
            return row ? { metadata: row.metadata } : undefined;
          }
          if (sql.includes("SELECT * FROM daemon_messages WHERE id = ?")) {
            return clone(messages.get(String(params[0])));
          }
          if (sql.includes("SELECT id FROM daemon_sessions WHERE id = ?")) {
            const row = sessions.get(String(params[0]));
            return row ? { id: row.id } : undefined;
          }
          if (sql.includes("SELECT * FROM daemon_sessions WHERE status = 'active' LIMIT 1")) {
            const row = Array.from(sessions.values()).find((entry) => entry.status === "active");
            return row ? clone(row) : undefined;
          }
          if (sql.includes("SELECT * FROM daemon_sessions")) {
            return null;
          }
          return undefined;
        },
        all: (...params: unknown[]) => {
          if (sql.includes("PRAGMA table_info(daemon_sessions)")) {
            return [
              { name: "id" },
              { name: "agent_id" },
              { name: "title" },
              { name: "project_dir" },
              { name: "permission_mode" },
              { name: "is_pinned" },
              { name: "is_draft" },
              { name: "session_kind" },
              { name: "parent_session_id" },
              { name: "subagent_enabled" },
              { name: "provider_id" },
              { name: "model_id" },
              { name: "status" },
              { name: "generation_status" },
              { name: "created_at" },
              { name: "updated_at" },
              { name: "metadata" },
            ];
          }

          if (sql.includes("SELECT * FROM daemon_sessions WHERE session_id = ?")) {
            return [];
          }

          if (sql.includes("SELECT * FROM daemon_sessions")) {
            const [firstParam, secondParam] = params as any[];
            const hasAgentFilter = sql.includes("agent_id = ?");
            const hasProjectFilter = sql.includes("project_dir = ?");
            const hasParentFilter = sql.includes("parent_session_id = ?");
            const includeSubagents = !sql.includes("parent_session_id IS NULL");

            let rows = Array.from(sessions.values());
            let idx = 0;
            if (hasAgentFilter) {
              rows = rows.filter((row) => row.agent_id === firstParam);
              idx += 1;
            }
            if (hasProjectFilter) {
              rows = rows.filter((row) => row.project_dir === (hasAgentFilter ? secondParam : firstParam));
              idx += 1;
            }
            if (hasParentFilter) {
              rows = rows.filter((row) => row.parent_session_id === params[idx]);
              idx += 1;
            }
            if (!includeSubagents) {
              rows = rows.filter((row) => !row.parent_session_id);
            }

            return rows.sort((a, b) => b.updated_at - a.updated_at).map(clone);
          }

          if (sql.includes("SELECT * FROM daemon_messages WHERE session_id = ?")) {
            const sessionId = String(params[0]);
            return Array.from(messages.values())
              .filter((row) => row.session_id === sessionId)
              .sort((a, b) => a.created_at - b.created_at)
              .map(clone);
          }

          if (sql.includes("daemon_pending_inputs") && sql.includes("WHERE id = ?")) {
            return clone(pendingInputs.get(String(params[0])));
          }

          if (sql.includes("daemon_pending_inputs") && sql.includes("WHERE session_id = ?")) {
            const sessionId = String(params[0]);
            return Array.from(pendingInputs.values())
              .filter((row) => row.session_id === sessionId)
              .sort((a, b) => {
                const modeRank = a.mode === "steer" ? 0 : 1;
                const otherRank = b.mode === "steer" ? 0 : 1;
                if (modeRank !== otherRank) return modeRank - otherRank;
                const aOrder = a.mode === "queue" ? (a.queue_order ?? 2147483647) : a.created_at;
                const bOrder = b.mode === "queue" ? (b.queue_order ?? 2147483647) : b.created_at;
                return aOrder - bOrder || a.created_at - b.created_at;
              })
              .map(clone);
          }

          if (sql.includes("daemon_message_search_results") && sql.includes("WHERE message_id = ?")) {
            const messageId = String(params[0]);
            return Array.from(searchResults.values())
              .filter((row) => row.message_id === messageId)
              .sort((a, b) => a.created_at - b.created_at)
              .map(clone);
          }

          if (sql.includes("daemon_message_traces") && sql.includes("WHERE message_id = ?")) {
            const messageId = String(params[0]);
            return Array.from(traces.values())
              .filter((row) => row.message_id === messageId)
              .sort((a, b) => b.request_seq - a.request_seq)
              .map(clone);
          }

          if (sql.includes("daemon_tape_entries") && sql.includes("WHERE session_id = ?")) {
            const sessionId = String(params[0]);
            return (tapeEntries.get(sessionId) ?? [])
              .slice()
              .sort((a, b) => a.entry_id - b.entry_id)
              .map(clone);
          }

          return [];
        },
      };
    },
  };
}

function createSkillRuntime() {
  return {
    presenter: {
      getMetadataList: vi.fn(async () => []),
      getSkillsDir: vi.fn(async () => "/tmp/skills"),
      installFromFolder: vi.fn(async () => ({ installed: true })),
      installFromZip: vi.fn(async () => ({ installed: true })),
      installFromUrl: vi.fn(async () => ({ installed: true })),
      uninstallSkill: vi.fn(async () => ({ uninstalled: true })),
      updateSkillFile: vi.fn(async () => ({ updated: true })),
      saveSkillWithExtension: vi.fn(async () => ({ saved: true })),
      getSkillFolderTree: vi.fn(async () => []),
      openSkillsFolder: vi.fn(async () => undefined),
      getSkillExtension: vi.fn(async () => ({})),
      saveSkillExtension: vi.fn(async () => undefined),
      listSkillScripts: vi.fn(async () => []),
      getActiveSkills: vi.fn(async () => []),
      setActiveSkills: vi.fn(async () => []),
    },
  };
}

function createScheduledTasksRuntime() {
  return {
    list: vi.fn(() => ({ version: 1 as const, tasks: [] as unknown[] })),
    upsert: vi.fn(() => ({ task: {}, settings: { version: 1 as const, tasks: [] as unknown[] } })),
    delete: vi.fn(() => ({ settings: { version: 1 as const, tasks: [] as unknown[] } })),
    toggle: vi.fn(() => ({ task: {}, settings: { version: 1 as const, tasks: [] as unknown[] } })),
    fireNow: vi.fn(async () => ({ task: {}, settings: { version: 1 as const, tasks: [] as unknown[] } })),
  };
}

function createSyncRuntime() {
  return {
    getBackupStatus: vi.fn(async () => ({ autoSyncEnabled: false, lastBackupTimestamp: null })),
    listBackups: vi.fn(async () => ({ backups: [] })),
    startBackup: vi.fn(async () => ({ timestamp: 1 })),
    restoreBackup: vi.fn(async () => undefined),
    getCloudConfig: vi.fn(async () => ({
      enabled: false,
      endpoint: "",
      bucket: "",
      region: "",
      prefix: "",
      accessKeyId: "",
      hasSecret: false,
      safeStorageAvailable: false,
    })),
    setCloudConfig: vi.fn(async () => ({
      enabled: false,
      endpoint: "",
      bucket: "",
      region: "",
      prefix: "",
      accessKeyId: "",
      hasSecret: false,
      safeStorageAvailable: false,
    })),
    testCloud: vi.fn(async () => ({ success: true, message: "" })),
    uploadToCloud: vi.fn(async () => ({ success: true, message: "" })),
    pullFromCloud: vi.fn(async () => ({ success: true, message: "" })),
  };
}

function createMemoryRuntime() {
  return {
    presenter: {
      listMemories: vi.fn(() => []),
      getStatus: vi.fn(() => ({ total: 0, pendingEmbedding: 0, hasPersona: false })),
      recall: vi.fn(async () => []),
      deleteMemory: vi.fn(async () => true),
      clearMemories: vi.fn(async () => 0),
    },
    addMemory: vi.fn(async () => ({ id: "memory-1" })),
  };
}

function createPluginRuntime() {
  return {
    listPlugins: vi.fn(async () => []),
    getPlugin: vi.fn(async () => undefined),
    enablePlugin: vi.fn(async () => ({ enabled: true })),
    disablePlugin: vi.fn(async () => ({ disabled: true })),
    invokeAction: vi.fn(async () => ({ invoked: true })),
  };
}

function createProviderImportService() {
  return {
    scan: vi.fn(async () => ({
      sessionId: "scan-1",
      sourceOrder: [],
      sources: [],
      providers: [],
    })),
    apply: vi.fn(() => ({
      summary: { imported: 0, created: 0, updated: 0, skipped: 0, overwritten: 0, models: 0 },
      results: [],
    })),
  };
}

function createSettingsActivityDb() {
  return {
    prepare: vi.fn(() => ({
      all: vi.fn(() => []),
    })),
  };
}

function createMcpRuntime() {
  return {
    startServer: vi.fn(),
    stopServer: vi.fn(),
    isServerRunning: vi.fn(() => false),
    refreshNpmRegistry: vi.fn(async () => "https://registry.npmjs.org/"),
    listToolDefinitions: vi.fn(async () => []),
    getClients: vi.fn(async () => []),
    callTool: vi.fn(async () => ({})),
    listPrompts: vi.fn(async () => []),
    getPrompt: vi.fn(async () => ({})),
    listResources: vi.fn(async () => []),
    readResource: vi.fn(async () => ({})),
  };
}

describe("BunSessionRepository ACP session ownership", () => {
  it("owns ACP draft sessions and pending inputs", async () => {
    const db = createFakeDb();
    const eventPublisher = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    };
    const repo = new BunSessionRepository(db as any, eventPublisher as any);

    const session = await repo.createDraftAcpSession({
      agentId: "acp-agent-1",
      projectDir: "/tmp/project",
      permissionMode: "default",
    });

    expect(session).toMatchObject({
      agentId: "acp-agent-1",
      projectDir: "/tmp/project",
      isDraft: true,
      providerId: "acp",
      modelId: "acp-agent-1",
    });

    expect(eventPublisher.publish).toHaveBeenCalledWith(
      "sessions.updated",
      expect.objectContaining({
        sessionIds: [session.id],
        reason: "created",
      }),
    );
  });

  it("owns message edit, retry preparation, fork, and delete-from-message persistence", async () => {
    const db = createFakeDb();
    const eventPublisher = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    };
    const repo = new BunSessionRepository(db as any, eventPublisher as any);
    const session = await repo.createDraftAcpSession({
      agentId: "acp-agent-1",
      projectDir: "/tmp/project",
      permissionMode: "default",
    });

    const userMessageId = await repo.addMessage(
      session.id,
      "user",
      JSON.stringify({ text: "original", files: [], links: [], search: false, think: false }),
    );
    await repo.addMessage(session.id, "assistant", JSON.stringify([{ type: "text", content: "answer" }]));

    const edited = await repo.editUserMessage(session.id, userMessageId, "edited");
    expect(JSON.parse(edited.content)).toMatchObject({ text: "edited" });

    const retryInput = await repo.prepareRetryMessage(session.id, userMessageId);
    expect(retryInput).toMatchObject({ text: "edited" });
    expect(await repo.listMessages(session.id)).toEqual([]);

    const secondUserMessageId = await repo.addMessage(
      session.id,
      "user",
      JSON.stringify({ text: "fork me", files: [], links: [], search: false, think: false }),
    );
    await repo.addMessage(session.id, "assistant", JSON.stringify([{ type: "text", content: "forked answer" }]));

    const fork = await repo.forkSession(session.id, secondUserMessageId, "Forked");
    expect(fork).toMatchObject({
      title: "Forked",
      agentId: session.agentId,
      providerId: session.providerId,
      modelId: session.modelId,
    });
    expect(await repo.listMessages(fork.id)).toHaveLength(1);

    await repo.deleteMessage(session.id, secondUserMessageId);
    expect(await repo.listMessages(session.id)).toEqual([]);
  });

  it("persists generation settings and disabled agent tools in session metadata", async () => {
    const db = createFakeDb();
    const eventPublisher = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    };
    const repo = new BunSessionRepository(db as any, eventPublisher as any);

    const session = await repo.create(
      {
        agentId: "agent-1",
        message: "hello",
        projectDir: "/tmp/project",
        permissionMode: "default",
        providerId: "provider-1",
        modelId: "model-1",
        disabledAgentTools: ["beta", "alpha", "beta"],
        generationSettings: {
          temperature: 0.2,
          systemPrompt: "prompt",
        },
      } as any,
      1,
    );

    expect(await repo.getGenerationSettings(session.id)).toMatchObject({
      systemPrompt: "prompt",
      temperature: 0.2,
    });
    expect(await repo.getDisabledAgentTools(session.id)).toEqual(["alpha", "beta"]);

    const updatedSettings = await repo.updateGenerationSettings(session.id, {
      maxTokens: 1234,
    });
    expect(updatedSettings).toMatchObject({
      systemPrompt: "prompt",
      temperature: 0.2,
      maxTokens: 1234,
    });

    const updatedTools = await repo.updateDisabledAgentTools(session.id, ["read", "exec", "read"]);
    expect(updatedTools).toEqual(["exec", "read"]);
  });
});

describe("daemon ACP session routes", () => {
  it("owns ACP session commands and config option routes", async () => {
    const session = {
      sessionId: "remote-session-1",
      agentId: "acp-agent-1",
      modelId: "acp-agent-1",
      availableCommands: [{ name: "reset", description: "Reset state" }],
      configState: {
        source: "legacy",
        options: [
          {
            id: "flag",
            label: "Flag",
            description: null,
            type: "boolean",
            category: null,
            currentValue: false,
          },
        ],
      },
      currentModeId: "default",
      connection: {
        agent: {
          request: vi.fn(async () => ({
            configOptions: [
              {
                id: "flag",
                name: "Flag",
                description: null,
                type: "boolean",
                currentValue: true,
              },
            ],
          })),
        },
      },
    };

    const provider = new AcpProviderExecutionPort(
      {
        getAcpAgents: vi.fn(async () => []),
        getProviderById: vi.fn(() => ({ id: "acp", name: "ACP" })),
      } as any,
      {
        get: vi.fn(),
      } as any,
      {
        publish: vi.fn(),
      } as any,
      {
        dataDir: "/tmp",
        appVersion: "1.0.0",
        db: {
          prepare: vi.fn(() => ({
            get: vi.fn(),
            all: vi.fn(),
            run: vi.fn(),
          })),
        },
      },
    );

    const runtime = {
      sessionManager: {
        getSession: vi.fn(() => session),
      },
      processManager: {
        updateBoundProcessConfigState: vi.fn(() => true),
      },
    };

    vi.spyOn(provider as any, "getRuntime").mockResolvedValue(runtime);

    await expect(provider.getAcpSessionCommands("session-1")).resolves.toEqual([
      { name: "reset", description: "Reset state" },
    ]);

    await expect(provider.getAcpSessionConfigOptions("session-1")).resolves.toEqual({
      source: "legacy",
      options: [
        {
          id: "flag",
          label: "Flag",
          description: null,
          type: "boolean",
          category: null,
          currentValue: false,
        },
      ],
    });

    await expect(provider.setAcpSessionConfigOption("session-1", "flag", true)).resolves.toEqual({
      source: "configOptions",
      options: [
        {
          id: "flag",
          label: "Flag",
          description: null,
          type: "boolean",
          category: null,
          currentValue: true,
        },
      ],
    });

    expect(session.connection.agent.request).toHaveBeenCalledTimes(1);
    expect(runtime.processManager.updateBoundProcessConfigState).toHaveBeenCalledWith("session-1", {
      source: "configOptions",
      options: [
        {
          id: "flag",
          label: "Flag",
          description: null,
          type: "boolean",
          category: null,
          currentValue: true,
        },
      ],
    });
  });

  it("supports ACP steering and legacy model selection in daemon mode", async () => {
    const session = {
      sessionId: "remote-session-1",
      agentId: "acp-agent-1",
      modelId: "acp-agent-1",
      availableCommands: [],
      configState: {
        source: "legacy",
        options: [
          {
            id: "__acp_legacy_model__",
            label: "Model",
            description: null,
            type: "select",
            category: "mode",
            currentValue: "model-a",
            options: [{ value: "model-a", label: "Model A" }],
          },
        ],
      },
      currentModeId: "default",
      connection: {
        agent: {
          request: vi.fn(async () => ({
            configOptions: [
              {
                id: "__acp_legacy_model__",
                name: "Model",
                description: null,
                type: "select",
                category: "mode",
                currentValue: "model-b",
                options: [{ value: "model-a", label: "Model A" }],
              },
            ],
          })),
        },
      },
    };

    const provider = new AcpProviderExecutionPort(
      {
        getAcpAgents: vi.fn(async () => [{ id: "acp-agent-1", name: "ACP Agent" }]),
        getProviderById: vi.fn(() => ({ id: "acp", name: "ACP" })),
      } as any,
      {
        get: vi.fn(async () => ({ id: "session-1", modelId: "acp-agent-1" })),
      } as any,
      {
        publish: vi.fn(),
      } as any,
      {
        dataDir: "/tmp",
        appVersion: "1.0.0",
        db: {
          prepare: vi.fn(() => ({
            get: vi.fn(),
            all: vi.fn(),
            run: vi.fn(),
          })),
        },
      },
    );

    const runtime = {
      sessionManager: {
        getSession: vi.fn(() => session),
      },
      processManager: {
        updateBoundProcessConfigState: vi.fn(() => true),
      },
      runPromptTurn: vi.fn(async function* () {}),
    };

    vi.spyOn(provider as any, "getRuntime").mockResolvedValue(runtime);
    vi.spyOn(provider as any, "cancelGeneration").mockResolvedValue(undefined);
    vi.spyOn(provider as any, "interruptActiveTurn").mockResolvedValue(undefined);
    vi.spyOn(provider as any, "sendMessage").mockResolvedValue({ requestId: null, messageId: null });

    await expect(provider.setAcpSessionConfigOption("session-1", "__acp_legacy_model__", "model-b")).resolves.toEqual({
      source: "legacy",
      options: [
        {
          id: "__acp_legacy_model__",
          label: "Model",
          description: null,
          type: "select",
          category: "mode",
          currentValue: "model-b",
          options: [{ value: "model-a", label: "Model A" }],
        },
      ],
    });

    await expect(provider.steerActiveTurn("session-1", "steer this")).resolves.toBeUndefined();
    expect(provider.interruptActiveTurn).toHaveBeenCalledWith("session-1");
    expect(provider.sendMessage).toHaveBeenCalledWith("session-1", "steer this");
    expect(runtime.processManager.updateBoundProcessConfigState).toHaveBeenCalledWith("session-1", {
      source: "legacy",
      options: [
        {
          id: "__acp_legacy_model__",
          label: "Model",
          description: null,
          type: "select",
          category: "mode",
          currentValue: "model-b",
          options: [{ value: "model-a", label: "Model A" }],
        },
      ],
    });
  });

  it("owns ACP warmup and process config option routes in daemon mode", async () => {
    const providerExecutionPort = {
      warmupAcpProcess: vi.fn(async () => undefined),
      getAcpProcessConfigOptions: vi.fn(async () => ({
        source: "legacy",
        options: [{ id: "flag", label: "Flag", type: "boolean", currentValue: true }],
      })),
    };
    const eventPublisher = {
      publish: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
    };
    const acpSessionExecutionPort = {
      getAcpSessionCommands: vi.fn(async () => []),
      getAcpSessionConfigOptions: vi.fn(async () => ({})),
      setAcpSessionConfigOption: vi.fn(async () => ({})),
    };

    const dispatcher = createDaemonDispatcher(
      {
        getProviderById: vi.fn(() => ({ id: "acp", name: "ACP" })),
        getAcpAgents: vi.fn(async () => [{ id: "acp-agent-1", name: "ACP Agent" }]),
      } as any,
      eventPublisher as any,
      {
        createDraftAcpSession: vi.fn(),
      } as any,
      providerExecutionPort as any,
      acpSessionExecutionPort as any,
      createMcpRuntime() as any,
      createSkillRuntime() as any,
      createScheduledTasksRuntime() as any,
      createSyncRuntime() as any,
      createMemoryRuntime() as any,
      createPluginRuntime() as any,
      createProviderImportService() as any,
      createSettingsActivityDb() as any,
    );

    await expect(
      dispatcher(providersWarmupAcpProcessRoute.name, {
        agentId: "acp-agent-1",
        workdir: "/tmp/project",
      }),
    ).resolves.toEqual({ warmedUp: true });
    expect(providerExecutionPort.warmupAcpProcess).toHaveBeenCalledWith("acp-agent-1", "/tmp/project");

    await expect(
      dispatcher(providersGetAcpProcessConfigOptionsRoute.name, {
        agentId: "acp-agent-1",
        workdir: "/tmp/project",
      }),
    ).resolves.toEqual({
      state: {
        source: "legacy",
        options: [{ id: "flag", label: "Flag", type: "boolean", currentValue: true }],
      },
    });
    expect(providerExecutionPort.getAcpProcessConfigOptions).toHaveBeenCalledWith("acp-agent-1", "/tmp/project");
  });

  it("rejects opening the skills folder in daemon mode", async () => {
    const dispatcher = createDaemonDispatcher(
      {
        getProviderById: vi.fn(() => ({ id: "acp", name: "ACP" })),
        getAcpAgents: vi.fn(async () => []),
      } as any,
      {
        publish: vi.fn(),
        subscribe: vi.fn(() => () => undefined),
      } as any,
      undefined as any,
      undefined as any,
      {
        getAcpSessionCommands: vi.fn(async () => []),
        getAcpSessionConfigOptions: vi.fn(async () => ({})),
        setAcpSessionConfigOption: vi.fn(async () => ({})),
      } as any,
      createMcpRuntime() as any,
      createSkillRuntime() as any,
      createScheduledTasksRuntime() as any,
      createSyncRuntime() as any,
      createMemoryRuntime() as any,
      createPluginRuntime() as any,
      createProviderImportService() as any,
      createSettingsActivityDb() as any,
    );

    await expect(dispatcher(skillsOpenFolderRoute.name, {})).rejects.toThrow(
      "Opening the skills folder is not available in daemon mode.",
    );
  });
});

describe("daemon session migration routes", () => {
  it("reads analytics routes from the daemon repository", async () => {
    const db = createFakeDb();
    db.state.searchResults.set("sr-1", {
      id: "sr-1",
      session_id: "session-1",
      message_id: "message-1",
      search_id: "search-1",
      rank: 1,
      content: JSON.stringify({
        title: "Result title",
        url: "https://example.com",
        snippet: "snippet",
        rank: 1,
        searchId: "search-1",
      }),
      dedupe_key: "message-1::search-1::1::result",
      created_at: 100,
    });
    db.state.traces.set("trace-1", {
      id: "trace-1",
      message_id: "message-1",
      session_id: "session-1",
      provider_id: "provider-1",
      model_id: "model-1",
      request_seq: 2,
      endpoint: "/chat/completions",
      headers_json: "{}",
      body_json: "{}",
      truncated: 0,
      created_at: 200,
    });
    db.state.tapeEntries.set("session-1", [
      {
        session_id: "session-1",
        entry_id: 1,
        kind: "event",
        name: "tape/view-manifest",
        source_type: null,
        source_id: null,
        source_seq: null,
        provenance_key: null,
        payload_json: JSON.stringify({
          data: {
            manifest: {
              messageId: "message-1",
              requestSeq: 2,
              assembledAt: 300,
            },
          },
        }),
        meta_json: JSON.stringify({ integrity: "valid" }),
        created_at: 300,
      },
    ]);

    const repo = new BunSessionRepository(
      db as any,
      {
        publish: vi.fn(),
        subscribe: vi.fn(() => () => undefined),
      } as any,
    );
    const dispatcher = createDaemonDispatcher(
      {
        getDefaultModel: vi.fn(() => ({ providerId: "provider-1", modelId: "model-1" })),
        getDefaultProjectPath: vi.fn(() => "/tmp/project"),
      } as any,
      undefined,
      repo as any,
      {
        sendMessage: vi.fn(),
        cancelGeneration: vi.fn(),
        testConnection: vi.fn(),
      } as any,
    );

    await expect(
      dispatcher("sessions.getSearchResults", { messageId: "message-1", searchId: "search-1" }),
    ).resolves.toEqual({
      results: [
        expect.objectContaining({
          title: "Result title",
          url: "https://example.com",
          snippet: "snippet",
          searchId: "search-1",
        }),
      ],
    });
    await expect(dispatcher("sessions.listMessageTraces", { messageId: "message-1" })).resolves.toEqual({
      traces: [
        expect.objectContaining({
          id: "trace-1",
          messageId: "message-1",
          requestSeq: 2,
          endpoint: "/chat/completions",
        }),
      ],
    });
    await expect(dispatcher("sessions.getViewManifests", { sessionId: "session-1" })).resolves.toEqual({
      manifests: [
        expect.objectContaining({
          sessionId: "session-1",
          messageId: "message-1",
          requestSeq: 2,
        }),
      ],
    });
    await expect(dispatcher("sessions.getViewLineage", { sessionId: "session-1" })).resolves.toEqual({
      lineage: [
        expect.objectContaining({
          sessionId: "session-1",
          messageId: "message-1",
          requestSeq: 2,
        }),
      ],
    });
  });

  it("owns translateText and moveToAgent route dispatch", async () => {
    const session = {
      id: "session-1",
      agentId: "acp-agent-1",
      title: "Original",
      projectDir: "/tmp/project",
      isPinned: false,
      isDraft: false,
      sessionKind: "regular",
      parentSessionId: null,
      subagentEnabled: true,
      createdAt: 1,
      updatedAt: 1,
      status: "idle",
      providerId: "acp",
      modelId: "acp-agent-1",
    };

    const movedSession = {
      ...session,
      agentId: "acp-agent-2",
      modelId: "acp-agent-2",
    };

    const sessionRepository = {
      get: vi.fn(async () => session),
      list: vi.fn(async () => [session]),
      listMessages: vi.fn(async () => []),
      moveSessionToAgent: vi.fn(async () => movedSession),
      getGenerationSettings: vi.fn(async () => null),
      getDisabledAgentTools: vi.fn(async () => []),
      delete: vi.fn(async () => undefined),
    };

    const providerExecutionPort = {
      generateCompletion: vi.fn(async () => "translated text"),
    };

    const dispatcher = createDaemonDispatcher(
      {
        getDefaultModel: vi.fn(() => ({ providerId: "provider-1", modelId: "model-1" })),
        getDefaultProjectPath: vi.fn(() => "/tmp/project"),
      } as any,
      undefined,
      sessionRepository as any,
      providerExecutionPort as any,
    );

    await expect(dispatcher("sessions.translateText", { text: "hello", locale: "es" })).resolves.toEqual({
      text: "translated text",
    });

    await expect(
      dispatcher("sessions.moveToAgent", { sessionId: "session-1", toAgentId: "acp-agent-2" }),
    ).resolves.toEqual({
      session: movedSession,
    });

    expect(providerExecutionPort.generateCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "provider-1",
        modelId: "model-1",
      }),
    );
    expect(sessionRepository.moveSessionToAgent).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        agentId: "acp-agent-2",
        providerId: "acp",
        modelId: "acp-agent-2",
      }),
    );
  });

  it("owns summaryTitles route dispatch and delegates to the provider execution port", async () => {
    const providerExecutionPort = {
      generateCompletion: vi.fn(async () => "Generated Title"),
    };

    const dispatcher = createDaemonDispatcher(
      {
        getDefaultModel: vi.fn(() => ({ providerId: "provider-1", modelId: "model-1" })),
        getDefaultProjectPath: vi.fn(() => "/tmp/project"),
      } as any,
      undefined,
      {} as any,
      providerExecutionPort as any,
    );

    await expect(
      dispatcher("sessions.summaryTitles", {
        messages: [
          { role: "user", content: "How do I port the agent loop to the daemon?" },
          { role: "assistant", content: "Use a headless driver." },
        ],
        providerId: "provider-1",
        modelId: "model-1",
      }),
    ).resolves.toEqual({ title: "Generated Title" });

    expect(providerExecutionPort.generateCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "provider-1",
        modelId: "model-1",
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "system" }),
          expect.objectContaining({ role: "user", content: "How do I port the agent loop to the daemon?" }),
        ]),
      }),
    );
  });
});
