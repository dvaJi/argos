import { beforeEach, describe, expect, it, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { ConversationSearchServer } from "@argos/mcp-runtime";

const serverInstances = vi.hoisted(() => [] as Array<{ handlers: Map<unknown, Function> }>);

const mockSearchConversations = vi.hoisted(() => vi.fn<(...args: any[]) => any>());
const mockSearchMessages = vi.hoisted(() => vi.fn<(...args: any[]) => any>());
const mockGetConversationHistory = vi.hoisted(() => vi.fn<(...args: any[]) => any>());
const mockGetConversationStats = vi.hoisted(() => vi.fn<(...args: any[]) => any>());

vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: vi.fn<(...args: any[]) => any>(),
}));

describe("ConversationSearchServer", () => {
  beforeEach(() => {
    serverInstances.length = 0;
    (
      Server as unknown as {
        mockImplementation: (factory: () => unknown) => void;
      }
    ).mockImplementation(function () {
      const instance = {
        handlers: new Map<unknown, Function>(),
        connect: vi.fn<(...args: any[]) => any>(),
        setRequestHandler: vi.fn<(...args: any[]) => any>((schema: unknown, handler: Function) => {
          instance.handlers.set(schema, handler);
        }),
      };
      serverInstances.push(instance);
      return instance;
    });

    mockSearchConversations.mockReset();
    mockSearchMessages.mockReset();
    mockGetConversationHistory.mockReset();
    mockGetConversationStats.mockReset();
  });

  it("lists tools and searches conversations through injected ports", async () => {
    new ConversationSearchServer({
      searchConversations: mockSearchConversations,
      searchMessages: mockSearchMessages,
      getConversationHistory: mockGetConversationHistory,
      getConversationStats: mockGetConversationStats,
    });

    mockSearchConversations.mockResolvedValue({
      conversations: [
        {
          id: "session-1",
          title: "Release planning",
          createdAt: 100,
          updatedAt: 200,
          messageCount: 4,
          snippet: "Need daemon parity",
        },
      ],
      total: 1,
    });
    mockSearchMessages.mockResolvedValue({
      messages: [
        {
          id: "message-1",
          conversationId: "session-1",
          conversationTitle: "Release planning",
          role: "user",
          content: "daemon compatibility",
          createdAt: 123,
          snippet: "daemon compatibility",
        },
      ],
      total: 1,
    });
    mockGetConversationHistory.mockResolvedValue({
      conversation: {
        id: "session-1",
        title: "Release planning",
        createdAt: 100,
        updatedAt: 200,
        agentId: "agent-1",
        providerId: "provider-1",
        modelId: "model-1",
      },
      messages: [{ id: "m2", role: "user", content: "hello daemon", createdAt: 2, tokenCount: null, status: "done" }],
    });
    mockGetConversationStats.mockResolvedValue({
      period: "7 days",
      total: { conversations: 2, messages: 3 },
      recent: { conversations: 1, messages: 2 },
      messagesByRole: { user: 2, assistant: 1 },
      activeConversations: [],
    });

    const listHandler = serverInstances[0].handlers.get(ListToolsRequestSchema);
    const toolsResult = await listHandler?.();
    expect(toolsResult.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "search_conversations",
      "search_messages",
      "get_conversation_history",
      "get_conversation_stats",
    ]);

    const callHandler = serverInstances[0].handlers.get(CallToolRequestSchema);
    const searchResult = await callHandler?.({
      params: {
        name: "search_conversations",
        arguments: { query: "daemon" },
      },
    });
    expect(searchResult.content[0].text).toContain("Release planning");
    expect(mockSearchConversations).toHaveBeenCalledWith("daemon", 10, 0);

    const messagesResult = await callHandler?.({
      params: {
        name: "search_messages",
        arguments: { query: "daemon" },
      },
    });
    expect(messagesResult.content[0].text).toContain("daemon compatibility");

    const historyResult = await callHandler?.({
      params: {
        name: "get_conversation_history",
        arguments: { conversationId: "session-1" },
      },
    });
    expect(historyResult.content[0].text).toContain('"role": "user"');

    const statsResult = await callHandler?.({
      params: {
        name: "get_conversation_stats",
        arguments: { days: 7 },
      },
    });
    expect(statsResult.content[0].text).toContain('"period": "7 days"');
    expect(statsResult.content[0].text).toContain('"conversations": 2');
  });
});
