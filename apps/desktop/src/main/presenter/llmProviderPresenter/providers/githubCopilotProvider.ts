import {
  LLM_PROVIDER,
  LLMResponse,
  MODEL_META,
  ChatMessage,
  LLMCoreStreamEvent,
  ModelConfig,
  MCPToolDefinition,
  IConfigPresenter,
} from "@argos/shared/presenter";
import { BaseLLMProvider, SUMMARY_TITLES_PROMPT } from "../baseProvider";
import { HttpsProxyAgent } from "https-proxy-agent";
import { getGlobalGitHubCopilotDeviceFlow, GitHubCopilotDeviceFlow } from "../../githubCopilotDeviceFlow";

// Extend RequestInit type to support the agent property
interface RequestInitWithAgent extends RequestInit {
  agent?: HttpsProxyAgent<string>;
}
import { proxyConfig } from "../../proxyConfig";

interface CopilotTokenResponse {
  token: string;
  expires_at: number;
  refresh_in?: number;
}

export class GithubCopilotProvider extends BaseLLMProvider {
  private copilotToken: string | null = null;
  private tokenExpiresAt: number = 0;
  private baseApiUrl = "https://api.githubcopilot.com";
  private tokenUrl = "https://api.github.com/copilot_internal/v2/token";
  private deviceFlow: GitHubCopilotDeviceFlow | null = null;

  constructor(provider: LLM_PROVIDER, configPresenter: IConfigPresenter) {
    super(provider, configPresenter);
    this.init();
  }

  protected async init() {
    if (this.provider.enable) {
      try {
        this.isInitialized = true;
        this.deviceFlow = getGlobalGitHubCopilotDeviceFlow(this.provider.copilotClientId);

        // Check the existing authentication state
        if (this.provider.apiKey) {
          const existingToken = await this.deviceFlow.checkExistingAuth(this.provider.apiKey);
          if (!existingToken) {
            this.provider.apiKey = "";
          }
        }

        await this.fetchModels();
        await this.autoEnableModelsIfNeeded();
        console.log(`[GitHub Copilot] Initialized successfully`);
      } catch (error) {
        console.warn(`[GitHub Copilot] Initialization failed:`, error);
        try {
          await this.fetchModels();
        } catch (modelError) {
          console.warn(`[GitHub Copilot] Failed to fetch models:`, modelError);
        }
      }
    }
  }

  public onProxyResolved(): void {
    this.init();
  }

  public override updateConfig(provider: LLM_PROVIDER): void {
    const newDeviceFlow = getGlobalGitHubCopilotDeviceFlow(provider.copilotClientId);

    super.updateConfig(provider);
    this.copilotToken = null;
    this.tokenExpiresAt = 0;
    this.deviceFlow = newDeviceFlow;
  }

  private async getCopilotToken(signal?: AbortSignal): Promise<string> {
    // Prefer the device flow to obtain the token
    if (this.deviceFlow) {
      try {
        return await this.deviceFlow.getCopilotToken();
      } catch (error) {
        console.warn("[GitHub Copilot] Device flow failed, falling back to provider API key:", error);
      }
    }

    // Check whether the token has expired
    if (this.copilotToken && Date.now() < this.tokenExpiresAt) {
      return this.copilotToken;
    }

    if (!this.provider.apiKey) {
      throw new Error("No GitHub OAuth token available. Please use device flow authentication.");
    }

    // Get a new token
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.provider.apiKey}`,
      Accept: "application/json",
      "User-Agent": "Argos/1.0.0",
    };

    const requestOptions: RequestInitWithAgent = {
      method: "GET",
      headers,
      ...(signal ? { signal } : {}),
    };

    // Add proxy support
    const proxyUrl = proxyConfig.getProxyUrl();
    if (proxyUrl) {
      const agent = new HttpsProxyAgent(proxyUrl);
      requestOptions.agent = agent;
    }

    try {
      const response = await fetch(this.tokenUrl, requestOptions);

      if (!response.ok) {
        let errorMessage = `Failed to get Copilot token: ${response.status} ${response.statusText}`;

        // Provide a more specific error message and remediation guidance
        if (response.status === 404) {
          errorMessage = `GitHub Copilot access denied (404). Please check:
1. Whether your GitHub account has an active GitHub Copilot subscription
2. Whether the OAuth token has insufficient scope - the 'read:org' scope is required to access the Copilot API
3. Please redo the OAuth login to obtain the correct scopes
4. Visit https://github.com/features/copilot to check your subscription status`;
        } else if (response.status === 401) {
          errorMessage = `GitHub OAuth token is invalid or expired (401). Please log in again and make sure the correct scopes are granted.`;
        } else if (response.status === 403) {
          errorMessage = `GitHub Copilot access forbidden (403). Please check:
1. Whether your GitHub Copilot subscription is valid and active
2. Whether you have hit the API usage limit
3. Whether the OAuth token includes the 'read:org' scope
4. If this is an organization account, ensure the organization has Copilot enabled and you have access`;
        }

        throw new Error(errorMessage);
      }

      const data: CopilotTokenResponse = await response.json();
      this.copilotToken = data.token;
      this.tokenExpiresAt = data.expires_at * 1000; // Convert to milliseconds

      return this.copilotToken;
    } catch (error) {
      console.error("[GitHub Copilot] Error getting Copilot token:", error);
      throw error;
    }
  }

  protected async fetchProviderModels(): Promise<MODEL_META[]> {
    // Try to get models from publicdb first
    const dbModels = this.configPresenter.getDbProviderModels(this.provider.id);
    if (dbModels.length > 0) {
      // Convert RENDERER_MODEL_META to MODEL_META format
      return dbModels.map((m) => ({
        id: m.id,
        name: m.name,
        group: m.group,
        providerId: m.providerId,
        isCustom: m.isCustom,
        contextLength: m.contextLength,
        maxTokens: m.maxTokens,
        vision: m.vision,
        functionCall: m.functionCall,
        reasoning: m.reasoning,
      }));
    }

    // Fallback to hardcoded models if publicdb doesn't have copilot models yet
    console.warn(
      `[GitHub Copilot] No models found in publicdb for provider ${this.provider.id}, using fallback models`,
    );

    const models: MODEL_META[] = [
      {
        id: "gpt-5",
        name: "GPT-5",
        group: "GitHub Copilot",
        providerId: this.provider.id,
        isCustom: false,
        contextLength: 128000,
        maxTokens: 8192,
        vision: true,
        functionCall: true,
        reasoning: false,
      },
      {
        id: "gpt-5-mini",
        name: "GPT-5 mini",
        group: "GitHub Copilot",
        providerId: this.provider.id,
        isCustom: false,
        contextLength: 128000,
        maxTokens: 16384,
        vision: true,
        functionCall: true,
        reasoning: false,
      },
      {
        id: "gpt-4.1",
        name: "GPT-4.1",
        group: "GitHub Copilot",
        providerId: this.provider.id,
        isCustom: false,
        contextLength: 64000,
        maxTokens: 4096,
        vision: true,
        functionCall: true,
        reasoning: false,
      },
      {
        id: "gpt-4o-2024-05-13",
        name: "GPT-4o",
        group: "GitHub Copilot",
        providerId: this.provider.id,
        isCustom: false,
        contextLength: 64000,
        maxTokens: 4096,
        vision: true,
        functionCall: true,
        reasoning: false,
      },
      {
        id: "gpt-4",
        name: "GPT-4",
        group: "GitHub Copilot",
        providerId: this.provider.id,
        isCustom: false,
        contextLength: 32768,
        maxTokens: 4096,
        vision: false,
        functionCall: true,
        reasoning: false,
      },
      {
        id: "gpt-3.5-turbo",
        name: "GPT-3.5 Turbo",
        group: "GitHub Copilot",
        providerId: this.provider.id,
        isCustom: false,
        contextLength: 12288,
        maxTokens: 4096,
        vision: false,
        functionCall: true,
        reasoning: false,
      },
      {
        id: "o1",
        name: "o1",
        group: "GitHub Copilot",
        providerId: this.provider.id,
        isCustom: false,
        contextLength: 20000,
        maxTokens: 32768,
        vision: false,
        functionCall: false,
        reasoning: true,
      },
      {
        id: "o3-mini",
        name: "o3-mini",
        group: "GitHub Copilot",
        providerId: this.provider.id,
        isCustom: false,
        contextLength: 64000,
        maxTokens: 65536,
        vision: false,
        functionCall: false,
        reasoning: true,
      },
      {
        id: "claude-sonnet-4",
        name: "Claude Sonnet 4",
        group: "GitHub Copilot",
        providerId: this.provider.id,
        isCustom: false,
        contextLength: 200000,
        maxTokens: 8192,
        vision: true,
        functionCall: true,
        reasoning: false,
      },
      {
        id: "claude-sonnet-4.5",
        name: "Claude Sonnet 4.5",
        group: "GitHub Copilot",
        providerId: this.provider.id,
        isCustom: false,
        contextLength: 200000,
        maxTokens: 8192,
        vision: true,
        functionCall: true,
        reasoning: false,
      },
      {
        id: "claude-3.5-sonnet",
        name: "Claude Sonnet 3.5",
        group: "GitHub Copilot",
        providerId: this.provider.id,
        isCustom: false,
        contextLength: 200000,
        maxTokens: 8192,
        vision: true,
        functionCall: true,
        reasoning: false,
      },
      {
        id: "claude-3.7-sonnet",
        name: "Claude Sonnet 3.7",
        group: "GitHub Copilot",
        providerId: this.provider.id,
        isCustom: false,
        contextLength: 90000,
        maxTokens: 8192,
        vision: true,
        functionCall: true,
        reasoning: false,
      },
      {
        id: "claude-3.7-sonnet-thought",
        name: "Claude Sonnet 3.7 Thinking",
        group: "GitHub Copilot",
        providerId: this.provider.id,
        isCustom: false,
        contextLength: 90000,
        maxTokens: 8192,
        vision: true,
        functionCall: true,
        reasoning: false,
      },
      {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        group: "GitHub Copilot",
        providerId: this.provider.id,
        isCustom: false,
        contextLength: 128000,
        maxTokens: 8192,
        vision: true,
        functionCall: true,
        reasoning: false,
      },
      {
        id: "gemini-2.0-flash-001",
        name: "Gemini 2.0 Flash",
        group: "GitHub Copilot",
        providerId: this.provider.id,
        isCustom: false,
        contextLength: 128000,
        maxTokens: 8192,
        vision: true,
        functionCall: true,
        reasoning: false,
      },
    ];

    return models;
  }

  private formatMessages(messages: ChatMessage[]): Array<{
    role: string;
    content: string;
    tool_calls?: ChatMessage["tool_calls"];
    reasoning_content?: string;
  }> {
    return messages.map((msg) => {
      const formatted: {
        role: string;
        content: string;
        tool_calls?: ChatMessage["tool_calls"];
        reasoning_content?: string;
      } = {
        role: msg.role,
        content:
          typeof msg.content === "string" ? msg.content : msg.content === undefined ? "" : JSON.stringify(msg.content),
      };

      if (msg.role === "assistant" && msg.tool_calls?.length) {
        formatted.tool_calls = msg.tool_calls;
      }

      if (msg.role === "assistant" && Object.prototype.hasOwnProperty.call(msg, "reasoning_content")) {
        formatted.reasoning_content = msg.reasoning_content ?? "";
      }

      return formatted;
    });
  }

  async *coreStream(
    messages: ChatMessage[],
    modelId: string,
    modelConfig: ModelConfig,
    temperature: number,
    _maxTokens: number,
    tools: MCPToolDefinition[],
  ): AsyncGenerator<LLMCoreStreamEvent, void, unknown> {
    if (!modelId) throw new Error("Model ID is required");
    const { signal, dispose } = this.createModelRequestSignal(modelConfig);
    try {
      const token = await this.getCopilotToken(signal);
      const formattedMessages = this.formatMessages(messages);

      const requestBody = {
        intent: true,
        n: 1,
        model: modelId,
        messages: formattedMessages,
        stream: true,
        temperature: temperature ?? 0.7,
        max_tokens: _maxTokens || 4096,
        ...(tools && tools.length > 0 && { tools }),
      };

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "User-Agent": "Argos/1.0.0",
        "Editor-Version": "Argos/1.0.0",
        "Copilot-Integration-Id": "vscode-chat",
      };

      // Add detailed request logging
      console.log("📤 [GitHub Copilot] Sending stream request:");
      console.log(`   URL: ${this.baseApiUrl}/chat/completions`);
      console.log(`   Model: ${modelId}`);
      console.log(`   Headers: ${Object.keys(headers).join(", ")}`);
      console.log(
        `   Request Body: { messages: ${formattedMessages.length}, model: "${modelId}", temperature: ${temperature}, max_tokens: ${_maxTokens} }`,
      );

      const requestOptions: RequestInitWithAgent = {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        ...(signal ? { signal } : {}),
      };

      await this.emitRequestTrace(modelConfig, {
        endpoint: `${this.baseApiUrl}/chat/completions`,
        headers,
        body: requestBody,
      });

      // Add proxy support
      const proxyUrl = proxyConfig.getProxyUrl();
      if (proxyUrl) {
        const agent = new HttpsProxyAgent(proxyUrl);
        requestOptions.agent = agent;
      }

      const response = await fetch(`${this.baseApiUrl}/chat/completions`, requestOptions);

      console.log("📥 [GitHub Copilot] Stream API Response:");
      console.log(`   Status: ${response.status} ${response.statusText}`);
      console.log(`   OK: ${response.ok}`);

      if (!response.ok) {
        let errorBody = "";
        try {
          errorBody = await response.text();
        } catch {
          // ignore
        }

        // Special handling for 403 errors
        if (response.status === 403) {
          throw new Error(
            `GitHub Copilot access denied (403).\n\nPossible causes:\n` +
              `1. The GitHub Copilot subscription is expired or not active\n` +
              `2. Re-authentication is required to obtain the correct access permissions\n` +
              `3. The API access policy has been updated; the latest authentication method is required\n` +
              `4. Your account may not have permission to access this API\n\n` +
              `Suggested solutions:\n` +
              `- Visit https://github.com/settings/copilot to check your subscription status\n` +
              `- Re-login to GitHub Copilot in the Argos settings\n` +
              `- Make sure your GitHub account has an active Copilot subscription\n` +
              `- For enterprise accounts, contact your administrator to confirm access`,
          );
        }

        throw new Error(`GitHub Copilot API error: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      if (!response.body) {
        throw new Error("No response body");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || !trimmedLine.startsWith("data: ")) continue;

            const data = trimmedLine.slice(6);
            if (data === "[DONE]") return;

            try {
              const parsed = JSON.parse(data);
              const choice = parsed.choices?.[0];
              if (!choice) continue;

              const delta = choice.delta;
              if (delta?.content) {
                yield {
                  type: "text",
                  content: delta.content,
                };
              }

              // Handle tool calls
              if (delta?.tool_calls) {
                for (const toolCall of delta.tool_calls) {
                  if (toolCall.function?.name) {
                    yield {
                      type: "tool_call_start",
                      tool_call_id: toolCall.id,
                      tool_call_name: toolCall.function.name,
                    };
                  }
                  if (toolCall.function?.arguments) {
                    yield {
                      type: "tool_call_chunk",
                      tool_call_id: toolCall.id,
                      tool_call_arguments_chunk: toolCall.function.arguments,
                    };
                  }
                }
              }

              // Handle reasoning content (for o1 models)
              if (delta?.reasoning) {
                yield {
                  type: "reasoning",
                  reasoning_content: delta.reasoning,
                };
              }
            } catch (parseError) {
              console.warn("Failed to parse SSE data:", parseError);
            }
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (error) {
      if (signal?.aborted && signal.reason instanceof Error) {
        throw signal.reason;
      }
      console.error("GitHub Copilot stream error:", error);
      throw error;
    } finally {
      dispose();
    }
  }

  async completions(
    messages: ChatMessage[],
    modelId: string,
    temperature?: number,
    _maxTokens?: number,
  ): Promise<LLMResponse> {
    if (!modelId) throw new Error("Model ID is required");
    const modelConfig = this.configPresenter.getModelConfig(modelId, this.provider.id);
    const { signal, dispose } = this.createModelRequestSignal(modelConfig);
    try {
      const token = await this.getCopilotToken(signal);
      const formattedMessages = this.formatMessages(messages);

      const requestBody = {
        intent: true,
        n: 1,
        model: modelId,
        messages: formattedMessages,
        max_tokens: _maxTokens || 4096,
        stream: false,
        temperature: temperature ?? 0.7,
      };

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        "User-Agent": "Argos/1.0.0",
        "Editor-Version": "Argos/1.0.0",
        "Copilot-Integration-Id": "vscode-chat",
      };

      // Add detailed request logging
      console.log("📤 [GitHub Copilot] Sending completion request:");
      console.log(`   URL: ${this.baseApiUrl}/chat/completions`);
      console.log(`   Model: ${modelId}`);
      console.log(`   Headers: ${Object.keys(headers).join(", ")}`);
      console.log(
        `   Request Body: { messages: ${formattedMessages.length}, model: "${modelId}", temperature: ${temperature}, max_tokens: ${_maxTokens} }`,
      );

      const requestOptions: RequestInitWithAgent = {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        ...(signal ? { signal } : {}),
      };

      // Add proxy support
      const proxyUrl = proxyConfig.getProxyUrl();
      if (proxyUrl) {
        const agent = new HttpsProxyAgent(proxyUrl);
        requestOptions.agent = agent;
      }

      const response = await fetch(`${this.baseApiUrl}/chat/completions`, requestOptions);

      console.log("📥 [GitHub Copilot] Completion API Response:");
      console.log(`   Status: ${response.status} ${response.statusText}`);
      console.log(`   OK: ${response.ok}`);

      if (!response.ok) {
        let errorBody = "";
        try {
          errorBody = await response.text();
        } catch {
          // ignore
        }

        // Special handling for 403 errors
        if (response.status === 403) {
          throw new Error(
            `GitHub Copilot access denied (403).\n\nPossible causes:\n` +
              `1. The GitHub Copilot subscription is expired or not active\n` +
              `2. Re-authentication is required to obtain the correct access permissions\n` +
              `3. The API access policy has been updated; the latest authentication method is required\n` +
              `4. Your account may not have permission to access this API\n\n` +
              `Suggested solutions:\n` +
              `- Visit https://github.com/settings/copilot to check your subscription status\n` +
              `- Re-login to GitHub Copilot in the Argos settings\n` +
              `- Make sure your GitHub account has an active Copilot subscription\n` +
              `- For enterprise accounts, contact your administrator to confirm access`,
          );
        }

        throw new Error(`GitHub Copilot API error: ${response.status} ${response.statusText} - ${errorBody}`);
      }

      const data = await response.json();
      const choice = data.choices?.[0];

      if (!choice) {
        throw new Error("No response from GitHub Copilot");
      }

      const result: LLMResponse = {
        content: choice.message?.content || "",
      };

      // Handle reasoning content (for o1 models)
      if (choice.message?.reasoning) {
        result.reasoning_content = choice.message.reasoning;
      }

      return result;
    } catch (error) {
      if (signal?.aborted && signal.reason instanceof Error) {
        throw signal.reason;
      }
      console.error("GitHub Copilot completion error:", error);
      throw error;
    } finally {
      dispose();
    }
  }

  async summaries(text: string, modelId: string, temperature?: number, maxTokens?: number): Promise<LLMResponse> {
    if (!modelId) throw new Error("Model ID is required");
    return this.completions(
      [
        {
          role: "user",
          content: `Please summarize the following content in concise language, highlighting the key points:\n${text}`,
        },
      ],
      modelId,
      temperature,
      maxTokens,
    );
  }

  async generateText(prompt: string, modelId: string, temperature?: number, maxTokens?: number): Promise<LLMResponse> {
    return this.completions(
      [
        {
          role: "user",
          content: prompt,
        },
      ],
      modelId,
      temperature,
      maxTokens,
    );
  }

  async check(): Promise<{ isOk: boolean; errorMsg: string | null }> {
    try {
      // Device flow may be active without apiKey; proceed to token retrieval
      await this.getCopilotToken();
      return { isOk: true, errorMsg: null };
    } catch (error) {
      let errorMsg = error instanceof Error ? error.message : "Unknown error";

      // Analyze the error type and provide more specific guidance
      if (errorMsg.includes("404")) {
        errorMsg = `GitHub Copilot access denied (404). Please check:
1. Whether your GitHub account has an active GitHub Copilot subscription
2. Visit https://github.com/features/copilot to check your subscription status
3. If this is an organization account, ensure the organization has Copilot enabled and you have access`;
      } else if (errorMsg.includes("401")) {
        errorMsg = `GitHub OAuth token is invalid or expired (401). Please log in again and make sure the correct scopes are granted.`;
      } else if (errorMsg.includes("403")) {
        errorMsg = `GitHub Copilot access forbidden (403). Please check:
1. Whether your GitHub Copilot subscription is valid and active
2. Whether you have hit the API usage limit
3. Whether the OAuth token includes the 'read:org' scope
4. If this is an organization account, ensure the organization has Copilot enabled and you have access`;
      } else if (errorMsg.includes("fetch failed") || errorMsg.includes("network")) {
        errorMsg = `Network connection failed. Please check:
1. Whether your network connection is working
2. Whether your proxy settings are correct
3. Whether a firewall is blocking access to the GitHub API`;
      }

      return {
        isOk: false,
        errorMsg,
      };
    }
  }

  async summaryTitles(messages: ChatMessage[], modelId: string): Promise<string> {
    try {
      const response = await this.completions(
        [
          {
            role: "user",
            content: `${SUMMARY_TITLES_PROMPT}\n\n${messages.map((m) => `${m.role}: ${m.content}`).join("\n")}`,
          },
        ],
        modelId,
        0.7,
        50,
      );
      return response.content.trim();
    } catch (error) {
      console.error("Error generating summary title:", error);
      return "New conversation";
    }
  }
}
