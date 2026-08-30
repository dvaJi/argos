import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { type Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  ToolListChangedNotificationSchema,
  PromptListChangedNotificationSchema,
  ResourceListChangedNotificationSchema,
  ResourceUpdatedNotificationSchema,
  LoggingMessageNotificationSchema,
  CreateMessageRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import type { CreateMessageRequest, CreateMessageResult } from "@modelcontextprotocol/sdk/types.js";
import path from "path";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { terminateProcessTree } from "@argos/backend-core";
import type { ChildProcess } from "node:child_process";
import type { McpHostPorts } from "../host/ports";

const MCP_EVENTS = {
  CLIENT_LIST_UPDATED: "mcp:client-list-updated",
  SERVER_STATUS_CHANGED: "mcp:server-status-changed",
  TOOL_CALL_RESULT: "mcp:tool-call-result",
  SAMPLING_REQUEST: "mcp:sampling-request",
} as const;

import type {
  PromptListEntry,
  ToolCallResult,
  Tool,
  Prompt,
  ResourceListEntry,
  Resource,
  ChatMessage,
  McpSamplingRequestPayload,
  McpSamplingDecision,
} from "@argos/shared/presenter";

const ALLOWED_SAMPLING_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

// StdioClientTransport keeps the spawned agent child process on a private
// `_process` field. We access it to terminate the whole process tree on
// shutdown so stdio MCP servers do not outlive the app.
type StdioClientTransportProcessAccess = {
  _process?: ChildProcess;
};

// TODO: types for resources and prompts, types for Notifications https://github.com/modelcontextprotocol/typescript-sdk/blob/main/src/examples/client/simpleStreamableHttp.ts
// Simple OAuth provider for handling Bearer Token
class SimpleOAuthProvider {
  private token: string | null = null;

  constructor(authHeader: string | undefined) {
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      this.token = authHeader.substring(7); // Remove 'Bearer ' prefix
    }
  }

  async tokens(): Promise<{ access_token: string } | null> {
    if (this.token) {
      return { access_token: this.token };
    }
    return null;
  }
}

// Ensure TypeScript can recognize SERVER_STATUS_CHANGED property
// Session management related types
interface SessionError extends Error {
  httpStatus?: number;
  isSessionExpired?: boolean;
}

interface RequestHandlerContext {
  signal?: AbortSignal;
  requestId?: string | number;
  [key: string]: unknown;
}

// Optional capability probes (listTools/listPrompts/listResources) are best
// effort: a server that does not implement one should be treated as "no items"
// rather than a hard failure. Detect both structured MCP method-not-found
// errors and message-based variants so optional probes stay quiet.
function isUnsupportedCapabilityError(error: unknown): boolean {
  if (error instanceof McpError && error.code === ErrorCode.MethodNotFound) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /method not found|unknown method|not supported|unsupported|mcp error -32601/i.test(message);
}

// Helper function to check if error is session-related
function isSessionError(error: unknown): error is SessionError {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Check for specific MCP Streamable HTTP session error patterns
    const sessionErrorPatterns = [
      "no valid session",
      "session expired",
      "session not found",
      "invalid session",
      "session id",
      "mcp-session-id",
    ];

    const httpErrorPatterns = ["http 400", "http 404", "bad request", "not found"];

    // Check for session-specific errors first (high confidence)
    const hasSessionPattern = sessionErrorPatterns.some((pattern) => message.includes(pattern));
    if (hasSessionPattern) {
      return true;
    }

    // Check for HTTP errors that might be session-related (lower confidence)
    // Only treat as session error if it's an HTTP transport
    const hasHttpPattern = httpErrorPatterns.some((pattern) => message.includes(pattern));
    if (hasHttpPattern && (message.includes("posting") || message.includes("endpoint"))) {
      return true;
    }
  }
  return false;
}

// MCP client class
export class McpClient {
  private client: Client | null = null;
  private transport: Transport | null = null;
  public serverName: string;
  public serverConfig: Record<string, unknown>;
  private isConnected: boolean = false;
  private connectionTimeout: NodeJS.Timeout | null = null;
  private npmRegistry: string | null = null;
  private uvRegistry: string | null = null;
  private readonly ports: McpHostPorts;

  // Session management
  private isRecovering: boolean = false;
  private hasRestarted: boolean = false;

  // Cache
  private cachedTools: Tool[] | null = null;
  private cachedPrompts: PromptListEntry[] | null = null;
  private cachedResources: ResourceListEntry[] | null = null;

  constructor(
    serverName: string,
    serverConfig: Record<string, unknown>,
    ports: McpHostPorts,
    npmRegistry: string | null = null,
    uvRegistry: string | null = null,
  ) {
    this.serverName = serverName;
    this.serverConfig = serverConfig;
    this.ports = ports;
    this.npmRegistry = npmRegistry;
    this.uvRegistry = uvRegistry;
    this.ports.runtime.initializeRuntimes();
  }

  public processCommandWithArgs(command: string, args: string[]): { command: string; args: string[] } {
    this.ports.runtime.initializeRuntimes();
    return this.ports.runtime.processCommandWithArgs(command, args);
  }

  public expandPath(inputPath: string): string {
    return this.ports.runtime.expandPath(inputPath);
  }

  public get bunRuntimePath(): string | null {
    this.ports.runtime.initializeRuntimes();
    return this.ports.runtime.getBunRuntimePath();
  }

  public set bunRuntimePath(value: string | null) {
    this.ports.runtime.setBunRuntimePath(value);
  }

  public get uvRuntimePath(): string | null {
    this.ports.runtime.initializeRuntimes();
    return this.ports.runtime.getUvRuntimePath();
  }

  public set uvRuntimePath(value: string | null) {
    this.ports.runtime.setUvRuntimePath(value);
  }

  // Connect to MCP server
  async connect(): Promise<void> {
    if (this.isConnected && this.client) {
      console.info(`MCP server ${this.serverName} is already running`);
      return;
    }

    try {
      console.info(`Starting MCP server ${this.serverName}...`, this.serverConfig);

      // Handle customHeaders and AuthProvider
      let authProvider: SimpleOAuthProvider | null = null;
      const customHeaders = this.serverConfig.customHeaders
        ? { ...(this.serverConfig.customHeaders as Record<string, string>) } // Create copy for modification
        : {};

      if (customHeaders.Authorization) {
        authProvider = new SimpleOAuthProvider(customHeaders.Authorization);
        delete customHeaders.Authorization; // Remove from headers as it will be handled by AuthProvider
      }

      if (this.serverConfig.type === "inmemory") {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const _args = Array.isArray(this.serverConfig.args) ? this.serverConfig.args : [];
        const _env = this.serverConfig.env ? (this.serverConfig.env as Record<string, unknown>) : {};
        const _server = this.ports.services.getInMemoryServer?.(this.serverName, _args as never, _env as never);
        if (!_server) {
          throw new McpError(ErrorCode.InvalidParams, `In-memory MCP server not supported: ${this.serverName}`);
        }
        _server.startServer(serverTransport);
        this.transport = clientTransport;
      } else if (this.serverConfig.type === "stdio") {
        // Initialize runtime paths if not already done
        this.ports.runtime.initializeRuntimes();

        // Create appropriate transport
        let command = this.serverConfig.command as string;
        let args = this.serverConfig.args as string[];

        // Handle path expansion (including ~ and environment variables)
        command = this.ports.runtime.expandPath(command);
        args = args.map((arg) => this.ports.runtime.expandPath(arg));

        const HOME_DIR = this.ports.paths.homeDir();

        // Define allowed environment variables whitelist
        const allowedEnvVars = [
          "PATH",
          "path",
          "Path",
          "npm_config_registry",
          "npm_config_cache",
          "npm_config_prefix",
          "npm_config_tmp",
          "NPM_CONFIG_REGISTRY",
          "NPM_CONFIG_CACHE",
          "NPM_CONFIG_PREFIX",
          "NPM_CONFIG_TMP",
          // 'GRPC_PROXY',
          // 'grpc_proxy'
        ];

        // Fix env type issue
        const env: Record<string, string> = {};

        // Handle command and argument replacement
        const processedCommand = this.ports.runtime.processCommandWithArgs(command, args);
        command = processedCommand.command;
        args = processedCommand.args;

        // Determine if it's Node.js/UV related command
        const isNodeCommand = ["node", "npm", "npx", "uv", "uvx"].some(
          (cmd) => command.includes(cmd) || args.some((arg) => arg.includes(cmd)),
        );

        if (isNodeCommand) {
          // Node.js/UV commands use whitelist processing
          if (process.env) {
            const existingPaths: string[] = [];

            // Collect all PATH-related values
            Object.entries(process.env).forEach(([key, value]) => {
              if (value !== undefined) {
                if (["PATH", "Path", "path"].includes(key)) {
                  existingPaths.push(value);
                } else if (allowedEnvVars.includes(key) && !["PATH", "Path", "path"].includes(key)) {
                  env[key] = value;
                }
              }
            });

            // Get default paths
            const defaultPaths = this.ports.runtime.getDefaultPaths(HOME_DIR);

            // Merge all paths
            const allPaths = [...existingPaths, ...defaultPaths];
            // Add runtime paths
            const uvRuntimePath = this.ports.runtime.getUvRuntimePath();
            const bunRuntimePath = this.ports.runtime.getBunRuntimePath();
            if (process.platform === "win32") {
              // On Windows, only add node and uv paths
              if (uvRuntimePath) {
                allPaths.unshift(uvRuntimePath);
              }
              if (bunRuntimePath) {
                allPaths.unshift(bunRuntimePath);
              }
            } else {
              // Other platforms priority: node > uv
              if (uvRuntimePath) {
                allPaths.unshift(uvRuntimePath);
              }
              if (bunRuntimePath) {
                allPaths.unshift(path.dirname(bunRuntimePath));
              }
            }

            // Normalize and set PATH
            const { key, value } = this.ports.runtime.normalizePathEnv(allPaths);
            env[key] = value;
          }
        } else {
          // Non-Node.js/UV commands: keep all system env vars, only supplement PATH
          Object.entries(process.env).forEach(([key, value]) => {
            if (value !== undefined) {
              env[key] = value;
            }
          });

          // Supplement PATH
          const existingPaths: string[] = [];
          if (env.PATH) {
            existingPaths.push(env.PATH);
          }
          if (env.Path) {
            existingPaths.push(env.Path);
          }

          // Get default paths
          const defaultPaths = this.ports.runtime.getDefaultPaths(HOME_DIR);

          // Merge all paths
          const allPaths = [...existingPaths, ...defaultPaths];
          // Add runtime paths
          const uvRuntimePath = this.ports.runtime.getUvRuntimePath();
          const bunRuntimePath = this.ports.runtime.getBunRuntimePath();
          if (process.platform === "win32") {
            // On Windows, only add node and uv paths
            if (uvRuntimePath) {
              allPaths.unshift(uvRuntimePath);
            }
            if (bunRuntimePath) {
              allPaths.unshift(bunRuntimePath);
            }
          } else {
            // Other platforms priority: node > uv
            if (uvRuntimePath) {
              allPaths.unshift(uvRuntimePath);
            }
            if (bunRuntimePath) {
              allPaths.unshift(path.join(bunRuntimePath, "bin"));
            }
          }

          // Normalize and set PATH
          const { key, value } = this.ports.runtime.normalizePathEnv(allPaths);
          env[key] = value;
        }

        // Add custom environment variables
        if (this.serverConfig.env) {
          Object.entries(this.serverConfig.env as Record<string, unknown>).forEach(([key, value]) => {
            if (value !== undefined) {
              const stringValue = String(value ?? "");
              // If PATH-related, merge into the main PATH
              if (["PATH", "Path", "path"].includes(key)) {
                const currentPathKey = process.platform === "win32" ? "Path" : "PATH";
                const separator = process.platform === "win32" ? ";" : ":";
                env[currentPathKey] = env[currentPathKey]
                  ? `${stringValue}${separator}${env[currentPathKey]}`
                  : stringValue;
              } else {
                env[key] = stringValue;
              }
            }
          });
        }

        if (this.npmRegistry) {
          env.npm_config_registry = this.npmRegistry;
        }

        if (this.uvRegistry) {
          env.UV_DEFAULT_INDEX = this.uvRegistry;
          env.PIP_INDEX_URL = this.uvRegistry;
        }

        // console.log('mcp env', command, env, args)
        this.transport = new StdioClientTransport({
          command,
          args,
          env,
          stderr: "pipe",
        });
        (this.transport as StdioClientTransport).stderr?.on("data", (data) => {
          console.info("mcp StdioClientTransport error", this.serverName, data.toString());
        });
      } else if (this.serverConfig.baseUrl && this.serverConfig.type === "sse") {
        this.transport = new SSEClientTransport(new URL(this.serverConfig.baseUrl as string), {
          requestInit: { headers: customHeaders },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          authProvider: (authProvider ?? undefined) as any,
        });
      } else if (this.serverConfig.baseUrl && this.serverConfig.type === "http") {
        this.transport = new StreamableHTTPClientTransport(new URL(this.serverConfig.baseUrl as string), {
          requestInit: { headers: customHeaders },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          authProvider: (authProvider ?? undefined) as any,
        });
      } else {
        throw new Error(`Unsupported transport type: ${this.serverConfig.type}`);
      }

      // Create MCP client
      this.client = new Client(
        { name: "Argos", version: this.ports.paths.appVersion() },
        {
          capabilities: {
            sampling: {},
          },
        },
      );

      // Set up notification handler
      this.registerNotificationHandlers();

      // Register sampling request handler
      this.client.setRequestHandler(CreateMessageRequestSchema, async (request, extra) => {
        return this.handleSamplingCreateMessage(request, extra);
      });

      // Set connection timeout
      const timeoutPromise = new Promise<void>((_, reject) => {
        this.connectionTimeout = setTimeout(
          () => {
            console.error(`Connection to MCP server ${this.serverName} timed out`);
            reject(new Error(`Connection to MCP server ${this.serverName} timed out`));
          },
          5 * 60 * 1000,
        ); // 5 minutes
      });

      // Connect to the server
      const connectPromise = this.client
        .connect(this.transport)
        .then(() => {
          // Clear timeout
          if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
          }

          this.isConnected = true;
          console.info(`MCP server ${this.serverName} connected successfully`);

          // Emit server status change event
          this.ports.events.broadcast(MCP_EVENTS.SERVER_STATUS_CHANGED, {
            name: this.serverName,
            status: "running",
          });
        })
        .catch((error) => {
          console.error(`Failed to connect to MCP server ${this.serverName}:`, error);
          throw error;
        });

      // Wait for connection to complete or time out
      await Promise.race([connectPromise, timeoutPromise]);
    } catch (error) {
      // Clear timeout
      if (this.connectionTimeout) {
        clearTimeout(this.connectionTimeout);
        this.connectionTimeout = null;
      }

      // Clean up resources
      await this.cleanupResources();

      console.error(`Failed to connect to MCP server ${this.serverName}:`, error);

      // Emit server status change event
      this.ports.events.broadcast(MCP_EVENTS.SERVER_STATUS_CHANGED, {
        name: this.serverName,
        status: "stopped",
      });

      throw error;
    }
  }

  // Disconnect from the MCP server
  async disconnect(): Promise<void> {
    if (!this.isConnected || !this.client) {
      return;
    }

    try {
      // Use internal disconnect method for normal disconnection
      await this.internalDisconnect();
    } catch (error) {
      console.error(`Failed to disconnect from MCP server ${this.serverName}:`, error);
      throw error;
    }
  }

  // Clean up resources
  private async cleanupResources(): Promise<void> {
    // Clear timeout timer
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    // Close transport. Null the reference first so concurrent callers don't
    // double-close; terminate the stdio child process tree before closing.
    const transport = this.transport;
    this.transport = null;
    if (transport) {
      try {
        await this.closeTransport(transport);
      } catch (error) {
        console.error(`Failed to close MCP transport:`, error);
      }
    }

    // Reset state
    this.client = null;
    this.isConnected = false;

    // Clear cache
    this.cachedTools = null;
    this.cachedPrompts = null;
    this.cachedResources = null;
  }

  // Terminate the stdio child process tree (if any) before closing the
  // transport, so quitting the app does not orphan stdio MCP servers.
  private async closeTransport(transport: Transport): Promise<void> {
    try {
      if (transport instanceof StdioClientTransport) {
        const child = (transport as unknown as StdioClientTransportProcessAccess)._process;
        if (child) {
          await terminateProcessTree(child, { graceMs: 2000 });
        }
      }
    } catch (error) {
      console.error(`Failed to terminate MCP stdio process tree for ${this.serverName}:`, error);
    }

    await transport.close();
  }

  // Register notification handlers
  private registerNotificationHandlers(): void {
    if (!this.client) {
      return;
    }

    // Tool list changed notification - clear tool cache and actively refresh
    this.client.setNotificationHandler(ToolListChangedNotificationSchema, async () => {
      console.info(`[MCP] Tools list changed for server: ${this.serverName}`);
      this.cachedTools = null;
      // Actively refresh tool list
      try {
        await this.listTools();
      } catch (error) {
        console.warn(`[MCP] Failed to refresh tools after notification:`, error);
      }
    });

    // Prompt list changed notification - clear prompt cache and actively refresh
    this.client.setNotificationHandler(PromptListChangedNotificationSchema, async () => {
      console.info(`[MCP] Prompts list changed for server: ${this.serverName}`);
      this.cachedPrompts = null;
      // Actively refresh prompt list
      try {
        await this.listPrompts();
      } catch (error) {
        console.warn(`[MCP] Failed to refresh prompts after notification:`, error);
      }
    });

    // Resource list changed notification - clear resource cache and actively refresh
    this.client.setNotificationHandler(ResourceListChangedNotificationSchema, async () => {
      console.info(`[MCP] Resources list changed for server: ${this.serverName}`);
      this.cachedResources = null;
      // Actively refresh resource list
      try {
        await this.listResources();
      } catch (error) {
        console.warn(`[MCP] Failed to refresh resources after notification:`, error);
      }
    });

    // Resource updated notification - clear resource cache and actively refresh
    this.client.setNotificationHandler(ResourceUpdatedNotificationSchema, async (params) => {
      console.info(`[MCP] Resource updated for server: ${this.serverName}`, params);
      this.cachedResources = null;
      // Actively refresh resource list
      try {
        await this.listResources();
      } catch (error) {
        console.warn(`[MCP] Failed to refresh resources after update notification:`, error);
      }
    });

    // Logging message notification - just log the message
    this.client.setNotificationHandler(LoggingMessageNotificationSchema, async (params) => {
      console.info(`[MCP] Log message from server ${this.serverName}:`, params);
    });
  }

  private async handleSamplingCreateMessage(
    request: CreateMessageRequest,
    extra: RequestHandlerContext,
  ): Promise<CreateMessageResult> {
    const params = request.params ?? {};
    const requestId = this.resolveSamplingRequestId(extra);
    const { payload, chatMessages } = this.prepareSamplingContext(requestId, params);

    const decisionPromise = this.ports.services.handleSamplingRequest!(payload) as Promise<McpSamplingDecision>;
    const signal = extra?.signal as AbortSignal | undefined;

    let decision: McpSamplingDecision;
    if (signal) {
      decision = await new Promise<McpSamplingDecision>((resolve, reject) => {
        const onAbort = () => {
          signal.removeEventListener("abort", onAbort);
          void this.ports.services
            .cancelSamplingRequest!(payload.requestId, "cancelled by server")
            .catch((error) => {
              console.warn(`[MCP] Failed to cancel sampling request ${payload.requestId}:`, error);
            });
          reject(new McpError(ErrorCode.RequestTimeout, "Sampling request cancelled"));
        };

        if (signal.aborted) {
          onAbort();
          return;
        }

        signal.addEventListener("abort", onAbort, { once: true });
        decisionPromise
          .then((value) => {
            signal.removeEventListener("abort", onAbort);
            resolve(value);
          })
          .catch((error) => {
            signal.removeEventListener("abort", onAbort);
            reject(error);
          });
      });
    } else {
      decision = await decisionPromise;
    }

    if (!decision.approved) {
      throw new McpError(ErrorCode.InvalidRequest, "User rejected sampling request");
    }

    if (!decision.providerId || !decision.modelId) {
      throw new McpError(ErrorCode.InvalidParams, "No model selected for sampling request");
    }

    let assistantText = "";
    try {
      assistantText = await (
        this.ports.services.generateCompletionStandalone as (...args: unknown[]) => Promise<string>
      )(
        decision.providerId,
        chatMessages,
        decision.modelId,
        undefined,
        params.maxTokens,
      );
    } catch (error) {
      console.error(`[MCP] Sampling request failed for server ${this.serverName}:`, error);
      throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : "Sampling request failed");
    }

    const modelName = this.resolveModelDisplayName(decision.providerId, decision.modelId) ?? decision.modelId;

    const result: CreateMessageResult = {
      role: "assistant",
      model: modelName,
      stopReason: "endTurn",
      content: {
        type: "text",
        text: assistantText ?? "",
      },
    };

    return result;
  }

  private resolveSamplingRequestId(extra: RequestHandlerContext): string {
    const rawId = extra?.requestId;
    if (typeof rawId === "string" || typeof rawId === "number") {
      return String(rawId);
    }

    return `${this.serverName}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private prepareSamplingContext(
    requestId: string,
    params: CreateMessageRequest["params"],
  ): { payload: McpSamplingRequestPayload; chatMessages: ChatMessage[] } {
    const payload: McpSamplingRequestPayload = {
      requestId,
      serverName: this.serverName,
      serverLabel: this.getServerLabel(),
      systemPrompt: typeof params?.systemPrompt === "string" ? params.systemPrompt : undefined,
      maxTokens: typeof params?.maxTokens === "number" ? params.maxTokens : undefined,
      modelPreferences: this.normalizeModelPreferences(params?.modelPreferences),
      requiresVision: false,
      messages: [],
    };

    const chatMessages: ChatMessage[] = [];

    if (payload.systemPrompt) {
      chatMessages.push({ role: "system", content: payload.systemPrompt });
    }

    const messageList = Array.isArray(params?.messages) ? params.messages : [];

    for (const message of messageList) {
      if (!message || (message.role !== "user" && message.role !== "assistant")) {
        continue;
      }

      const rawContent = message.content;
      if (!rawContent || typeof rawContent !== "object" || !("type" in rawContent)) {
        throw new McpError(ErrorCode.InvalidParams, "Invalid sampling message content received");
      }

      const content = rawContent as { type: string } & Record<string, unknown>;

      if (content.type === "text") {
        const text = typeof content.text === "string" ? content.text : "";
        payload.messages.push({ role: message.role, type: "text", text });
        chatMessages.push({ role: message.role, content: text });
      } else if (content.type === "image") {
        const rawMimeType = typeof content.mimeType === "string" ? content.mimeType : undefined;
        const normalizedMimeType = rawMimeType?.toLowerCase();

        if (normalizedMimeType && !ALLOWED_SAMPLING_IMAGE_MIME_TYPES.has(normalizedMimeType)) {
          throw new McpError(ErrorCode.InvalidParams, `Unsupported sampling image mime type: ${rawMimeType}`);
        }

        const mimeType = normalizedMimeType ?? "image/png";
        const data = this.sanitizeSamplingImageData(content.data);
        const dataUrl = `data:${mimeType};base64,${data}`;
        payload.messages.push({
          role: message.role,
          type: "image",
          dataUrl,
          mimeType,
        });
        payload.requiresVision = true;
        chatMessages.push({
          role: message.role,
          content: [
            {
              type: "image_url",
              image_url: { url: dataUrl, detail: "auto" as const },
            },
          ],
        });
      } else if (content.type === "audio") {
        throw new McpError(ErrorCode.InvalidParams, "Audio sampling content is not supported by this client");
      } else {
        throw new McpError(
          ErrorCode.InvalidParams,
          `Unsupported sampling content type: ${String((content as { type?: unknown }).type)}`,
        );
      }
    }

    return { payload, chatMessages };
  }

  private sanitizeSamplingImageData(rawData: unknown): string {
    if (typeof rawData !== "string") {
      throw new McpError(ErrorCode.InvalidParams, "Invalid sampling image payload received");
    }

    const sanitized = rawData.replace(/\s+/g, "");

    if (!sanitized) {
      throw new McpError(ErrorCode.InvalidParams, "Invalid sampling image payload received");
    }

    if (sanitized.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(sanitized)) {
      throw new McpError(ErrorCode.InvalidParams, "Invalid sampling image payload received");
    }

    let decoded: Buffer;

    try {
      decoded = Buffer.from(sanitized, "base64");
    } catch {
      throw new McpError(ErrorCode.InvalidParams, "Invalid sampling image payload received");
    }

    if (!decoded.length) {
      throw new McpError(ErrorCode.InvalidParams, "Invalid sampling image payload received");
    }

    const reencoded = decoded.toString("base64");

    if (reencoded.replace(/=+$/, "") !== sanitized.replace(/=+$/, "")) {
      throw new McpError(ErrorCode.InvalidParams, "Invalid sampling image payload received");
    }

    return sanitized;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private normalizeModelPreferences(preferences: any): McpSamplingRequestPayload["modelPreferences"] {
    if (!preferences || typeof preferences !== "object") {
      return undefined;
    }

    const normalized: McpSamplingRequestPayload["modelPreferences"] = {};

    if (typeof preferences.costPriority === "number") {
      normalized.costPriority = preferences.costPriority;
    }
    if (typeof preferences.speedPriority === "number") {
      normalized.speedPriority = preferences.speedPriority;
    }
    if (typeof preferences.intelligencePriority === "number") {
      normalized.intelligencePriority = preferences.intelligencePriority;
    }
    if (Array.isArray(preferences.hints)) {
      normalized.hints = preferences.hints.map((hint: { name?: unknown }) => ({
        name: typeof hint?.name === "string" ? hint.name : undefined,
      }));
    }

    if (
      normalized.costPriority === undefined &&
      normalized.speedPriority === undefined &&
      normalized.intelligencePriority === undefined &&
      (!normalized.hints || normalized.hints.length === 0)
    ) {
      return undefined;
    }

    return normalized;
  }

  private getServerLabel(): string | undefined {
    const config = this.serverConfig;
    if (!config) {
      return undefined;
    }

    const candidates: Array<string | undefined> = [
      typeof config["descriptions"] === "string" ? (config["descriptions"] as string) : undefined,
      typeof config["description"] === "string" ? (config["description"] as string) : undefined,
      typeof config["name"] === "string" ? (config["name"] as string) : undefined,
    ];

    return candidates.find((label) => label && label.trim().length > 0);
  }

  private resolveModelDisplayName(providerId: string, modelId: string): string | undefined {
    try {
      const models = (this.ports.services.getProviderModels?.(providerId) as Array<{ id?: string; name?: string }>) || [];
      const match = models.find((model) => model.id === modelId);
      if (match?.name) {
        return match.name;
      }

      const customModels = (this.ports.services.getCustomModels?.(providerId) as Array<{ id?: string; name?: string }>) || [];
      const customMatch = customModels.find((model) => model.id === modelId);
      if (customMatch?.name) {
        return customMatch.name;
      }
    } catch (error) {
      console.warn(`[MCP] Failed to resolve model display name for ${providerId}/${modelId}:`, error);
    }

    return undefined;
  }

  // Check if the server is running
  isServerRunning(): boolean {
    return this.isConnected && !!this.client;
  }

  // Check and handle session errors by restarting the service
  private async checkAndHandleSessionError(error: unknown): Promise<void> {
    if (isSessionError(error) && !this.isRecovering) {
      // If already restarted once and still getting session errors, stop the service
      if (this.hasRestarted) {
        console.error(`Session error persists after restart for server ${this.serverName}, stopping service...`, error);
        await this.stopService();
        throw new Error(
          `MCP service ${this.serverName} still has session errors after restart, service has been stopped`,
        );
      }

      console.warn(`Session error detected for server ${this.serverName}, restarting service...`, error);

      this.isRecovering = true;

      try {
        // Clean up current connection
        await this.cleanupResources();

        // Clear all caches to ensure fresh data after reconnection
        this.cachedTools = null;
        this.cachedPrompts = null;
        this.cachedResources = null;

        // Mark as restarted
        this.hasRestarted = true;

        console.info(`Service ${this.serverName} restarted due to session error`);
      } catch (restartError) {
        console.error(`Failed to restart service ${this.serverName}:`, restartError);
      } finally {
        this.isRecovering = false;
      }
    }
  }

  // Stop the service completely due to persistent session errors
  private async stopService(): Promise<void> {
    try {
      // Use the same disconnect logic but with different reason
      await this.internalDisconnect("persistent session errors");
    } catch (error) {
      console.error(`Failed to stop service ${this.serverName}:`, error);
    }
  }

  // Internal disconnect with custom reason
  private async internalDisconnect(reason?: string): Promise<void> {
    // Clean up all resources
    await this.cleanupResources();

    const logMessage = reason
      ? `MCP service ${this.serverName} has been stopped due to ${reason}`
      : `Disconnected from MCP server: ${this.serverName}`;

    console.log(logMessage);

    // Trigger server status changed event to notify the system
    this.ports.events.broadcast(MCP_EVENTS.SERVER_STATUS_CHANGED, {
      name: this.serverName,
      status: "stopped",
    });
  }

  // Call MCP tool
  async callTool(toolName: string, args: Record<string, unknown>): Promise<ToolCallResult> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      if (!this.client) {
        throw new Error(`MCP client ${this.serverName} not initialized`);
      }

      // Call the tool
      const result = (await this.client.callTool({
        name: toolName,
        arguments: args,
      })) as ToolCallResult;

      // Reset restart flag on successful call
      this.hasRestarted = false;

      // Check result
      if (result.isError) {
        const errorText = result.content && result.content[0] ? result.content[0].text : "Unknown error";
        // If the call fails, clear the tool cache so it is re-fetched next time
        this.cachedTools = null;
        return {
          isError: true,
          content: [{ type: "error", text: errorText }],
        };
      }
      return result;
    } catch (error) {
      // Check and handle session errors
      await this.checkAndHandleSessionError(error);

      console.error(`Failed to call MCP tool ${toolName}:`, error);
      // Call failed, clear the tool cache
      this.cachedTools = null;
      throw error;
    }
  }

  // List available tools
  async listTools(): Promise<Tool[]> {
    // Check cache
    if (this.cachedTools !== null) {
      return this.cachedTools;
    }

    try {
      if (!this.isConnected) {
        await this.connect();
      }

      if (!this.client) {
        throw new Error(`MCP client ${this.serverName} not initialized`);
      }

      const response = await this.client.listTools();
      // Reset restart flag on successful call
      this.hasRestarted = false;

      // Check response format
      if (response && typeof response === "object" && "tools" in response) {
        const toolsArray = response.tools;
        if (Array.isArray(toolsArray)) {
          // Cache results
          this.cachedTools = toolsArray as Tool[];
          return this.cachedTools;
        }
      }
      throw new Error("Invalid tool response format");
    } catch (error) {
      // Check and handle session errors
      await this.checkAndHandleSessionError(error);

      // If the error indicates unsupported, cache an empty array
      if (isUnsupportedCapabilityError(error)) {
        console.info(`Server ${this.serverName} does not support listTools`);
        this.cachedTools = [];
        return this.cachedTools;
      } else {
        console.error(`Failed to list MCP tools:`, error);
        // Other errors occurred; do not clear cache (keep null) for retry next time
        throw error;
      }
    }
  }

  // List available prompts
  async listPrompts(): Promise<PromptListEntry[]> {
    // Check cache
    if (this.cachedPrompts !== null) {
      return this.cachedPrompts;
    }

    try {
      if (!this.isConnected) {
        await this.connect();
      }

      if (!this.client) {
        throw new Error(`MCP client ${this.serverName} not initialized`);
      }

      // SDK may not have a listPrompts method; use generic request
      const response = await this.client.listPrompts();

      // Reset restart flag on successful call
      this.hasRestarted = false;

      // Check response format
      if (response && typeof response === "object" && "prompts" in response) {
        const promptsArray = (response as { prompts: unknown }).prompts;
        // console.log('promptsArray', JSON.stringify(promptsArray, null, 2))
        if (Array.isArray(promptsArray)) {
          // Ensure each element conforms to the Prompt interface
          const validPrompts = promptsArray.map((p) => ({
            name: typeof p === "object" && p !== null && "name" in p ? String(p.name) : "unknown",
            description: typeof p === "object" && p !== null && "description" in p ? String(p.description) : undefined,
            arguments: typeof p === "object" && p !== null && "arguments" in p ? p.arguments : undefined,
            files: typeof p === "object" && p !== null && "files" in p ? p.files : undefined,
          })) as PromptListEntry[];
          // Cache results
          this.cachedPrompts = validPrompts;
          return this.cachedPrompts;
        }
      }
      throw new Error("Invalid prompt response format");
    } catch (error) {
      // Check and handle session errors
      await this.checkAndHandleSessionError(error);

      // If the error indicates unsupported, cache an empty array
      if (isUnsupportedCapabilityError(error)) {
        console.info(`Server ${this.serverName} does not support listPrompts`);
        this.cachedPrompts = [];
        return this.cachedPrompts;
      } else {
        console.error(`Failed to list MCP prompts:`, error);
        // Other errors occurred; do not clear cache (keep null) for retry next time
        throw error;
      }
    }
  }

  // Get a specific prompt
  async getPrompt(name: string, args?: Record<string, unknown>): Promise<Prompt> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      if (!this.client) {
        throw new Error(`MCP client ${this.serverName} not initialized`);
      }

      const response = await this.client.getPrompt({
        name,
        arguments: (args as Record<string, string>) || {},
      });

      // Reset restart flag on successful call
      this.hasRestarted = false;

      // Check response format and convert to Prompt type
      if (response && typeof response === "object" && "messages" in response && Array.isArray(response.messages)) {
        return {
          id: name,
          name: name, // Get name from request parameters
          description: response.description || "",
          messages: response.messages as Array<{ role: string; content: { text: string } }>,
        };
      }
      throw new Error("Invalid get prompt response format");
    } catch (error) {
      // Check and handle session errors
      await this.checkAndHandleSessionError(error);

      console.error(`Failed to get MCP prompt ${name}:`, error);
      // Get failed, clear prompt cache
      this.cachedPrompts = null;
      throw error;
    }
  }

  // List available resources
  async listResources(): Promise<ResourceListEntry[]> {
    // Check cache
    if (this.cachedResources !== null) {
      return this.cachedResources;
    }

    try {
      if (!this.isConnected) {
        await this.connect();
      }

      if (!this.client) {
        throw new Error(`MCP client ${this.serverName} not initialized`);
      }

      // SDK may not have a listResources method; use generic request
      const response = await this.client.listResources();

      // Reset restart flag on successful call
      this.hasRestarted = false;

      // Check response format
      if (response && typeof response === "object" && "resources" in response) {
        const resourcesArray = (response as { resources: unknown }).resources;
        if (Array.isArray(resourcesArray)) {
          // Ensure each element conforms to the ResourceListEntry interface
          const validResources = resourcesArray.map((r) => ({
            uri: typeof r === "object" && r !== null && "uri" in r ? String(r.uri) : "unknown",
            name: typeof r === "object" && r !== null && "name" in r ? String(r.name) : undefined,
          })) as ResourceListEntry[];
          // Cache results
          this.cachedResources = validResources;
          return this.cachedResources;
        }
      }
      throw new Error("Invalid resource list response format");
    } catch (error) {
      // Check and handle session errors
      await this.checkAndHandleSessionError(error);

      // If the error indicates unsupported, cache an empty array
      if (isUnsupportedCapabilityError(error)) {
        console.info(`Server ${this.serverName} does not support listResources`);
        this.cachedResources = [];
        return this.cachedResources;
      } else {
        console.error(`Failed to list MCP resources:`, error);
        // Other errors occurred; do not clear cache (keep null) for retry next time
        throw error;
      }
    }
  }

  // Read resource
  async readResource(resourceUri: string): Promise<Resource> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      if (!this.client) {
        throw new Error(`MCP client ${this.serverName} not initialized`);
      }

      // Use unknown as intermediate type for conversion
      const rawResource = await this.client.readResource({ uri: resourceUri });

      // Reset restart flag on successful call
      this.hasRestarted = false;

      // Manually construct Resource object
      const resource: Resource = {
        uri: resourceUri,
        text:
          typeof rawResource === "object" && rawResource !== null && "text" in rawResource
            ? String(rawResource["text"])
            : JSON.stringify(rawResource),
      };

      return resource;
    } catch (error) {
      // Check and handle session errors
      await this.checkAndHandleSessionError(error);

      console.error(`Failed to read MCP resource ${resourceUri}:`, error);
      // Read failed, clear resource cache
      this.cachedResources = null;
      throw error;
    }
  }
}

// Factory function to create MCP client
export async function createMcpClient(
  serverName: string,
  ports: McpHostPorts,
): Promise<McpClient> {
  // Get MCP server config from the host
  const servers = await ports.services.getMcpServers();

  // Get server config
  const serverConfig = servers[serverName];
  if (!serverConfig) {
    throw new Error(`MCP server ${serverName} not found in configuration`);
  }

  // Create and return MCP client, passing null as npmRegistry
  // Note: this function should only be used when directly creating client instances
  // Normally, creation should go through ServerManager to use the tested npm registry
  return new McpClient(serverName, serverConfig as unknown as Record<string, unknown>, ports, null);
}
