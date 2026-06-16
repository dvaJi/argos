import { describe, it, expect, vi, beforeEach } from "vitest";
import { ArgosMessageStore } from "@/presenter/agentRuntimePresenter/messageStore";
import { cloneBlocksForRenderer } from "@/presenter/agentRuntimePresenter/echo";
import logger from "@shared/logger";

vi.mock("nanoid", () => ({ nanoid: vi.fn<(...args: any[]) => any>(() => "mock-msg-id") }));
vi.mock("@shared/logger", () => ({
  default: {
    error: vi.fn<(...args: any[]) => any>(),
  },
}));

function createMockSqlitePresenter() {
  return {
    newSessionsTable: {
      get: vi.fn<(...args: any[]) => any>().mockReturnValue({ title: "Session Title" }),
    },
    argosMessagesTable: {
      insert: vi.fn<(...args: any[]) => any>(),
      updateContent: vi.fn<(...args: any[]) => any>(),
      updateStatus: vi.fn<(...args: any[]) => any>(),
      updateContentAndStatus: vi.fn<(...args: any[]) => any>(),
      getBySession: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
      getByStatus: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
      getIdsBySession: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
      getIdsFromOrderSeq: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
      get: vi.fn<(...args: any[]) => any>(),
      getMaxOrderSeq: vi.fn<(...args: any[]) => any>().mockReturnValue(0),
      deleteBySession: vi.fn<(...args: any[]) => any>(),
      delete: vi.fn<(...args: any[]) => any>(),
      deleteFromOrderSeq: vi.fn<(...args: any[]) => any>(),
      recoverPendingMessages: vi.fn<(...args: any[]) => any>().mockReturnValue(0),
    },
    argosSessionsTable: {
      get: vi.fn<(...args: any[]) => any>(),
    },
    argosUserMessagesTable: {
      upsert: vi.fn<(...args: any[]) => any>(),
      get: vi.fn<(...args: any[]) => any>(),
      listByMessageIds: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
      delete: vi.fn<(...args: any[]) => any>(),
      deleteByMessageIds: vi.fn<(...args: any[]) => any>(),
      deleteBySession: vi.fn<(...args: any[]) => any>(),
    },
    argosUserMessageFilesTable: {
      replaceForMessage: vi.fn<(...args: any[]) => any>(),
      listByMessageIds: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
      delete: vi.fn<(...args: any[]) => any>(),
      deleteByMessageIds: vi.fn<(...args: any[]) => any>(),
      deleteBySession: vi.fn<(...args: any[]) => any>(),
    },
    argosUserMessageLinksTable: {
      replaceForMessage: vi.fn<(...args: any[]) => any>(),
      listByMessageIds: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
      delete: vi.fn<(...args: any[]) => any>(),
      deleteByMessageIds: vi.fn<(...args: any[]) => any>(),
      deleteBySession: vi.fn<(...args: any[]) => any>(),
    },
    argosAssistantBlocksTable: {
      replaceForMessage: vi.fn<(...args: any[]) => any>(),
      listByMessageId: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
      listByMessageIds: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
      delete: vi.fn<(...args: any[]) => any>(),
      deleteByMessageIds: vi.fn<(...args: any[]) => any>(),
      deleteBySession: vi.fn<(...args: any[]) => any>(),
    },
    argosSearchDocumentsTable: {
      upsert: vi.fn<(...args: any[]) => any>(),
      delete: vi.fn<(...args: any[]) => any>(),
      deleteByMessageIds: vi.fn<(...args: any[]) => any>(),
      deleteBySession: vi.fn<(...args: any[]) => any>(),
    },
    argosMessageTracesTable: {
      insert: vi.fn<(...args: any[]) => any>().mockReturnValue(1),
      listByMessageId: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
      countByMessageId: vi.fn<(...args: any[]) => any>().mockReturnValue(0),
      deleteByMessageIds: vi.fn<(...args: any[]) => any>(),
      deleteBySessionId: vi.fn<(...args: any[]) => any>(),
    },
    argosMessageSearchResultsTable: {
      add: vi.fn<(...args: any[]) => any>(),
      listByMessageId: vi.fn<(...args: any[]) => any>().mockReturnValue([]),
      deleteByMessageIds: vi.fn<(...args: any[]) => any>(),
      deleteBySessionId: vi.fn<(...args: any[]) => any>(),
    },
    argosUsageStatsTable: {
      upsert: vi.fn<(...args: any[]) => any>(),
    },
  } as any;
}

function createAssistantBlockRow(overrides: Record<string, unknown> = {}) {
  return {
    message_id: "m1",
    block_index: 0,
    block_type: "content",
    status: "success",
    text_content: null,
    tool_call_id: null,
    tool_name: null,
    tool_params: null,
    tool_response: null,
    action_type: null,
    image_mime_type: null,
    reasoning_start_at: null,
    reasoning_end_at: null,
    extra_json: "{}",
    updated_at: 1000,
    ...overrides,
  };
}

function createMessageRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "m1",
    session_id: "s1",
    order_seq: 1,
    role: "user",
    content: '{"text":"hello"}',
    status: "sent",
    is_context_edge: 0,
    metadata: "{}",
    trace_count: 0,
    created_at: 1000,
    updated_at: 1000,
    ...overrides,
  };
}

describe("ArgosMessageStore", () => {
  let sqlitePresenter: ReturnType<typeof createMockSqlitePresenter>;
  let store: ArgosMessageStore;

  beforeEach(() => {
    sqlitePresenter = createMockSqlitePresenter();
    store = new ArgosMessageStore(sqlitePresenter);
  });

  describe("createUserMessage", () => {
    it("inserts a user message with JSON content", () => {
      const content = { text: "hello", files: [], links: [], search: false, think: false };
      const id = store.createUserMessage("s1", 1, content);

      expect(id).toBe("mock-msg-id");
      expect(sqlitePresenter.argosMessagesTable.insert).toHaveBeenCalledWith({
        id: "mock-msg-id",
        sessionId: "s1",
        orderSeq: 1,
        role: "user",
        content: JSON.stringify(content),
        status: "sent",
      });
      expect(sqlitePresenter.argosUserMessagesTable.upsert).toHaveBeenCalledWith({
        messageId: "mock-msg-id",
        text: "hello",
        searchEnabled: false,
        thinkEnabled: false,
      });
      expect(sqlitePresenter.argosUserMessageFilesTable.replaceForMessage).toHaveBeenCalledWith("mock-msg-id", []);
      expect(sqlitePresenter.argosUserMessageLinksTable.replaceForMessage).toHaveBeenCalledWith("mock-msg-id", []);
    });
  });

  describe("createAssistantMessage", () => {
    it("inserts a pending assistant message with empty blocks", () => {
      const id = store.createAssistantMessage("s1", 2);

      expect(id).toBe("mock-msg-id");
      expect(sqlitePresenter.argosMessagesTable.insert).toHaveBeenCalledWith({
        id: "mock-msg-id",
        sessionId: "s1",
        orderSeq: 2,
        role: "assistant",
        content: "[]",
        status: "pending",
      });
    });
  });

  describe("updateAssistantContent", () => {
    it("updates structured assistant blocks and keeps the header pending", () => {
      const blocks = [{ type: "content" as const, content: "hi", status: "pending" as const, timestamp: 1000 }];
      store.updateAssistantContent("m1", blocks);

      expect(sqlitePresenter.argosAssistantBlocksTable.replaceForMessage).toHaveBeenCalledWith("m1", blocks);
      expect(sqlitePresenter.argosMessagesTable.updateStatus).toHaveBeenCalledWith("m1", "pending");
      expect(sqlitePresenter.argosMessagesTable.updateContent).not.toHaveBeenCalled();
    });
  });

  describe("finalizeAssistantMessage", () => {
    it("updates content, status to sent, and metadata", () => {
      const blocks = [{ type: "content" as const, content: "done", status: "success" as const, timestamp: 1000 }];
      const metadata = '{"totalTokens":100}';
      store.finalizeAssistantMessage("m1", blocks, metadata);

      expect(sqlitePresenter.argosAssistantBlocksTable.replaceForMessage).toHaveBeenCalledWith("m1", blocks);
      expect(sqlitePresenter.argosMessagesTable.updateContentAndStatus).toHaveBeenCalledWith(
        "m1",
        JSON.stringify(blocks),
        "sent",
        metadata,
      );
    });

    it("persists usage stats for assistant messages with usage metadata", () => {
      sqlitePresenter.argosMessagesTable.get.mockReturnValue({
        id: "m1",
        session_id: "s1",
        role: "assistant",
        created_at: 1000,
        updated_at: 2000,
      });
      sqlitePresenter.argosSessionsTable.get.mockReturnValue({
        provider_id: "openai",
        model_id: "gpt-4o",
      });

      store.finalizeAssistantMessage(
        "m1",
        [],
        JSON.stringify({
          inputTokens: 120,
          outputTokens: 30,
          totalTokens: 150,
          cachedInputTokens: 20,
          cacheWriteInputTokens: 12,
        }),
      );

      expect(sqlitePresenter.argosUsageStatsTable.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          messageId: "m1",
          sessionId: "s1",
          providerId: "openai",
          modelId: "gpt-4o",
          inputTokens: 120,
          outputTokens: 30,
          totalTokens: 150,
          cachedInputTokens: 20,
          cacheWriteInputTokens: 12,
          source: "live",
        }),
      );
    });

    it("swallows usage stats persistence failures and logs them", () => {
      sqlitePresenter.argosMessagesTable.get.mockReturnValue({
        id: "m1",
        session_id: "s1",
        role: "assistant",
        created_at: 1000,
        updated_at: 2000,
      });
      sqlitePresenter.argosSessionsTable.get.mockReturnValue({
        provider_id: "openai",
        model_id: "gpt-4o",
      });
      sqlitePresenter.argosUsageStatsTable.upsert.mockImplementation(() => {
        throw new Error("boom");
      });

      expect(() =>
        store.finalizeAssistantMessage(
          "m1",
          [],
          JSON.stringify({
            inputTokens: 120,
            outputTokens: 30,
            totalTokens: 150,
            cachedInputTokens: 20,
            cacheWriteInputTokens: 12,
          }),
        ),
      ).not.toThrow("expected error");
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to persist argos usage stats",
        { messageId: "m1", source: "live" },
        expect.any(Error),
      );
    });
  });

  describe("setMessageError", () => {
    it("updates content and status to error", () => {
      const blocks = [{ type: "error" as const, content: "failed", status: "error" as const, timestamp: 1000 }];
      store.setMessageError("m1", blocks);

      expect(sqlitePresenter.argosAssistantBlocksTable.replaceForMessage).toHaveBeenCalledWith("m1", blocks);
      expect(sqlitePresenter.argosMessagesTable.updateContentAndStatus).toHaveBeenCalledWith(
        "m1",
        JSON.stringify(blocks),
        "error",
      );
    });

    it("persists metadata when provided", () => {
      const blocks = [{ type: "error" as const, content: "failed", status: "error" as const, timestamp: 1000 }];
      const metadata = '{"provider":"openai","model":"gpt-4"}';
      store.setMessageError("m1", blocks, metadata);

      expect(sqlitePresenter.argosAssistantBlocksTable.replaceForMessage).toHaveBeenCalledWith("m1", blocks);
      expect(sqlitePresenter.argosMessagesTable.updateContentAndStatus).toHaveBeenCalledWith(
        "m1",
        JSON.stringify(blocks),
        "error",
        metadata,
      );
    });
  });

  describe("getMessages", () => {
    it("maps DB rows to ChatMessageRecord", () => {
      sqlitePresenter.argosMessagesTable.getBySession.mockReturnValue([
        {
          id: "m1",
          session_id: "s1",
          order_seq: 1,
          role: "user",
          content: '{"text":"hi"}',
          status: "sent",
          is_context_edge: 0,
          metadata: "{}",
          trace_count: 2,
          created_at: 1000,
          updated_at: 1000,
        },
      ]);

      const messages = store.getMessages("s1");
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        id: "m1",
        sessionId: "s1",
        orderSeq: 1,
        role: "user",
        content: '{"text":"hi"}',
        status: "sent",
        isContextEdge: 0,
        metadata: "{}",
        traceCount: 2,
        createdAt: 1000,
        updatedAt: 1000,
      });
    });
  });

  describe("getMessageIds", () => {
    it("delegates to table", () => {
      sqlitePresenter.argosMessagesTable.getIdsBySession.mockReturnValue(["m1", "m2"]);
      expect(store.getMessageIds("s1")).toEqual(["m1", "m2"]);
    });
  });

  describe("getMessage", () => {
    it("returns mapped record when found", () => {
      sqlitePresenter.argosMessagesTable.get.mockReturnValue({
        id: "m1",
        session_id: "s1",
        order_seq: 1,
        role: "user",
        content: "{}",
        status: "sent",
        is_context_edge: 0,
        metadata: "{}",
        created_at: 1000,
        updated_at: 1000,
      });

      const msg = store.getMessage("m1");
      expect(msg).not.toBeNull();
      expect(msg!.sessionId).toBe("s1");
    });

    it("returns null when not found", () => {
      sqlitePresenter.argosMessagesTable.get.mockReturnValue(undefined);
      expect(store.getMessage("missing")).toBeNull();
    });

    it("omits nullable action_type values when materializing assistant blocks", () => {
      sqlitePresenter.argosMessagesTable.get.mockReturnValue({
        id: "m1",
        session_id: "s1",
        order_seq: 1,
        role: "assistant",
        content: "[]",
        status: "sent",
        is_context_edge: 0,
        metadata: "{}",
        created_at: 1000,
        updated_at: 1000,
      });
      sqlitePresenter.argosAssistantBlocksTable.listByMessageIds.mockReturnValue([
        createAssistantBlockRow({
          block_index: 0,
          block_type: "content",
          text_content: "hello",
          action_type: null,
        }),
        createAssistantBlockRow({
          block_index: 1,
          block_type: "tool_call",
          tool_call_id: "tc1",
          tool_name: "read_file",
          tool_params: "{}",
          tool_response: "ok",
          action_type: null,
        }),
      ]);

      const msg = store.getMessage("m1");
      const blocks = JSON.parse(msg!.content);

      expect(blocks[0]).not.toHaveProperty("action_type");
      expect(blocks[1]).not.toHaveProperty("action_type");
      expect(() => cloneBlocksForRenderer(blocks)).not.toThrow("expected error");
    });

    it("keeps only valid persisted action_type values on assistant blocks", () => {
      sqlitePresenter.argosMessagesTable.get.mockReturnValue({
        id: "m1",
        session_id: "s1",
        order_seq: 1,
        role: "assistant",
        content: "[]",
        status: "sent",
        is_context_edge: 0,
        metadata: "{}",
        created_at: 1000,
        updated_at: 1000,
      });
      sqlitePresenter.argosAssistantBlocksTable.listByMessageIds.mockReturnValue([
        createAssistantBlockRow({
          block_index: 0,
          block_type: "content",
          text_content: "before action",
          action_type: "legacy_bad_value",
        }),
        createAssistantBlockRow({
          block_index: 1,
          block_type: "action",
          status: "pending",
          text_content: "Need permission",
          tool_call_id: "tc1",
          tool_name: "write_file",
          action_type: "tool_call_permission",
        }),
      ]);

      const msg = store.getMessage("m1");
      const blocks = JSON.parse(msg!.content);

      expect(blocks[0]).not.toHaveProperty("action_type");
      expect(blocks[1].action_type).toBe("tool_call_permission");
      expect(() => cloneBlocksForRenderer(blocks)).not.toThrow("expected error");
    });
  });

  describe("getNextOrderSeq", () => {
    it("returns max + 1", () => {
      sqlitePresenter.argosMessagesTable.getMaxOrderSeq.mockReturnValue(5);
      expect(store.getNextOrderSeq("s1")).toBe(6);
    });

    it("returns 1 when no messages exist", () => {
      sqlitePresenter.argosMessagesTable.getMaxOrderSeq.mockReturnValue(0);
      expect(store.getNextOrderSeq("s1")).toBe(1);
    });
  });

  describe("deleteBySession", () => {
    it("delegates to table", () => {
      store.deleteBySession("s1");
      expect(sqlitePresenter.argosSearchDocumentsTable.deleteBySession).toHaveBeenCalledWith("s1");
      expect(sqlitePresenter.argosAssistantBlocksTable.deleteBySession).toHaveBeenCalledWith("s1");
      expect(sqlitePresenter.argosUserMessageLinksTable.deleteBySession).toHaveBeenCalledWith("s1");
      expect(sqlitePresenter.argosUserMessageFilesTable.deleteBySession).toHaveBeenCalledWith("s1");
      expect(sqlitePresenter.argosUserMessagesTable.deleteBySession).toHaveBeenCalledWith("s1");
      expect(sqlitePresenter.argosMessageTracesTable.deleteBySessionId).toHaveBeenCalledWith("s1");
      expect(sqlitePresenter.argosMessageSearchResultsTable.deleteBySessionId).toHaveBeenCalledWith("s1");
      expect(sqlitePresenter.argosMessagesTable.deleteBySession).toHaveBeenCalledWith("s1");
    });
  });

  describe("deleteMessage", () => {
    it("deletes traces and search results before removing the message", () => {
      store.deleteMessage("m1");

      expect(sqlitePresenter.argosSearchDocumentsTable.delete).toHaveBeenCalledWith("message:m1");
      expect(sqlitePresenter.argosAssistantBlocksTable.delete).toHaveBeenCalledWith("m1");
      expect(sqlitePresenter.argosUserMessageLinksTable.delete).toHaveBeenCalledWith("m1");
      expect(sqlitePresenter.argosUserMessageFilesTable.delete).toHaveBeenCalledWith("m1");
      expect(sqlitePresenter.argosUserMessagesTable.delete).toHaveBeenCalledWith("m1");
      expect(sqlitePresenter.argosMessageTracesTable.deleteByMessageIds).toHaveBeenCalledWith(["m1"]);
      expect(sqlitePresenter.argosMessageSearchResultsTable.deleteByMessageIds).toHaveBeenCalledWith(["m1"]);
      expect(sqlitePresenter.argosMessagesTable.delete).toHaveBeenCalledWith("m1");
    });

    it("does not delete rows when tape retraction append fails inside transaction", () => {
      const transaction = vi.fn<(...args: any[]) => any>((operation: () => unknown) => () => operation());
      sqlitePresenter.getDatabase = vi.fn<(...args: any[]) => any>().mockReturnValue({ transaction });
      sqlitePresenter.argosTapeEntriesTable = {
        ensureBootstrapAnchor: vi.fn<(...args: any[]) => any>(),
        appendEvent: vi.fn<(...args: any[]) => any>(() => {
          throw new Error("append failed");
        }),
      };
      sqlitePresenter.argosMessagesTable.get.mockReturnValue(createMessageRow());

      expect(() => store.deleteMessage("m1")).toThrow("append failed");

      expect(transaction).toHaveBeenCalled();
      expect(sqlitePresenter.argosMessagesTable.delete).not.toHaveBeenCalled();
      expect(sqlitePresenter.argosSearchDocumentsTable.delete).not.toHaveBeenCalled();
    });
  });

  describe("updateCompactionMessage", () => {
    it("records compaction status updates in tape with revision provenance", () => {
      const appendEvent = vi.fn<(...args: any[]) => any>();
      const transaction = vi.fn<(...args: any[]) => any>((operation: () => unknown) => () => operation());
      sqlitePresenter.getDatabase = vi.fn<(...args: any[]) => any>().mockReturnValue({ transaction });
      sqlitePresenter.argosTapeEntriesTable = {
        ensureBootstrapAnchor: vi.fn<(...args: any[]) => any>(),
        appendEvent,
      };
      sqlitePresenter.argosMessagesTable.get.mockReturnValue(
        createMessageRow({
          id: "compaction-message",
          role: "assistant",
          content: "[]",
          metadata: JSON.stringify({
            messageType: "compaction",
            compactionStatus: "compacted",
            summaryUpdatedAt: 2000,
          }),
          updated_at: 3000,
        }),
      );

      store.updateCompactionMessage("compaction-message", "compacted", 2000);

      expect(transaction).toHaveBeenCalled();
      expect(appendEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "message/compaction_indicator",
          provenanceKey: "message:compaction-message:compaction_indicator:compacted:3000",
          data: expect.objectContaining({
            status: "compacted",
          }),
        }),
      );
    });
  });

  describe("deleteFromOrderSeq", () => {
    it("deletes traces for affected messages before deleting messages", () => {
      sqlitePresenter.argosMessagesTable.getBySession.mockReturnValue([
        createMessageRow({ id: "m1", order_seq: 1 }),
        createMessageRow({ id: "m2", order_seq: 2 }),
        createMessageRow({ id: "m3", order_seq: 3 }),
      ]);

      store.deleteFromOrderSeq("s1", 2);

      expect(sqlitePresenter.argosSearchDocumentsTable.deleteByMessageIds).toHaveBeenCalledWith(["m2", "m3"]);
      expect(sqlitePresenter.argosAssistantBlocksTable.deleteByMessageIds).toHaveBeenCalledWith(["m2", "m3"]);
      expect(sqlitePresenter.argosUserMessageLinksTable.deleteByMessageIds).toHaveBeenCalledWith(["m2", "m3"]);
      expect(sqlitePresenter.argosUserMessageFilesTable.deleteByMessageIds).toHaveBeenCalledWith(["m2", "m3"]);
      expect(sqlitePresenter.argosUserMessagesTable.deleteByMessageIds).toHaveBeenCalledWith(["m2", "m3"]);
      expect(sqlitePresenter.argosMessageTracesTable.deleteByMessageIds).toHaveBeenCalledWith(["m2", "m3"]);
      expect(sqlitePresenter.argosMessagesTable.deleteFromOrderSeq).toHaveBeenCalledWith("s1", 2);
    });

    it("skips trace deletion when no affected messages", () => {
      sqlitePresenter.argosMessagesTable.getBySession.mockReturnValue([createMessageRow({ id: "m1", order_seq: 1 })]);

      store.deleteFromOrderSeq("s1", 2);

      expect(sqlitePresenter.argosSearchDocumentsTable.deleteByMessageIds).not.toHaveBeenCalled();
      expect(sqlitePresenter.argosAssistantBlocksTable.deleteByMessageIds).not.toHaveBeenCalled();
      expect(sqlitePresenter.argosUserMessageLinksTable.deleteByMessageIds).not.toHaveBeenCalled();
      expect(sqlitePresenter.argosUserMessageFilesTable.deleteByMessageIds).not.toHaveBeenCalled();
      expect(sqlitePresenter.argosUserMessagesTable.deleteByMessageIds).not.toHaveBeenCalled();
      expect(sqlitePresenter.argosMessageTracesTable.deleteByMessageIds).not.toHaveBeenCalled();
      expect(sqlitePresenter.argosMessagesTable.deleteFromOrderSeq).toHaveBeenCalledWith("s1", 2);
    });
  });

  describe("trace operations", () => {
    it("inserts trace and returns request sequence", () => {
      const seq = store.insertMessageTrace({
        id: "t1",
        messageId: "m1",
        sessionId: "s1",
        providerId: "openai",
        modelId: "gpt-4o",
        endpoint: "https://api.openai.com/v1/responses",
        headersJson: '{"authorization":"Bearer ****1234"}',
        bodyJson: '{"model":"gpt-4o"}',
        truncated: false,
      });

      expect(seq).toBe(1);
      expect(sqlitePresenter.argosMessageTracesTable.insert).toHaveBeenCalledWith({
        id: "t1",
        messageId: "m1",
        sessionId: "s1",
        providerId: "openai",
        modelId: "gpt-4o",
        endpoint: "https://api.openai.com/v1/responses",
        headersJson: '{"authorization":"Bearer ****1234"}',
        bodyJson: '{"model":"gpt-4o"}',
        truncated: false,
      });
    });

    it("lists traces mapped to MessageTraceRecord", () => {
      sqlitePresenter.argosMessageTracesTable.listByMessageId.mockReturnValue([
        {
          id: "t2",
          message_id: "m1",
          session_id: "s1",
          provider_id: "openai",
          model_id: "gpt-4o",
          request_seq: 2,
          endpoint: "https://api.openai.com/v1/responses",
          headers_json: '{"authorization":"Bearer ****1234"}',
          body_json: '{"stream":true}',
          truncated: 1,
          created_at: 1234,
        },
      ]);

      const traces = store.listMessageTraces("m1");
      expect(traces).toEqual([
        {
          id: "t2",
          messageId: "m1",
          sessionId: "s1",
          providerId: "openai",
          modelId: "gpt-4o",
          requestSeq: 2,
          endpoint: "https://api.openai.com/v1/responses",
          headersJson: '{"authorization":"Bearer ****1234"}',
          bodyJson: '{"stream":true}',
          truncated: true,
          createdAt: 1234,
        },
      ]);
    });

    it("returns trace count by message id", () => {
      sqlitePresenter.argosMessageTracesTable.countByMessageId.mockReturnValue(3);
      expect(store.getMessageTraceCount("m1")).toBe(3);
      expect(sqlitePresenter.argosMessageTracesTable.countByMessageId).toHaveBeenCalledWith("m1");
    });
  });

  describe("recoverPendingMessages", () => {
    it("marks non-interaction pending messages as error with terminal content", () => {
      sqlitePresenter.argosMessagesTable.getByStatus.mockReturnValue([
        {
          id: "m1",
          role: "assistant",
          content: JSON.stringify([
            {
              type: "action",
              action_type: "question_request",
              status: "pending",
              timestamp: 1,
              tool_call: { id: "tc1" },
              extra: { needsUserAction: true },
            },
          ]),
        },
        {
          id: "m2",
          role: "assistant",
          content: JSON.stringify([
            {
              type: "content",
              status: "pending",
              timestamp: 1,
              content: "streaming",
            },
          ]),
        },
      ]);

      expect(store.recoverPendingMessages()).toBe(1);
      expect(sqlitePresenter.argosAssistantBlocksTable.replaceForMessage).toHaveBeenCalledWith("m2", expect.any(Array));
      const [messageId, contentJson, status] = sqlitePresenter.argosMessagesTable.updateContentAndStatus.mock.calls[0];
      expect(messageId).toBe("m2");
      expect(status).toBe("error");
      expect(JSON.parse(contentJson)).toEqual([
        {
          type: "content",
          status: "error",
          timestamp: 1,
          content: "streaming",
        },
        {
          type: "error",
          content: "common.error.sessionInterrupted",
          status: "error",
          timestamp: expect.any(Number),
        },
      ]);
    });

    it("adds an explicit error block when pending assistant content is empty", () => {
      sqlitePresenter.argosMessagesTable.getByStatus.mockReturnValue([
        {
          id: "m3",
          role: "assistant",
          content: "[]",
        },
      ]);

      expect(store.recoverPendingMessages()).toBe(1);
      expect(sqlitePresenter.argosAssistantBlocksTable.replaceForMessage).toHaveBeenCalledWith("m3", expect.any(Array));
      const [messageId, contentJson, status] = sqlitePresenter.argosMessagesTable.updateContentAndStatus.mock.calls[0];
      expect(messageId).toBe("m3");
      expect(status).toBe("error");
      expect(JSON.parse(contentJson)).toEqual([
        {
          type: "error",
          content: "common.error.sessionInterrupted",
          status: "error",
          timestamp: expect.any(Number),
        },
      ]);
    });
  });
});
