import type { ProviderExecutionPort, IEventPublisher } from "@argos/backend-core";
import type { SendMessageInput, MessageStartResult } from "@shared/types/agent-interface";
import type { DaemonConfigPresenter } from "./daemonConfigPresenter";
import type { BunSessionRepository } from "./bun-session-repository";
import { randomUUID } from "node:crypto";

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

/**
 * Extract plain text from a ChatMessageRecord.content JSON string for LLM history.
 * User messages: `{ text: "...", files: [...] }`. Assistant messages: `[{type:"content", content:"..."}]`.
 * Falls back to the raw string if it isn't valid JSON (legacy/plain-text content).
 */
function extractTextFromMessageContent(raw: string): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string") return parsed;
    if (Array.isArray(parsed)) {
      return parsed
        .filter((b) => b.type === "content" && typeof b.content === "string")
        .map((b) => b.content)
        .join("\n");
    }
    if (parsed && typeof parsed.text === "string") return parsed.text;
  } catch {
    return raw;
  }
  return "";
}

export class BunProviderExecutionPort implements ProviderExecutionPort {
  private activeControllers = new Map<string, AbortController>();

  constructor(
    private readonly configPresenter: DaemonConfigPresenter,
    private readonly sessionRepository: BunSessionRepository,
    private readonly eventPublisher?: IEventPublisher,
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

  private resolveAudioTranscriptionUrl(provider: ProviderConfig): string {
    let base = provider.baseUrl || "";
    if (!base) {
      throw new Error(`No base URL configured for provider ${provider.id}`);
    }
    base = base.replace(/\/+$/, "");
    if (!base.includes("/audio/transcriptions")) {
      if (!base.endsWith("/v1")) {
        base += "/v1";
      }
      base += "/audio/transcriptions";
    }
    return base;
  }

  async generateCompletion(input: {
    providerId: string;
    modelId: string;
    messages: Array<LLMMessage>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const provider = this.getProvider(input.providerId);
    if (!provider) {
      throw new Error(`Provider not found: ${input.providerId}`);
    }
    if (!provider.apiKey) {
      throw new Error(`No API key configured for ${input.providerId}`);
    }

    const baseUrl = this.resolveBaseUrl(provider);
    const body = {
      model: input.modelId,
      messages: input.messages,
      temperature: input.temperature ?? 0.2,
      max_tokens: input.maxTokens ?? 1024,
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

    const response = await fetch(baseUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      throw new Error(`LLM API error (${response.status}): ${errorBody.slice(0, 500)}`);
    }

    const data = (await response.json()) as LLMResponse;
    return data.choices?.[0]?.message?.content?.trim() || "";
  }

  async transcribeAudio(
    providerId: string,
    modelId: string,
    audioBase64: string,
    mimeType: string,
    filename?: string,
  ): Promise<string> {
    const provider = this.getProvider(providerId);
    if (!provider) {
      throw new Error(`Provider not found: ${providerId}`);
    }
    if (!provider.apiKey) {
      throw new Error(`No API key configured for ${providerId}`);
    }
    if (provider.apiType === "anthropic") {
      throw new Error("Audio transcription is not available for Anthropic providers in daemon mode");
    }

    const normalizedAudioBase64 = audioBase64.replace(/\s/g, "").trim();
    if (!normalizedAudioBase64) {
      throw new Error("Audio data is required for transcription");
    }
    const normalizedMimeType = mimeType.trim() || "audio/wav";
    const normalizedFilename = filename?.trim() || "recording.wav";
    const audioBuffer = Buffer.from(normalizedAudioBase64, "base64");
    const formData = new FormData();
    formData.append("file", new Blob([audioBuffer], { type: normalizedMimeType }), normalizedFilename);
    formData.append("model", modelId);

    const response = await fetch(this.resolveAudioTranscriptionUrl(provider), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${provider.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "Unknown error");
      throw new Error(`LLM API error (${response.status}): ${errorBody.slice(0, 500)}`);
    }

    const payload = (await response.json()) as { text?: unknown };
    if (typeof payload.text !== "string") {
      throw new Error("Invalid audio transcription response");
    }

    return payload.text.trim();
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

    // Persist the user message as JSON (the renderer's ChatMessageRecord expects
    // {text, files} for user messages) and build conversation history for context.
    const requestId = randomUUID();
    console.log(
      `[chat] exec sendMessage session=${sessionId} provider=${providerId} model=${modelId} requestId=${requestId}`,
    );
    const userContentJson = JSON.stringify({ text: textContent, files: [] });
    await this.sessionRepository.addMessage(sessionId, "user", userContentJson);
    let history: LLMMessage[] = [{ role: "system", content: DEFAULT_SYSTEM_PROMPT }];
    try {
      const records = await this.sessionRepository.listMessages(sessionId);
      history = [
        { role: "system", content: DEFAULT_SYSTEM_PROMPT },
        ...records
          .filter((r) => r.role === "user" || r.role === "assistant")
          .map((r) => ({ role: r.role as "user" | "assistant", content: extractTextFromMessageContent(r.content) })),
      ];
    } catch (histErr) {
      console.warn(`[chat] history build failed (single-turn fallback):`, histErr);
    }
    console.log(`[chat] fetching ${this.resolveBaseUrl(provider)} model=${modelId} msgs=${history.length}`);

    // Call the LLM API
    const controller = new AbortController();
    this.activeControllers.set(sessionId, controller);

    let assistantMessageId: string | null = null;
    try {
      const body = {
        model: modelId,
        messages: history,
        stream: false,
      };

      const timeout = setTimeout(() => controller.abort(), 5 * 60 * 1000); // 5 min timeout

      try {
        const response = await fetch(this.resolveBaseUrl(provider), {
          method: "POST",
          headers: this.buildHeaders(provider),
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          const errorBody = await response.text().catch(() => "Unknown error");
          console.error(`[chat] LLM API error ${response.status}: ${errorBody.slice(0, 300)}`);
          throw new Error(`LLM API error (${response.status}): ${errorBody.slice(0, 500)}`);
        }

        const data = (await response.json()) as LLMResponse;
        const replyText = data.choices?.[0]?.message?.content ?? "";
        console.log(`[chat] reply received len=${replyText.length} preview="${replyText.slice(0, 120)}"`);

        // Persist the assistant reply as JSON blocks (the renderer's
        // ChatMessageRecord expects AssistantMessageBlock[] for assistant messages).
        const replyBlocks = [{ type: "content", content: replyText, status: "success", timestamp: Date.now() }];
        assistantMessageId = await this.sessionRepository.addMessage(
          sessionId,
          "assistant",
          JSON.stringify(replyBlocks),
        );
        console.log(`[chat] persisted assistant msg=${assistantMessageId}, emitting stream events`);

        // Emit stream events so the renderer displays the reply. Non-streaming
        // (single snapshot + completed), but enough for web-mode chat to render.
        const now = Date.now();
        this.eventPublisher?.publish("chat.stream.updated", {
          kind: "snapshot",
          requestId,
          sessionId,
          messageId: assistantMessageId,
          updatedAt: now,
          blocks: [{ type: "content", content: replyText, status: "success", timestamp: now }],
        });
        this.eventPublisher?.publish("chat.stream.completed", {
          requestId,
          sessionId,
          messageId: assistantMessageId,
          completedAt: now,
        });

        return {
          requestId,
          messageId: assistantMessageId,
        };
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      const failedAt = Date.now();
      this.eventPublisher?.publish("chat.stream.failed", {
        requestId,
        sessionId,
        messageId: assistantMessageId ?? "",
        failedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("Generation timed out (5 minutes)");
      }
      throw error;
    } finally {
      this.activeControllers.delete(sessionId);
    }
  }

  async steerActiveTurn(sessionId: string, content: string | SendMessageInput): Promise<void> {
    await this.cancelGeneration(sessionId);
    await this.sendMessage(sessionId, content);
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
    return { handledInline: true };
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
      const testModel = modelId || this.getTestModelForProvider(provider);
      const body = {
        model: testModel,
        messages: [{ role: "user", content: "Hi" }],
        max_tokens: 1,
        stream: false,
      };

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      try {
        const response = await fetch(this.resolveBaseUrl(provider), {
          method: "POST",
          headers: this.buildHeaders(provider),
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

  private buildHeaders(provider: ProviderConfig): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${provider.apiKey}`,
    };

    if (provider.apiType === "anthropic") {
      delete headers["Authorization"];
      headers["x-api-key"] = provider.apiKey;
      headers["anthropic-version"] = "2023-06-01";
    }

    return headers;
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
