import { homedir } from "node:os";
import { createJsonStoreFactory } from "./jsonStoreFactory";
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
  type McpHostPorts,
} from "@argos/mcp-runtime";
import type { IEventPublisher } from "@argos/backend-core";
import type { DaemonConfigPresenter } from "./daemonConfigPresenter";
import type { PluginToolPolicyDecision } from "@argos/shared/types/plugin";

type StoredToolPolicy = {
  pluginId: string;
  serverId: string;
  tools: Record<string, PluginToolPolicyDecision>;
  enabled: boolean;
};

type ToolPolicyStoreShape = {
  policies: StoredToolPolicy[];
};

/**
 * Daemon implementation of the MCP host ports. Uses OS paths, an identity
 * runtime (PATH-resolved node/npx/uvx — no bundled runtime), bridges events to
 * the daemon publisher, and provides minimal host services. Plugin tool
 * policies are read from the daemon's persisted plugin settings store.
 */
export function createDaemonMcpPorts(deps: {
  appVersion: string;
  eventPublisher: IEventPublisher;
  configPresenter: DaemonConfigPresenter;
  configDir: string;
  db: {
    prepare(sql: string): {
      all(...args: unknown[]): unknown[];
      get(...args: unknown[]): { count?: number; total?: number } | undefined;
    };
  };
  sessionRepository: {
    get(sessionId: string): Promise<{
      id: string;
      title: string;
      createdAt: number;
      updatedAt: number;
      agentId?: string | null;
      providerId?: string | null;
      modelId?: string | null;
    } | null>;
    listMessages(sessionId: string): Promise<
      Array<{
        id: string;
        role: string;
        content: string;
        createdAt: number;
        metadata?: string | null;
        status?: string | null;
      }>
    >;
  };
}): McpHostPorts {
  const subscribers = new Map<string, Set<(payload: unknown) => void>>();
  const toolPolicyStore = createJsonStoreFactory(deps.configDir)<ToolPolicyStoreShape>({
    name: "plugin-tool-policies",
    defaults: {
      policies: [],
    },
  });
  const publish = (channel: string, payload: unknown) => {
    deps.eventPublisher.publish(channel, payload);
    subscribers.get(channel)?.forEach((handler) => handler(payload));
  };

  return {
    paths: {
      homeDir: () => homedir(),
      appVersion: () => deps.appVersion,
    },
    runtime: {
      initializeRuntimes: () => {},
      expandPath: (target) => target,
      processCommandWithArgs: (command, args) => ({ command, args }),
      normalizePathEnv: (paths) => ({ key: "PATH", value: paths.join(":") }),
      getDefaultPaths: () => [],
      getNodeRuntimePath: () => null,
      getUvRuntimePath: () => null,
      setNodeRuntimePath: () => {},
      setUvRuntimePath: () => {},
    },
    events: {
      broadcast: publish,
      broadcastError: publish,
      subscribe: (channel, handler) => {
        let set = subscribers.get(channel);
        if (!set) {
          set = new Set();
          subscribers.set(channel, set);
        }
        set.add(handler);
        return () => set?.delete(handler);
      },
    },
    proxy: {
      getProxyUrl: () => null,
    },
    services: {
      getMcpServers: () => deps.configPresenter.getMcpServers() as Promise<Record<string, never>>,
      getProviderModels: (providerId) =>
        (deps.configPresenter as unknown as { getProviderModels?: (id: string) => unknown[] }).getProviderModels?.(
          providerId,
        ) ?? [],
      getCustomModels: (providerId) =>
        (deps.configPresenter as unknown as { getCustomModels?: (id: string) => unknown[] }).getCustomModels?.(
          providerId,
        ) ?? [],
      getPluginToolPolicy: (serverId: string, toolName: string) => {
        const policies = toolPolicyStore.get<StoredToolPolicy[]>("policies") ?? [];
        for (const policy of policies) {
          if (!policy.enabled || policy.serverId !== serverId) {
            continue;
          }
          const decision = policy.tools[toolName];
          if (decision === "allow" || decision === "ask" || decision === "deny") {
            return decision;
          }
        }
        return null;
      },
      getInMemoryServer: (name, _args, env) => {
        switch (name) {
          case "Artifacts":
            return new ArtifactsServer();
          case "bochaSearch":
          case "argos-inmemory/bocha-search-server":
            return new BochaSearchServer(env);
          case "braveSearch":
          case "argos-inmemory/brave-search-server":
            return new BraveSearchServer(env);
          case "difyKnowledge":
          case "argos-inmemory/dify-knowledge-server":
            return new DifyKnowledgeServer(env);
          case "ragflowKnowledge":
          case "argos-inmemory/ragflow-knowledge-server":
            return new RagflowKnowledgeServer(env);
          case "fastGptKnowledge":
          case "argos-inmemory/fastgpt-knowledge-server":
            return new FastGptKnowledgeServer(env);
          case "deepResearch":
          case "argos-inmemory/deep-research-server":
            return new DeepResearchServer(env, {
              getLanguage: () => deps.configPresenter.getLanguage?.() || "zh-CN",
            });
          case "argos-inmemory/auto-prompting-server":
            return new AutoPromptingServer({
              getCustomPrompts: () => deps.configPresenter.getCustomPrompts(),
            });
          case "argos-inmemory/conversation-search-server":
            return new ConversationSearchServer({
              searchConversations: async (query, limit = 10, offset = 0) => {
                const searchQuery = `%${query}%`;
                const rows = deps.db
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
                          FROM daemon_messages dm
                          WHERE dm.session_id = s.id AND dm.content LIKE ?
                          ORDER BY dm.created_at DESC
                          LIMIT 1
                        )
                      END as matchedContent
                    FROM daemon_sessions s
                    LEFT JOIN (
                      SELECT session_id, COUNT(*) as messageCount
                      FROM daemon_messages
                      GROUP BY session_id
                    ) msg_stats ON msg_stats.session_id = s.id
                    WHERE s.title LIKE ?
                      OR EXISTS (
                        SELECT 1
                        FROM daemon_messages dm2
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
                  FROM daemon_messages m
                  INNER JOIN daemon_sessions s ON m.session_id = s.id
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
                const messages = deps.db.prepare(sql).all(...params) as Array<{
                  id: string;
                  conversationId: string;
                  conversationTitle: string;
                  role: string;
                  content: string;
                  createdAt: number;
                }>;
                const countSql = `
                  SELECT COUNT(*) as total
                  FROM daemon_messages m
                  WHERE m.content LIKE ?
                  ${conversationId ? "AND m.session_id = ?" : ""}
                  ${normalizedRole ? "AND m.role = ?" : ""}
                `;
                const totalRow = deps.db
                  .prepare(countSql)
                  .get(
                    searchQuery,
                    ...(conversationId ? [conversationId] : []),
                    ...(normalizedRole ? [normalizedRole] : []),
                  ) as { total?: number } | undefined;
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
                const session = await deps.sessionRepository.get(conversationId);
                if (!session) {
                  throw new Error(`Session not found: ${conversationId}`);
                }
                const records = await deps.sessionRepository.listMessages(conversationId);
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
                const totalConversations = deps.db.prepare("SELECT COUNT(*) as count FROM daemon_sessions").get();
                const recentConversations = deps.db
                  .prepare("SELECT COUNT(*) as count FROM daemon_sessions WHERE created_at >= ?")
                  .get(sinceTimestamp);
                const totalMessages = deps.db.prepare("SELECT COUNT(*) as count FROM daemon_messages").get();
                const recentMessages = deps.db
                  .prepare("SELECT COUNT(*) as count FROM daemon_messages WHERE created_at >= ?")
                  .get(sinceTimestamp);
                const messagesByRole = deps.db
                  .prepare(
                    `
                    SELECT role, COUNT(*) as count
                    FROM daemon_messages
                    WHERE created_at >= ?
                    GROUP BY role
                  `,
                  )
                  .all(sinceTimestamp) as Array<{ role: string; count: number }>;
                const activeConversations = deps.db
                  .prepare(
                    `
                    SELECT
                      s.id as id,
                      s.title as title,
                      COUNT(m.id) as messageCount,
                      MAX(m.created_at) as lastActivity
                    FROM daemon_sessions s
                    INNER JOIN daemon_messages m ON s.id = m.session_id
                    WHERE m.created_at >= ?
                    GROUP BY s.id
                    ORDER BY messageCount DESC
                    LIMIT 10
                  `,
                  )
                  .all(sinceTimestamp) as Array<{
                  id: string;
                  title: string;
                  messageCount: number;
                  lastActivity: number;
                }>;
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
          case "argos/apple-server":
            throw new Error("Apple Server is only available on desktop");
          default:
            return null;
        }
      },
      // Auto-approve sampling requests using the first enabled provider with an
      // API key configured.
      handleSamplingRequest: async (payload: unknown) => {
        const req = payload as { requestId: string };
        const providers = (
          deps.configPresenter as unknown as {
            getProviders: () => Array<{
              id: string;
              enable: boolean;
              apiKey: string;
              baseUrl: string;
              apiType: string;
              models?: string[];
              enabledModels?: string[];
              customModels?: Array<{ id: string }>;
            }>;
          }
        ).getProviders();
        const provider = providers.find((p) => p.enable && p.apiKey && p.baseUrl && p.apiType !== "anthropic");
        if (!provider) {
          throw new Error(
            "No enabled OpenAI-compatible provider with API key for MCP sampling. " +
              "Configure a provider with an API key and baseUrl, or use an OpenAI-compatible proxy for Anthropic.",
          );
        }
        const modelId =
          provider.enabledModels?.[0] ?? provider.models?.[0] ?? provider.customModels?.[0]?.id ?? "gpt-4o-mini";
        return { requestId: req.requestId, approved: true, providerId: provider.id, modelId };
      },
      cancelSamplingRequest: async () => {},
      generateCompletionStandalone: async (...args: unknown[]) => {
        const providerId = args[0] as string;
        const messages = args[1] as Array<{ role: string; content: string }>;
        const modelId = args[2] as string;
        const systemPrompt = args[3] as string | undefined;
        const maxTokens = args[4] as number | undefined;

        const providers = (
          deps.configPresenter as unknown as {
            getProviders: () => Array<{ id: string; apiKey: string; baseUrl: string; apiType: string }>;
          }
        ).getProviders();
        const provider = providers.find((p) => p.id === providerId);
        if (!provider?.apiKey) throw new Error(`Provider ${providerId} not found or no API key`);
        if (!provider.baseUrl) throw new Error(`Provider ${providerId} has no baseUrl configured`);
        if (provider.apiType === "anthropic") {
          throw new Error(
            "Anthropic native API is not OpenAI-compatible. Configure an OpenAI-compatible proxy baseUrl for MCP sampling.",
          );
        }

        let base = provider.baseUrl.replace(/\/+$/, "");
        if (!base.includes("/chat/completions")) {
          if (!base.endsWith("/v1")) base += "/v1";
          base += "/chat/completions";
        }

        const allMessages = [...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []), ...messages];

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60_000);
        try {
          const response = await fetch(base, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${provider.apiKey}` },
            body: JSON.stringify({
              model: modelId,
              messages: allMessages,
              stream: false,
              max_tokens: maxTokens,
            }),
            signal: controller.signal,
          });

          if (!response.ok) {
            const errorBody = await response.text().catch(() => "Unknown error");
            throw new Error(`LLM API error (${response.status}): ${errorBody.slice(0, 500)}`);
          }

          const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
          return data.choices?.[0]?.message?.content ?? "";
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") {
            throw new Error("MCP sampling request timed out (60s)");
          }
          throw error;
        } finally {
          clearTimeout(timeout);
        }
      },
    },
  };
}
