import { AppleServer } from "./appleServer";
import { BuiltinKnowledgeServer } from "@argos/backend-core";
import {
  ArtifactsServer,
  AutoPromptingServer,
  BochaSearchServer,
  BraveSearchServer,
  ConversationSearchServer,
  DeepResearchServer,
  DifyKnowledgeServer,
  FastGptKnowledgeServer,
  RagflowKnowledgeServer,
} from "@argos/mcp-runtime";
import { presenter } from "@/presenter";
import type { ConversationSearchServerPorts } from "@argos/mcp-runtime";

const getDesktopDb = () => (presenter.sqlitePresenter as unknown as { db: { prepare(sql: string): any } }).db;

const createConversationSearchPorts = (): ConversationSearchServerPorts => ({
  searchConversations: async (query, limit = 10, offset = 0) => {
    const searchQuery = `%${query}%`;
    const rows = getDesktopDb()
      .prepare(
        `
        SELECT
          s.id as id,
          s.title as title,
          s.created_at as createdAt,
          s.updated_at as updatedAt,
          COALESCE(msg_stats.messageCount, 0) as messageCount,
          CASE
            WHEN s.title LIKE ? THEN NULL
            ELSE (
              SELECT dm.content
              FROM argos_messages dm
              WHERE dm.session_id = s.id AND dm.content LIKE ?
              ORDER BY dm.created_at DESC
              LIMIT 1
            )
          END as matchedContent
        FROM new_sessions s
        LEFT JOIN (
          SELECT session_id, COUNT(*) as messageCount
          FROM argos_messages
          GROUP BY session_id
        ) msg_stats ON msg_stats.session_id = s.id
        WHERE s.title LIKE ?
          OR EXISTS (
            SELECT 1
            FROM argos_messages dm2
            WHERE dm2.session_id = s.id AND dm2.content LIKE ?
          )
        ORDER BY s.updated_at DESC
        LIMIT ? OFFSET ?
      `,
      )
      .all(searchQuery, searchQuery, searchQuery, searchQuery, limit, offset) as Array<{
      id: string;
      title: string;
      createdAt: number;
      updatedAt: number;
      messageCount: number;
      matchedContent?: string | null;
    }>;
    return {
      conversations: rows.map((row) => ({
        id: String(row.id),
        title: String(row.title),
        createdAt: Number(row.createdAt ?? 0),
        updatedAt: Number(row.updatedAt ?? 0),
        messageCount: Number(row.messageCount ?? 0),
        snippet: row.matchedContent ? String(row.matchedContent) : `Title match: ${String(row.title)}`,
      })),
      total: rows.length,
    };
  },
  searchMessages: async (query, conversationId, role, limit = 20, offset = 0) => {
    const normalizedRole = role?.trim();
    if (normalizedRole && normalizedRole !== "user" && normalizedRole !== "assistant") {
      return { messages: [], total: 0 };
    }
    const searchQuery = `%${query}%`;
    let sql = `
      SELECT
        m.id as id,
        m.session_id as conversationId,
        s.title as conversationTitle,
        m.role,
        m.content,
        m.created_at as createdAt
      FROM argos_messages m
      INNER JOIN new_sessions s ON m.session_id = s.id
      WHERE m.content LIKE ?
    `;
    const params: unknown[] = [searchQuery];
    if (conversationId) {
      sql += " AND m.session_id = ?";
      params.push(conversationId);
    }
    if (normalizedRole) {
      sql += " AND m.role = ?";
      params.push(normalizedRole);
    }
    sql += " ORDER BY m.created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);
    const messages = getDesktopDb()
      .prepare(sql)
      .all(...params) as Array<{
      id: string;
      conversationId: string;
      conversationTitle: string;
      role: string;
      content: string;
      createdAt: number;
    }>;
    const countSql = `
      SELECT COUNT(*) as total
      FROM argos_messages m
      WHERE m.content LIKE ?
      ${conversationId ? "AND m.session_id = ?" : ""}
      ${normalizedRole ? "AND m.role = ?" : ""}
    `;
    const totalRow = getDesktopDb()
      .prepare(countSql)
      .get(searchQuery, ...(conversationId ? [conversationId] : []), ...(normalizedRole ? [normalizedRole] : [])) as
      | { total?: number }
      | undefined;
    return {
      messages: messages.map((msg) => ({
        id: String(msg.id),
        conversationId: String(msg.conversationId),
        conversationTitle: String(msg.conversationTitle),
        role: String(msg.role),
        content: String(msg.content),
        createdAt: Number(msg.createdAt ?? 0),
        snippet: String(msg.content),
      })),
      total: totalRow?.total ?? messages.length,
    };
  },
  getConversationHistory: async (conversationId, includeSystem = false) => {
    const session = await presenter.agentSessionPresenter.getSession(conversationId);
    if (!session) {
      throw new Error(`Session not found: ${conversationId}`);
    }
    const records = await presenter.agentSessionPresenter.getMessages(conversationId);
    const filteredMessages = includeSystem
      ? records
      : records.filter((msg) => msg.role === "user" || msg.role === "assistant");
    return {
      conversation: {
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        agentId: session.agentId,
        providerId: session.providerId,
        modelId: session.modelId,
      },
      messages: filteredMessages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt,
        tokenCount: null,
        status: msg.status,
      })),
    };
  },
  getConversationStats: async (days = 30) => {
    const sinceTimestamp = Date.now() - days * 24 * 60 * 60 * 1000;
    const totalConversations = getDesktopDb().prepare("SELECT COUNT(*) as count FROM new_sessions").get();
    const recentConversations = getDesktopDb()
      .prepare("SELECT COUNT(*) as count FROM new_sessions WHERE created_at >= ?")
      .get(sinceTimestamp);
    const totalMessages = getDesktopDb().prepare("SELECT COUNT(*) as count FROM argos_messages").get();
    const recentMessages = getDesktopDb()
      .prepare("SELECT COUNT(*) as count FROM argos_messages WHERE created_at >= ?")
      .get(sinceTimestamp);
    const messagesByRole = getDesktopDb()
      .prepare(
        `
        SELECT role, COUNT(*) as count
        FROM argos_messages
        WHERE created_at >= ?
        GROUP BY role
      `,
      )
      .all(sinceTimestamp) as Array<{ role: string; count: number }>;
    const activeConversations = getDesktopDb()
      .prepare(
        `
        SELECT
          s.id as id,
          s.title as title,
          COUNT(m.id) as messageCount,
          MAX(m.created_at) as lastActivity
        FROM new_sessions s
        INNER JOIN argos_messages m ON s.id = m.session_id
        WHERE m.created_at >= ?
        GROUP BY s.id
        ORDER BY messageCount DESC
        LIMIT 10
      `,
      )
      .all(sinceTimestamp) as Array<{ id: string; title: string; messageCount: number; lastActivity: number }>;
    return {
      period: `${days} days`,
      total: {
        conversations: totalConversations?.count ?? 0,
        messages: totalMessages?.count ?? 0,
      },
      recent: {
        conversations: recentConversations?.count ?? 0,
        messages: recentMessages?.count ?? 0,
      },
      messagesByRole: messagesByRole.reduce((acc: Record<string, number>, item) => {
        acc[item.role] = item.count;
        return acc;
      }, {}),
      activeConversations: activeConversations.map((conv) => ({
        id: conv.id,
        title: conv.title,
        messageCount: conv.messageCount,
        lastActivity: new Date(conv.lastActivity).toISOString(),
      })),
    };
  },
});

export function getInMemoryServer(serverName: string, _args: string[], env?: Record<string, unknown>) {
  switch (serverName) {
    // buildInFileSystem has been removed - filesystem capabilities are now provided via Agent tools
    case "Artifacts":
      return new ArtifactsServer();
    case "bochaSearch":
      return new BochaSearchServer(env);
    case "braveSearch":
      return new BraveSearchServer(env);
    case "deepResearch":
      return new DeepResearchServer(env, {
        getLanguage: () => presenter.configPresenter.getLanguage?.() || "zh-CN",
      });
    case "difyKnowledge":
      return new DifyKnowledgeServer(env);
    case "ragflowKnowledge":
      return new RagflowKnowledgeServer(env);
    case "fastGptKnowledge":
      return new FastGptKnowledgeServer(env);
    case "builtinKnowledge":
      return new BuiltinKnowledgeServer({
        getKnowledgeConfigs: () => presenter.configPresenter.getKnowledgeConfigs(),
        similarityQuery: (id, key) => presenter.knowledgePresenter.similarityQuery(id, key),
      });
    case "argos-inmemory/deep-research-server":
      return new DeepResearchServer(env, {
        getLanguage: () => presenter.configPresenter.getLanguage?.() || "zh-CN",
      });
    case "argos-inmemory/auto-prompting-server":
      return new AutoPromptingServer({
        getCustomPrompts: () => presenter.configPresenter.getCustomPrompts(),
      });
    case "argos-inmemory/conversation-search-server":
      return new ConversationSearchServer(createConversationSearchPorts());
    case "argos/apple-server":
      // Only create the AppleServer on macOS
      if (process.platform !== "darwin") {
        throw new Error("Apple Server is only supported on macOS");
      }
      return new AppleServer();
    default:
      throw new Error(`Unknown in-memory server: ${serverName}`);
  }
}
