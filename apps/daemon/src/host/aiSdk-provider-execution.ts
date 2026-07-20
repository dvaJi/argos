import type {
  ProviderExecutionPort,
  IEventPublisher,
  AgentMessageStore,
  AgentProcessResult,
} from "@argos/backend-core";
import { agentProcessStream } from "@argos/backend-core";
import type { SendMessageInput, MessageStartResult } from "@argos/shared/types/agent-interface";
import type { LLM_PROVIDER } from "@argos/shared/presenter";
import type { ChatMessage } from "@argos/shared/types/core/chat-message";
import type { MCPToolDefinition } from "@argos/shared/types/core/mcp";
import { streamText, generateText, transcribe } from "ai";
import { createAiSdkProviderContext, type AiSdkProviderKind } from "@argos/backend-core/provider/aiSdk";
import type { DaemonConfigPresenter } from "./daemonConfigPresenter";
import type { BunSessionRepository } from "./bun-session-repository";
import { randomUUID } from "node:crypto";

interface ProviderConfig extends LLM_PROVIDER {}
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
    private readonly getTools?: (sessionId: string) => Promise<MCPToolDefinition[]>,
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
    const userMessageId = await this.sessionRepository.addMessage(sessionId, "user", userContentJson);

    const history = await this.buildHistory(sessionId);
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

    const assistantMessageId = await this.sessionRepository.addMessage(sessionId, "assistant", JSON.stringify([]));

    const tools = this.getTools ? await this.getTools(sessionId) : [];
    const permissionMode = (await this.sessionRepository.getPermissionMode(sessionId)) ?? "default";

    const coreStream = this.buildCoreStream(ctx.model, controller.signal);

    const messageStore: AgentMessageStore = {
      updateAssistantContent: (id, blocks) => this.sessionRepository.updateAssistantContent(id, blocks as never[]),
      finalizeAssistantMessage: (id, blocks, meta) =>
        this.sessionRepository.finalizeAssistantMessage(id, blocks as never[], meta),
      setMessageError: (id, blocks, meta) => this.sessionRepository.setMessageError(id, blocks as never[], meta),
      getMessage: async (id) => {
        const msg = await this.sessionRepository.getMessage(id);
        return msg ? { role: msg.role, status: msg.status, content: msg.content } : null;
      },
    };

    try {
      const result: AgentProcessResult = await agentProcessStream({
        messages: history,
        tools,
        toolPresenter: this.buildToolPresenter(sessionId),
        coreStream,
        providerId,
        modelId,
        modelConfig: provider as any,
        temperature: 0.7,
        maxTokens: 4096,
        permissionMode,
        sessionId,
        requestId,
        messageId: assistantMessageId,
        abortSignal: controller.signal,
        eventPublisher: this.eventPublisher as IEventPublisher,
        messageStore,
        refreshTools: this.getTools ? () => this.getTools!(sessionId) : undefined,
      });

      if (result.status === "error" && result.terminalError) {
        throw new Error(result.terminalError);
      }

      console.log(`[chat] stream complete msg=${assistantMessageId} status=${result.status}`);
      return { requestId, messageId: assistantMessageId };
    } catch (error) {
      const failedAt = Date.now();
      this.eventPublisher?.publish("chat.stream.failed", {
        requestId,
        sessionId,
        messageId: assistantMessageId,
        failedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      this.activeGenerations.delete(sessionId);
    }
  }

  private async buildHistory(sessionId: string): Promise<ChatMessage[]> {
    try {
      const records = await this.sessionRepository.listMessages(sessionId);
      return records
        .filter((r: any) => r.role === "user" || r.role === "assistant")
        .map((r: any) => ({
          role: r.role as "user" | "assistant",
          content: extractTextFromMessageContent(r.content),
        })) as ChatMessage[];
    } catch (histErr) {
      console.warn(`[chat] history build failed (single-turn fallback):`, histErr);
      return [];
    }
  }

  private buildCoreStream(
    model: any,
    abortSignal: AbortSignal,
  ): (
    messages: ChatMessage[],
    modelId: string,
    modelConfig: any,
    temperature: number,
    maxTokens: number,
    tools: MCPToolDefinition[],
  ) => AsyncGenerator<any> {
    return async function* (
      messages: ChatMessage[],
      _modelId: string,
      _modelConfig: any,
      temperature: number,
      maxTokens: number,
      tools: MCPToolDefinition[],
    ) {
      const result = streamText({
        model,
        messages: messages as any,
        temperature,
        maxOutputTokens: maxTokens,
        tools: tools.length > 0 ? (tools as any) : undefined,
        abortSignal,
      });

      for await (const textPart of result.textStream) {
        yield { type: "text", content: textPart };
      }

      const usage = (await result.usage) as unknown as Record<string, number> | undefined;
      if (usage) {
        yield {
          type: "usage",
          usage: {
            prompt_tokens: usage.promptTokens ?? usage.prompt_tokens ?? 0,
            completion_tokens: usage.completionTokens ?? usage.completion_tokens ?? 0,
            total_tokens: usage.totalTokens ?? usage.total_tokens ?? 0,
            cached_tokens: usage.cachedPromptTokens ?? usage.cached_tokens,
            cache_write_tokens: usage.cacheCreationTokens ?? usage.cache_write_tokens,
          },
        };
      }
      yield { type: "stop", stop_reason: "complete" };
    };
  }

  private buildToolPresenter(_sessionId: string) {
    return {
      callTool: async () => ({ rawData: { toolCallId: "", content: "", isError: false } }),
      preCheckToolPermission: async () => null,
    };
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
