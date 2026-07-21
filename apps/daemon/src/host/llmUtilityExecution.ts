import type { LLM_PROVIDER } from "@argos/shared/presenter";
import { generateText, transcribe } from "ai";
import { createAiSdkProviderContext, type AiSdkProviderKind } from "@argos/backend-core/provider/aiSdk";
import type { DaemonConfigPresenter } from "./daemonConfigPresenter";

function resolveProviderKind(provider: LLM_PROVIDER): AiSdkProviderKind {
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
  return process.env.https_proxy || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.HTTP_PROXY;
}

/** Non-agent LLM utilities. Agent turns are exclusively owned by Pi. */
export class LlmUtilityExecution {
  constructor(private readonly configPresenter: DaemonConfigPresenter) {}

  private getProvider(providerId: string): LLM_PROVIDER | undefined {
    return (this.configPresenter.getProviders() as LLM_PROVIDER[]).find((provider) => provider.id === providerId);
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
    const context = createAiSdkProviderContext({
      providerKind: resolveProviderKind(provider),
      provider,
      configPresenter: this.configPresenter as any,
      defaultHeaders: {},
      modelId: input.modelId,
      proxyUrl: resolveProxyUrl(),
    });
    const result = await generateText({
      model: context.model,
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
      const context = createAiSdkProviderContext({
        providerKind: resolveProviderKind(provider),
        provider,
        configPresenter: this.configPresenter as any,
        defaultHeaders: {},
        modelId: modelId || "gpt-4o-mini",
        proxyUrl: resolveProxyUrl(),
      });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      try {
        await generateText({
          model: context.model,
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
      return { isOk: false, errorMsg: message.includes("abort") ? "Connection timed out (15s)" : message };
    }
  }

  async transcribeAudio(
    providerId: string,
    modelId: string,
    audioBase64: string,
    _mimeType: string,
    _filename?: string,
  ): Promise<string> {
    const provider = this.getProvider(providerId);
    if (!provider) throw new Error(`Provider not found: ${providerId}`);
    if (!provider.apiKey) throw new Error(`No API key configured for ${providerId}`);
    const normalized = audioBase64.replace(/\s/g, "").trim();
    if (!normalized) throw new Error("Audio data is required for transcription");
    const context = createAiSdkProviderContext({
      providerKind: resolveProviderKind(provider),
      provider,
      configPresenter: this.configPresenter as any,
      defaultHeaders: {},
      modelId,
      proxyUrl: resolveProxyUrl(),
    });
    if (!context.transcriptionModel) throw new Error(`Provider ${providerId} does not support audio transcription`);
    const result = await transcribe({ model: context.transcriptionModel, audio: Buffer.from(normalized, "base64") });
    return result.text.trim();
  }
}
