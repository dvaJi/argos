import { homedir } from "node:os";
import type { McpHostPorts } from "@argos/mcp-runtime";
import type { IEventPublisher } from "@argos/backend-core";
import type { DaemonConfigPresenter } from "./daemonConfigPresenter";

/**
 * Daemon implementation of the MCP host ports. Uses OS paths, an identity
 * runtime (PATH-resolved node/npx/uvx — no bundled runtime), bridges events to
 * the daemon publisher, and provides minimal service stubs (no sampling UI,
 * no plugins, no in-memory knowledge servers in v1).
 */
export function createDaemonMcpPorts(deps: {
  appVersion: string;
  eventPublisher: IEventPublisher;
  configPresenter: DaemonConfigPresenter;
}): McpHostPorts {
  const subscribers = new Map<string, Set<(payload: unknown) => void>>();
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
      getCustomModels: () => [],
      // Auto-approve sampling requests using the first enabled provider's model.
      handleSamplingRequest: async (payload: unknown) => {
        const req = payload as { requestId: string };
        const providers = (
          deps.configPresenter as unknown as {
            getProviders: () => Array<{ id: string; enable: boolean; models?: string[] }>;
          }
        ).getProviders();
        const provider = providers.find((p) => p.enable);
        if (!provider) {
          return { requestId: req.requestId, approved: false, reason: "No enabled provider" };
        }
        const modelId = provider.models?.[0] ?? "gpt-4o-mini";
        return {
          requestId: req.requestId,
          approved: true,
          providerId: provider.id,
          modelId,
        };
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

        let base = provider.baseUrl.replace(/\/+$/, "");
        if (!base.includes("/chat/completions")) {
          if (!base.endsWith("/v1")) base += "/v1";
          base += "/chat/completions";
        }

        const allMessages = [...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []), ...messages];

        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (provider.apiType === "anthropic") {
          headers["x-api-key"] = provider.apiKey;
          headers["anthropic-version"] = "2023-06-01";
        } else {
          headers.Authorization = `Bearer ${provider.apiKey}`;
        }

        const response = await fetch(base, {
          method: "POST",
          headers,
          body: JSON.stringify({ model: modelId, messages: allMessages, stream: false, max_tokens: maxTokens }),
        });

        if (!response.ok) {
          const errorBody = await response.text().catch(() => "Unknown error");
          throw new Error(`LLM API error (${response.status}): ${errorBody.slice(0, 500)}`);
        }

        const data = (await response.json()) as { choices: Array<{ message: { content: string } }> };
        return data.choices?.[0]?.message?.content ?? "";
      },
    },
  };
}
