import type { ProviderExecutionPort } from "@argos/backend-core";
import type { SendMessageInput, MessageStartResult } from "@shared/types/agent-interface";
import type { DaemonConfigPresenter } from "./daemonConfigPresenter";
import type { BunSessionRepository } from "./bun-session-repository";

interface ProviderConfig {
  id: string;
  apiType: string;
  apiKey: string;
  baseUrl: string;
  enable: boolean;
}

interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface LLMResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant. Be concise and direct.`;

export class BunProviderExecutionPort implements ProviderExecutionPort {
  private activeControllers = new Map<string, AbortController>();

  constructor(
    private readonly configPresenter: DaemonConfigPresenter,
    private readonly sessionRepository: BunSessionRepository,
  ) {}

  private getProvider(providerId: string): ProviderConfig | undefined {
    const providers = this.configPresenter.getProviders() as ProviderConfig[];
    return providers.find((p) => p.id === providerId);
  }

  private resolveBaseUrl(provider: ProviderConfig): string {
    let base = provider.baseUrl || "";
    if (!base) {
      throw new Error(`No base URL configured for provider ${provider.id}`);
    }
    base = base.replace(/\/+$/, "");
    if (!base.includes("/chat/completions")) {
      if (!base.endsWith("/v1")) {
        base += "/v1";
      }
      base += "/chat/completions";
    }
    return base;
  }

  async sendMessage(sessionId: string, content: string | SendMessageInput): Promise<MessageStartResult> {
    const textContent = typeof content === "string" ? content : content.text || "";

    // Look up session to get provider/model info
    const session = await this.sessionRepository.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const providerId = session.providerId || "openai";
    const modelId = session.modelId || "gpt-4o-mini";

    const provider = this.getProvider(providerId);
    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`);
    }

    if (!provider.apiKey) {
      throw new Error(`No API key configured for ${providerId}`);
    }

    // Build messages (system + user for MVP)
    const messages: LLMMessage[] = [
      { role: "system", content: DEFAULT_SYSTEM_PROMPT },
      { role: "user", content: textContent },
    ];

    // Call the LLM API
    const controller = new AbortController();
    this.activeControllers.set(sessionId, controller);

    try {
      const baseUrl = this.resolveBaseUrl(provider);
      const body = {
        model: modelId,
        messages,
        stream: false,
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      };

      if (provider.apiType === "anthropic") {
        delete headers["Authorization"];
        headers["x-api-key"] = provider.apiKey;
        headers["anthropic-version"] = "2023-06-01";
      }

      const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5 min timeout

      try {
        const response = await fetch(baseUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorBody = await response.text().catch(() => "Unknown error");
          throw new Error(`LLM API error (${response.status}): ${errorBody.slice(0, 500)}`);
        }

        const data = (await response.json()) as LLMResponse;
        const assistantContent = data.choices?.[0]?.message?.content || "";

        // Store the assistant response via message repository
        // Note: In a full implementation, this would use the messageRepository
        // For now, we return the result directly

        return {
          accepted: true,
          requestId: null,
          messageId: null,
        };
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Generation timed out (5 minutes)");
      }
      throw error;
    } finally {
      this.activeControllers.delete(sessionId);
    }
  }

  async steerActiveTurn(_sessionId: string, _content: string | SendMessageInput): Promise<void> {
    throw new Error("steerActiveTurn not yet implemented in daemon mode");
  }

  async cancelGeneration(sessionId: string): Promise<void> {
    const controller = this.activeControllers.get(sessionId);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(sessionId);
    }
  }

  async respondToolInteraction(
    _sessionId: string,
    _messageId: string,
    _toolCallId: string,
    _response: unknown,
  ): Promise<{ resumed?: boolean; waitingForUserMessage?: boolean; handledInline?: boolean }> {
    throw new Error("respondToolInteraction not yet implemented in daemon mode");
  }

  async testConnection(providerId: string, modelId?: string): Promise<{ isOk: boolean; errorMsg: string | null }> {
    const provider = this.getProvider(providerId);
    if (!provider) {
      return { isOk: false, errorMsg: `Provider not found: ${providerId}` };
    }

    if (!provider.apiKey) {
      return { isOk: false, errorMsg: `No API key configured for ${providerId}` };
    }

    try {
      const baseUrl = this.resolveBaseUrl(provider);
      const testModel = modelId || this.getTestModelForProvider(provider);
      const body = {
        model: testModel,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1,
        stream: false,
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${provider.apiKey}`,
      };

      if (provider.apiType === "anthropic") {
        delete headers["Authorization"];
        headers["x-api-key"] = provider.apiKey;
        headers["anthropic-version"] = "2023-06-01";
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      try {
        const response = await fetch(baseUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          return { isOk: true, errorMsg: null };
        }

        const errorBody = await response.text().catch(() => "Unknown error");
        return {
          isOk: false,
          errorMsg: `HTTP ${response.status}: ${errorBody.slice(0, 200)}`,
        };
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("abort")) {
        return { isOk: false, errorMsg: "Connection timed out (15s)" };
      }
      return { isOk: false, errorMsg: message };
    }
  }

  private getTestModelForProvider(provider: ProviderConfig): string {
    const testModels: Record<string, string> = {
      openai: "gpt-4o-mini",
      anthropic: "claude-3-haiku-20240307",
      gemini: "gemini-1.5-flash",
      groq: "llama-3.1-8b-instant",
      mistral: "mistral-tiny",
      deepseek: "deepseek-chat",
      ollama: "llama3.2",
    };
    return testModels[provider.apiType] || testModels[provider.id] || "gpt-4o-mini";
  }
}
