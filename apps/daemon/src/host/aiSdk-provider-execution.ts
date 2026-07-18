import type { ProviderExecutionPort, IEventPublisher } from "@argos/backend-core";
import type { SendMessageInput, MessageStartResult } from "@argos/shared/types/agent-interface";
import type { LLM_PROVIDER } from "@argos/shared/presenter";
import { streamText, generateText, transcribe } from "ai";
import { createAiSdkProviderContext, type AiSdkProviderKind } from "@argos/backend-core/provider/aiSdk";
import type { DaemonConfigPresenter } from "./daemonConfigPresenter";
import type { BunSessionRepository } from "./bun-session-repository";
import { randomUUID } from "node:crypto";

interface ProviderConfig extends LLM_PROVIDER {}

const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant. Be concise and direct.`;

function extractTextFromMessageContent(raw: string): string {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string") return parsed;
    if (Array.isArray(parsed)) {
      return parsed
        .filter((b: any) => b.type === "content" && typeof b.content === "string")
        .map((b: any) => b.content)
        .join("\n");
    }
    if (parsed && typeof parsed.text === "string") return parsed.text;
  } catch {
    return raw;
  }
  return "";
}

function resolveProviderKind(provider: ProviderConfig): AiSdkProviderKind {
  const apiType = provider.apiType || "";
  if (apiType === "anthropic") return "anthropic";
  if (apiType === "gemini") return "gemini";
  if (apiType === "vertex") return "vertex";
  if (apiType === "aws-bedrock" || apiType === "bedrock") return "aws-bedrock";
  if (apiType === "azure") return "azure";
  if (apiType === "openai-responses" || apiType === "openai_responses") return "openai-responses";
  return "openai-compatible";
}

function resolveProxyUrl(): string | undefined {
  return (
    process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY || undefined
  );
}

export class AiSdkProviderExecutionPort implements ProviderExecutionPort {
  private activeGenerations = new Map<string, { controller: AbortController; requestId: string }>();

  constructor(
    private readonly configPresenter: DaemonConfigPresenter,
    private readonly sessionRepository: BunSessionRepository,
    private readonly eventPublisher?: IEventPublisher,
  ) {}

  private getProvider(providerId: string): ProviderConfig | undefined {
    const providers = this.configPresenter.getProviders() as ProviderConfig[];
    return providers.find((p) => p.id === providerId);
  }

  async sendMessage(sessionId: string, content: string | SendMessageInput): Promise<MessageStartResult> {
    const textContent = typeof content === "string" ? content : content.text || "";

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

    const requestId = randomUUID();
    console.log(
      `[chat] AI SDK sendMessage session=${sessionId} provider=${providerId} model=${modelId} requestId=${requestId}`,
    );

    const userContentJson = JSON.stringify({ text: textContent, files: [] });
    await this.sessionRepository.addMessage(sessionId, "user", userContentJson);

    let history: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: DEFAULT_SYSTEM_PROMPT },
    ];
    try {
      const records = await this.sessionRepository.listMessages(sessionId);
      history = [
        { role: "system", content: DEFAULT_SYSTEM_PROMPT },
        ...records
          .filter((r: any) => r.role === "user" || r.role === "assistant")
          .map((r: any) => ({
            role: r.role as "user" | "assistant",
            content: extractTextFromMessageContent(r.content),
          })),
      ];
    } catch (histErr) {
      console.warn(`[chat] history build failed (single-turn fallback):`, histErr);
    }

    const providerKind = resolveProviderKind(provider);
    const ctx = createAiSdkProviderContext({
      providerKind,
      provider,
      configPresenter: this.configPresenter as any,
      defaultHeaders: {},
      modelId,
      proxyUrl: resolveProxyUrl(),
    });

    const controller = new AbortController();
    this.activeGenerations.set(sessionId, { controller, requestId });

    let assistantMessageId: string | null = null;
    try {
      console.log(`[chat] streaming via AI SDK (${providerKind}) model=${modelId} msgs=${history.length}`);

      const result = streamText({
        model: ctx.model,
        messages: history,
        abortSignal: controller.signal,
      });

      let fullText = "";

      for await (const delta of result.textStream) {
        fullText += delta;

        this.eventPublisher?.publish("chat.stream.updated", {
          kind: "delta",
          requestId,
          sessionId,
          delta,
          updatedAt: Date.now(),
        });
      }

      assistantMessageId = await this.sessionRepository.addMessage(
        sessionId,
        "assistant",
        JSON.stringify([{ type: "content", content: fullText, status: "success", timestamp: Date.now() }]),
      );

      const now = Date.now();
      this.eventPublisher?.publish("chat.stream.updated", {
        kind: "snapshot",
        requestId,
        sessionId,
        messageId: assistantMessageId,
        updatedAt: now,
        blocks: [{ type: "content", content: fullText, status: "success", timestamp: now }],
      });
      this.eventPublisher?.publish("chat.stream.completed", {
        requestId,
        sessionId,
        messageId: assistantMessageId,
        completedAt: now,
      });

      console.log(`[chat] stream complete msg=${assistantMessageId} len=${fullText.length}`);

      return { requestId, messageId: assistantMessageId };
    } catch (error) {
      const failedAt = Date.now();
      this.eventPublisher?.publish("chat.stream.failed", {
        requestId,
        sessionId,
        messageId: assistantMessageId ?? "",
        failedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      this.activeGenerations.delete(sessionId);
    }
  }

  getActiveGeneration(sessionId: string): { eventId: string; runId: string } | null {
    const active = this.activeGenerations.get(sessionId);
    return active ? { eventId: active.requestId, runId: active.requestId } : null;
  }

  async steerActiveTurn(sessionId: string, content: string | SendMessageInput): Promise<void> {
    await this.cancelGeneration(sessionId);
    await this.sendMessage(sessionId, content);
  }

  async cancelGeneration(sessionId: string): Promise<void> {
    const active = this.activeGenerations.get(sessionId);
    if (active) {
      active.controller.abort();
      this.activeGenerations.delete(sessionId);
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

  async generateCompletion(input: {
    providerId: string;
    modelId: string;
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    const provider = this.getProvider(input.providerId);
    if (!provider) throw new Error(`Provider not found: ${input.providerId}`);

    const providerKind = resolveProviderKind(provider);
    const ctx = createAiSdkProviderContext({
      providerKind,
      provider,
      configPresenter: this.configPresenter as any,
      defaultHeaders: {},
      modelId: input.modelId,
      proxyUrl: resolveProxyUrl(),
    });

    const result = await generateText({
      model: ctx.model,
      messages: input.messages,
      temperature: input.temperature,
      maxOutputTokens: input.maxTokens,
    });

    return result.text.trim();
  }

  async testConnection(providerId: string, modelId?: string): Promise<{ isOk: boolean; errorMsg: string | null }> {
    const provider = this.getProvider(providerId);
    if (!provider) return { isOk: false, errorMsg: `Provider not found: ${providerId}` };
    if (!provider.apiKey) return { isOk: false, errorMsg: `No API key configured for ${providerId}` };

    try {
      const testModel = modelId || "gpt-4o-mini";
      const providerKind = resolveProviderKind(provider);
      const ctx = createAiSdkProviderContext({
        providerKind,
        provider,
        configPresenter: this.configPresenter as any,
        defaultHeaders: {},
        modelId: testModel,
        proxyUrl: resolveProxyUrl(),
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      try {
        await generateText({
          model: ctx.model,
          messages: [{ role: "user", content: "Hi" }],
          maxOutputTokens: 1,
          abortSignal: controller.signal,
        });
        return { isOk: true, errorMsg: null };
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

  async transcribeAudio(
    providerId: string,
    modelId: string,
    audioBase64: string,
    mimeType: string,
    _filename?: string,
  ): Promise<string> {
    const provider = this.getProvider(providerId);
    if (!provider) throw new Error(`Provider not found: ${providerId}`);
    if (!provider.apiKey) throw new Error(`No API key configured for ${providerId}`);

    const normalizedAudioBase64 = audioBase64.replace(/\s/g, "").trim();
    if (!normalizedAudioBase64) throw new Error("Audio data is required for transcription");

    const audioBuffer = Buffer.from(normalizedAudioBase64, "base64");

    const providerKind = resolveProviderKind(provider);
    const ctx = createAiSdkProviderContext({
      providerKind,
      provider,
      configPresenter: this.configPresenter as any,
      defaultHeaders: {},
      modelId,
      proxyUrl: resolveProxyUrl(),
    });

    if (!ctx.transcriptionModel) {
      throw new Error(`Provider ${providerId} does not support audio transcription`);
    }

    const result = await transcribe({
      model: ctx.transcriptionModel,
      audio: audioBuffer,
    });

    return result.text.trim();
  }
}
