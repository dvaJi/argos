import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import zod from "zod";

const SearchConversationsArgsSchema = zod.object({
  query: zod.string().describe("Search keyword to search in conversation titles and message contents"),
  limit: zod.number().optional().default(10).describe("Result limit (1-50, default 10)"),
  offset: zod.number().optional().default(0).describe("Pagination offset (default 0)"),
});

const SearchMessagesArgsSchema = zod.object({
  query: zod.string().describe("Search keyword to search in message contents"),
  conversationId: zod
    .string()
    .optional()
    .describe("Optional conversation ID to limit search within specific conversation"),
  role: zod.enum(["user", "assistant", "system", "function"]).optional().describe("Optional message role filter"),
  limit: zod.number().optional().default(20).describe("Result limit (1-100, default 20)"),
  offset: zod.number().optional().default(0).describe("Pagination offset (default 0)"),
});

const GetConversationHistoryArgsSchema = zod.object({
  conversationId: zod.string().describe("Conversation ID"),
  includeSystem: zod.boolean().optional().default(false).describe("Whether to include system messages"),
});

const GetConversationStatsArgsSchema = zod.object({
  days: zod.number().optional().default(30).describe("Statistics period in days (default 30 days)"),
});

export interface ConversationSearchServerPorts {
  searchConversations(query: string, limit?: number, offset?: number): Promise<unknown>;
  searchMessages(
    query: string,
    conversationId?: string,
    role?: string,
    limit?: number,
    offset?: number,
  ): Promise<unknown>;
  getConversationHistory(conversationId: string, includeSystem?: boolean): Promise<unknown>;
  getConversationStats(days?: number): Promise<unknown>;
}

export class ConversationSearchServer {
  private server: Server;

  constructor(private readonly ports: ConversationSearchServerPorts) {
    this.server = new Server(
      {
        name: "conversation-search-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupRequestHandlers();
  }

  public startServer(transport: Transport): void {
    this.server.connect(transport);
  }

  private setupRequestHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "search_conversations",
            description: "Search historical conversation records, supports title and content search",
            inputSchema: zod.toJSONSchema(SearchConversationsArgsSchema, { unrepresentable: "any" }),
            annotations: {
              title: "Search Conversations",
              readOnlyHint: true,
            },
          },
          {
            name: "search_messages",
            description:
              "Search historical message records, supports filtering by conversation ID, role and other conditions",
            inputSchema: zod.toJSONSchema(SearchMessagesArgsSchema, { unrepresentable: "any" }),
            annotations: {
              title: "Search Messages",
              readOnlyHint: true,
            },
          },
          {
            name: "get_conversation_history",
            description: "Get complete history of a specific conversation",
            inputSchema: zod.toJSONSchema(GetConversationHistoryArgsSchema, { unrepresentable: "any" }),
            annotations: {
              title: "Get Conversation History",
              readOnlyHint: true,
            },
          },
          {
            name: "get_conversation_stats",
            description: "Get conversation statistics including totals, recent activity and more",
            inputSchema: zod.toJSONSchema(GetConversationStatsArgsSchema, { unrepresentable: "any" }),
            annotations: {
              title: "Get Conversation Stats",
              readOnlyHint: true,
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "search_conversations": {
            const { query, limit, offset } = SearchConversationsArgsSchema.parse(args);
            const result = await this.ports.searchConversations(query, limit, offset);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }
          case "search_messages": {
            const { query, conversationId, role, limit, offset } = SearchMessagesArgsSchema.parse(args);
            const result = await this.ports.searchMessages(query, conversationId, role, limit, offset);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }
          case "get_conversation_history": {
            const { conversationId, includeSystem } = GetConversationHistoryArgsSchema.parse(args);
            const result = await this.ports.getConversationHistory(conversationId, includeSystem);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }
          case "get_conversation_stats": {
            const { days } = GetConversationStatsArgsSchema.parse(args);
            const result = await this.ports.getConversationStats(days);
            return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
          }
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`Error executing tool ${name}:`, error);
        throw error;
      }
    });
  }
}
