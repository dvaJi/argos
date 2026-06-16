import { app, BrowserWindow } from "electron";
import { presenter } from "@/presenter";
import { IDeeplinkPresenter, MCPServerConfig } from "@shared/presenter";
import path from "path";
import { NOTIFICATION_EVENTS, SETTINGS_EVENTS, DEEPLINK_EVENTS, MCP_EVENTS, WINDOW_EVENTS } from "@/events";
import { eventBus, SendTarget } from "@/eventbus";
import { consumeStartupDeepLink } from "@/lib/startupDeepLink";
import {
  PROVIDER_INSTALL_VERSION,
  isProviderInstallCustomType,
  maskApiKey,
  type ProviderInstallDeeplinkPayload,
  type ProviderInstallPreview,
} from "@shared/providerDeeplink";

interface MCPInstallConfig {
  mcpServers: Record<
    string,
    {
      command?: string;
      args?: string[];
      env?: Record<string, string> | string;
      descriptions?: string;
      icons?: string;
      autoApprove?: string[];
      disable?: boolean;
      url?: string;
      type?: "sse" | "stdio" | "http";
    }
  >;
}

/**
 * DeeplinkPresenter class
 * Handles argos:// protocol links
 * argos://start launches the app and opens the default new chat view
 * argos://start?msg=hello launches the app, opens the new chat view, and pre-fills the default message
 * argos://start?msg=hello&model=deepseek-chat launches the app, opens the new chat view, pre-fills the default message, and resolves the model by exact match first (selects the first hit). On no exact match, falls back to fuzzy match (first model containing the field). If neither matches, the default is used.
 * argos://mcp/install?json=base64JSONData installs MCP directly from JSON data
 */
export class DeeplinkPresenter implements IDeeplinkPresenter {
  private startupUrl: string | null = null;
  private pendingMcpInstallUrl: string | null = null;

  init(): void {
    const startupDeepLinkUrl = consumeStartupDeepLink();
    if (startupDeepLinkUrl) {
      console.log("Found startup deeplink URL:", this.redactDeepLinkUrlForLog(startupDeepLinkUrl));
      this.startupUrl = startupDeepLinkUrl;
    }

    // Register protocol handler
    if (process.defaultApp) {
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient("argos", process.execPath, [path.resolve(process.argv[1])]);
      }
    } else {
      app.setAsDefaultProtocolClient("argos");
    }

    // Listen for window content loaded event
    eventBus.once(WINDOW_EVENTS.FIRST_CONTENT_LOADED, () => {
      console.log("Window content loaded. Processing DeepLink if exists.");
      if (this.startupUrl) {
        console.log("Processing startup URL:", this.redactDeepLinkUrlForLog(this.startupUrl));
        void this.handleDeepLink(this.startupUrl);
        this.startupUrl = null;
      }
    });

    // Listen for MCP initialized event
    eventBus.on(MCP_EVENTS.INITIALIZED, () => {
      console.log("MCP initialized. Processing pending MCP install if exists.");
      if (this.pendingMcpInstallUrl) {
        console.log("Processing pending MCP install URL:", this.redactDeepLinkUrlForLog(this.pendingMcpInstallUrl));
        void this.handleDeepLink(this.pendingMcpInstallUrl);
        this.pendingMcpInstallUrl = null;
      }
    });
  }

  async handleDeepLink(url: string): Promise<void> {
    try {
      const urlObj = new URL(url);
      console.log("Received DeepLink:", this.redactDeepLinkUrlForLog(url));

      if (urlObj.protocol !== "argos:") {
        console.error("Unsupported protocol:", urlObj.protocol);
        return;
      }

      const rawPath = [urlObj.hostname, urlObj.pathname.replace(/^\/+/, "")]
        .filter((segment) => segment.length > 0)
        .join("/");
      const [command = "", subCommand = ""] = rawPath.split("/");

      console.log("Parsed deeplink - command:", command, "subCommand:", subCommand);

      if (command === "mcp" && subCommand === "install" && !presenter.mcpPresenter.isReady()) {
        console.log("MCP not ready yet, saving MCP install URL for later");
        this.pendingMcpInstallUrl = url;
        return;
      }

      // Handle different commands
      if (command === "start") {
        await this.handleStart(urlObj.searchParams);
      } else if (command === "mcp") {
        // Handle mcp/install command
        if (subCommand === "install") {
          await this.handleMcpInstall(urlObj.searchParams);
        } else {
          console.warn("Unknown MCP subcommand:", subCommand);
        }
      } else if (command === "provider") {
        if (subCommand === "install") {
          await this.handleProviderInstall(urlObj.searchParams);
        } else {
          console.warn("Unknown provider subcommand:", subCommand);
        }
      } else {
        console.warn("Unknown DeepLink command:", command);
      }
    } catch (error) {
      console.error("Error processing DeepLink:", error);
    }
  }

  async handleStart(params: URLSearchParams): Promise<void> {
    console.log("Processing start command, parameters:", this.redactSearchParamsForLog(params));

    let msg = params.get("msg");
    if (!msg) {
      return;
    }

    // Security: Validate and sanitize message content
    msg = this.sanitizeMessageContent(decodeURIComponent(msg));
    if (!msg) {
      console.warn("Message content was rejected by security filters");
      return;
    }

    // If a model parameter is provided, try to set it
    let modelId = params.get("model");
    if (modelId && modelId.trim() !== "") {
      modelId = this.sanitizeStringParameter(decodeURIComponent(modelId));
    }

    let systemPrompt = params.get("system");
    if (systemPrompt && systemPrompt.trim() !== "") {
      systemPrompt = this.sanitizeStringParameter(decodeURIComponent(systemPrompt));
    } else {
      systemPrompt = "";
    }

    let mentions: string[] = [];
    const mentionsParam = params.get("mentions");
    if (mentionsParam && mentionsParam.trim() !== "") {
      mentions = decodeURIComponent(mentionsParam)
        .split(",")
        .map((mention) => this.sanitizeStringParameter(mention.trim()))
        .filter((mention) => mention.length > 0);
    }

    // SECURITY: Disable auto-send functionality to prevent abuse
    // The yolo parameter has been removed for security reasons
    const autoSend = false;
    console.log("msg:", msg);
    console.log("modelId:", modelId);
    console.log("systemPrompt:", systemPrompt);
    console.log("autoSend:", autoSend, "(disabled for security)");

    const targetWindow = await this.resolveChatWindow();
    if (!targetWindow) {
      console.error("Failed to resolve chat window for start deeplink");
      return;
    }

    await this.ensureChatWindowReady(targetWindow.id);
    presenter.windowPresenter.sendToWindow(targetWindow.id, DEEPLINK_EVENTS.START, {
      msg,
      modelId,
      systemPrompt,
      mentions,
      autoSend,
    });
  }

  private async resolveChatWindow(): Promise<BrowserWindow | null> {
    const appWindows = presenter.windowPresenter.getAllWindows();
    const focusedWindow = presenter.windowPresenter.getFocusedWindow();
    const focusedChatWindow =
      focusedWindow && appWindows.some((window) => window.id === focusedWindow.id) ? focusedWindow : null;

    let targetWindow: BrowserWindow | null | undefined = focusedChatWindow ?? appWindows[0];

    if (!targetWindow) {
      const windowId = await presenter.windowPresenter.createAppWindow({
        initialRoute: "chat",
      });
      if (windowId == null) {
        return null;
      }
      targetWindow = BrowserWindow.fromId(windowId) ?? null;
    }

    if (!targetWindow || targetWindow.isDestroyed()) {
      return null;
    }

    if (targetWindow.isMinimized()) {
      targetWindow.restore();
    }
    targetWindow.show();
    targetWindow.focus();
    return targetWindow;
  }

  /**
   * Ensure the active chat window is ready to receive the deeplink payload.
   * @param windowId Window ID
   */
  private async ensureChatWindowReady(windowId: number): Promise<void> {
    try {
      const targetWindow = BrowserWindow.fromId(windowId);
      if (!targetWindow || targetWindow.isDestroyed()) {
        return;
      }

      if (targetWindow.webContents.isLoadingMainFrame()) {
        await new Promise<void>((resolve) => {
          targetWindow.webContents.once("did-finish-load", () => resolve());
        });
      }
    } catch (error) {
      console.error("Error ensuring chat window ready:", error);
    }
  }

  async handleMcpInstall(params: URLSearchParams): Promise<void> {
    console.log("Processing mcp/install command, parameters:", this.redactSearchParamsForLog(params));

    // Get JSON data
    const jsonBase64 = params.get("code");
    if (!jsonBase64) {
      console.error("Missing 'code' parameter");
      return;
    }

    console.log("Found code parameter, processing MCP config");

    try {
      // Decode Base64 and parse JSON
      const jsonString = Buffer.from(jsonBase64, "base64").toString("utf-8");
      const mcpConfig = JSON.parse(jsonString) as MCPInstallConfig;

      console.log("Parsed MCP config:", this.redactValueForLog(mcpConfig));

      // Check if MCP config is valid
      if (!mcpConfig || !mcpConfig.mcpServers) {
        console.error("Invalid MCP configuration: missing mcpServers field");
        return;
      }

      // Prepare complete MCP configuration for all servers
      const completeMcpConfig: { mcpServers: Record<string, any> } = { mcpServers: {} };

      // Iterate and install all MCP servers
      for (const [serverName, serverConfig] of Object.entries(mcpConfig.mcpServers)) {
        let determinedType: "sse" | "stdio" | null = null;
        const determinedCommand: string | undefined = serverConfig.command;
        const determinedUrl: string | undefined = serverConfig.url;

        // 1. Check explicit type
        if (serverConfig.type) {
          if (serverConfig.type === "stdio" || serverConfig.type === "sse") {
            determinedType = serverConfig.type;
            // Validate required fields based on explicit type
            if (determinedType === "stdio" && !determinedCommand) {
              console.error(`Server ${serverName} is type 'stdio' but missing required 'command' field`);
              continue;
            }
            if (determinedType === "sse" && !determinedUrl) {
              console.error(`Server ${serverName} is type 'sse' but missing required 'url' field`);
              continue;
            }
          } else {
            console.error(
              `Server ${serverName} provided invalid 'type' value: ${serverConfig.type}, should be 'stdio' or 'sse'`,
            );
            continue;
          }
        } else {
          // 2. Infer type if not provided
          const hasCommand = !!determinedCommand && determinedCommand.trim() !== "";
          const hasUrl = !!determinedUrl && determinedUrl.trim() !== "";

          if (hasCommand && hasUrl) {
            console.error(
              `Server ${serverName} provides both 'command' and 'url' fields, but 'type' is not specified. Please explicitly set 'type' to 'stdio' or 'sse'.`,
            );
            continue;
          } else if (hasCommand) {
            determinedType = "stdio";
          } else if (hasUrl) {
            determinedType = "sse";
          } else {
            console.error(`Server ${serverName} must provide either 'command' (for stdio) or 'url' (for sse) field`);
            continue;
          }
        }

        // Safeguard check (should not be reached if logic is correct)
        if (!determinedType) {
          console.error(`Cannot determine server ${serverName} type ('stdio' or 'sse')`);
          continue;
        }

        // Set default values based on determined type
        const defaultConfig: Partial<MCPServerConfig> = {
          env: {},
          descriptions: `${serverName} MCP Service`,
          icons: determinedType === "stdio" ? "🔌" : "🌐", // Different default icons
          autoApprove: ["all"],
          enabled: false,
          disable: false,
          args: [],
          baseUrl: "",
          command: "",
          type: determinedType,
        };

        // Merge configuration
        const finalConfig: MCPServerConfig = {
          env: {
            ...(typeof defaultConfig.env === "string" ? JSON.parse(defaultConfig.env) : defaultConfig.env),
            ...(typeof serverConfig.env === "string" ? JSON.parse(serverConfig.env) : serverConfig.env),
          },
          // env: { ...defaultConfig.env, ...serverConfig.env },
          descriptions: serverConfig.descriptions || defaultConfig.descriptions!,
          icons: serverConfig.icons || defaultConfig.icons!,
          autoApprove: serverConfig.autoApprove || defaultConfig.autoApprove!,
          enabled: (serverConfig as { enabled?: boolean }).enabled ?? defaultConfig.enabled!,
          disable: serverConfig.disable ?? defaultConfig.disable!,
          args: serverConfig.args || defaultConfig.args!,
          type: determinedType, // Use the determined type
          // Set command or baseUrl based on type, prioritizing provided values
          command: determinedType === "stdio" ? determinedCommand! : defaultConfig.command!,
          baseUrl: determinedType === "sse" ? determinedUrl! : defaultConfig.baseUrl!,
        };

        // Add server config to the full config
        console.log(
          `Preparing to install MCP server: ${serverName} (type: ${determinedType})`,
          this.redactValueForLog(finalConfig),
        );
        completeMcpConfig.mcpServers[serverName] = finalConfig;
      }

      if (Object.keys(completeMcpConfig.mcpServers).length === 0) {
        console.error("No valid MCP servers found in deeplink payload");
        return;
      }

      const settingsWindowId = await presenter.windowPresenter.createSettingsWindow();
      if (!settingsWindowId) {
        console.error("Failed to open Settings window for MCP install deeplink");
        return;
      }

      presenter.windowPresenter.sendToWindow(settingsWindowId, DEEPLINK_EVENTS.MCP_INSTALL, {
        mcpConfig: JSON.stringify(completeMcpConfig),
      });

      console.log("All MCP servers processing completed");
    } catch (error) {
      console.error("Error parsing or processing MCP configuration:", error);
    }
  }

  async handleProviderInstall(params: URLSearchParams): Promise<void> {
    console.log("Processing provider/install command, parameters:", this.redactSearchParamsForLog(params));

    try {
      const preview = this.parseProviderInstallParams(params);
      const settingsWindowId = await presenter.windowPresenter.createSettingsWindow();
      if (!settingsWindowId) {
        this.notifyProviderImportError("Failed to open settings window for provider deeplink.");
        return;
      }

      presenter.windowPresenter.setPendingSettingsProviderInstall(preview);
      presenter.windowPresenter.sendToWindow(settingsWindowId, SETTINGS_EVENTS.NAVIGATE, {
        routeName: "settings-provider",
      });
      presenter.windowPresenter.sendToWindow(settingsWindowId, SETTINGS_EVENTS.PROVIDER_INSTALL);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid provider deeplink.";
      console.error("Error parsing provider install deeplink:", error);
      this.notifyProviderImportError(message);
    }
  }

  private parseProviderInstallParams(params: URLSearchParams): ProviderInstallPreview {
    const version = params.get("v");
    if (version !== PROVIDER_INSTALL_VERSION) {
      throw new Error(`Unsupported provider deeplink version: ${version || "missing"}`);
    }

    const rawData = params.get("data");
    if (!rawData) {
      throw new Error("Missing 'data' parameter");
    }

    const payload = this.parseProviderInstallPayload(rawData);

    if ("id" in payload) {
      const id = this.sanitizeStringParameter(payload.id);
      const baseUrl = this.sanitizeProviderInstallField(payload.baseUrl, "baseUrl");
      const apiKey = this.sanitizeProviderInstallField(payload.apiKey, "apiKey");
      if (!id) {
        throw new Error("Provider id is required.");
      }
      if (id === "acp") {
        throw new Error("ACP provider deeplinks are not supported.");
      }

      const provider = presenter.configPresenter.getProviderById(id);
      if (!provider) {
        throw new Error(`Unknown provider id: ${id}`);
      }

      return {
        kind: "builtin",
        id,
        baseUrl,
        apiKey,
        maskedApiKey: maskApiKey(apiKey),
        iconModelId: id,
        willOverwrite: true,
      };
    }

    const type = this.sanitizeStringParameter(payload.type);
    const name = this.sanitizeStringParameter(payload.name);
    const baseUrl = this.sanitizeProviderInstallField(payload.baseUrl, "baseUrl");
    const apiKey = this.sanitizeProviderInstallField(payload.apiKey, "apiKey");
    if (!name) {
      throw new Error("Provider name is required for custom provider imports.");
    }
    if (!type) {
      throw new Error("Provider type is required for custom provider imports.");
    }
    if (type === "acp") {
      throw new Error("ACP provider deeplinks are not supported.");
    }
    if (!isProviderInstallCustomType(type)) {
      throw new Error(`Unsupported provider type: ${type}`);
    }

    return {
      kind: "custom",
      name,
      type,
      baseUrl,
      apiKey,
      maskedApiKey: maskApiKey(apiKey),
      iconModelId: type,
    };
  }

  private parseProviderInstallPayload(rawData: string): ProviderInstallDeeplinkPayload {
    const sanitizedBase64 = rawData.replace(/\s+/g, "");
    if (!sanitizedBase64) {
      throw new Error("Provider deeplink data is empty.");
    }

    let jsonString = "";
    try {
      const buffer = Buffer.from(sanitizedBase64, "base64");
      const normalizedOutput = buffer.toString("base64");
      if (sanitizedBase64 !== normalizedOutput) {
        throw new Error("Invalid base64 payload.");
      }
      jsonString = buffer.toString("utf8");
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Failed to decode provider deeplink payload.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonString);
    } catch {
      throw new Error("Provider deeplink payload is not valid JSON.");
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Provider deeplink payload must be an object.");
    }

    const payload = parsed as Partial<ProviderInstallDeeplinkPayload> & Record<string, unknown>;
    const hasId = typeof payload.id === "string";
    const hasType = typeof payload.type === "string";

    if (hasId === hasType) {
      throw new Error("Provider deeplink payload must include either 'id' or 'type'.");
    }

    if (typeof payload.baseUrl !== "string") {
      throw new Error("Provider deeplink payload must include a string 'baseUrl'.");
    }
    if (typeof payload.apiKey !== "string") {
      throw new Error("Provider deeplink payload must include a string 'apiKey'.");
    }

    if (hasId) {
      return {
        id: payload.id as string,
        baseUrl: payload.baseUrl,
        apiKey: payload.apiKey,
      };
    }

    if (typeof payload.name !== "string") {
      throw new Error("Custom provider deeplink payload must include a string 'name'.");
    }

    return {
      name: payload.name,
      type: payload.type as string,
      baseUrl: payload.baseUrl,
      apiKey: payload.apiKey,
    };
  }

  private sanitizeProviderInstallField(value: string, field: string): string {
    const sanitized = this.sanitizeStringParameter(value);
    if (value.trim().length > 0 && sanitized.length === 0) {
      throw new Error(`Provider deeplink field '${field}' is invalid.`);
    }
    return sanitized;
  }

  private notifyProviderImportError(message: string): void {
    eventBus.sendToRenderer(NOTIFICATION_EVENTS.SHOW_ERROR, SendTarget.ALL_WINDOWS, {
      id: `provider-deeplink-${Date.now()}`,
      title: "Provider Deeplink",
      message,
      type: "error",
    });
  }

  private redactDeepLinkUrlForLog(url: string): string {
    try {
      const parsedUrl = new URL(url);
      const sensitiveKeys = [...parsedUrl.searchParams.keys()].filter((key) => this.isSensitiveLogKey(key));

      sensitiveKeys.forEach((key) => {
        parsedUrl.searchParams.set(key, "[REDACTED]");
      });

      return parsedUrl.toString();
    } catch {
      return url.replace(/([?&](?:apiKey|api_key|token|password|data|code)=)[^&]*/gi, "$1[REDACTED]");
    }
  }

  private redactSearchParamsForLog(params: URLSearchParams): Record<string, string> {
    return this.redactValueForLog(Object.fromEntries(params.entries())) as Record<string, string>;
  }

  private redactValueForLog(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((item) => this.redactValueForLog(item));
    }

    if (!value || typeof value !== "object") {
      return value;
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        this.isSensitiveLogKey(key) ? "[REDACTED]" : this.redactValueForLog(nestedValue),
      ]),
    );
  }

  private isSensitiveLogKey(key: string): boolean {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    return (
      normalizedKey.includes("apikey") ||
      normalizedKey.includes("token") ||
      normalizedKey.includes("password") ||
      normalizedKey === "data" ||
      normalizedKey === "code"
    );
  }

  /**
   * Sanitize message content to prevent malicious input
   * @param content Raw message content
   * @returns Sanitized content; returns empty string if dangerous content is detected
   */
  private sanitizeMessageContent(content: string): string {
    if (!content || typeof content !== "string") {
      return "";
    }

    // Length limit
    if (content.length > 50000) {
      // 50KB limit for messages
      console.warn("Message content exceeds length limit");
      return "";
    }

    // Detect dangerous HTML tags and scripts
    const dangerousPatterns = [
      /<script[^>]*>[\s\S]*?<\/script>/gi,
      /<iframe[^>]*>[\s\S]*?<\/iframe>/gi,
      /<object[^>]*>[\s\S]*?<\/object>/gi,
      /<embed[^>]*>/gi,
      /<form[^>]*>[\s\S]*?<\/form>/gi,
      /javascript\s*:/gi,
      /vbscript\s*:/gi,
      /data\s*:\s*text\/html/gi,
      /on\w+\s*=\s*["'][^"']*["']/gi, // Event handlers
      /@import\s+/gi,
      /expression\s*\(/gi,
      /<link[^>]*stylesheet[^>]*>/gi,
      /<style[^>]*>[\s\S]*?<\/style>/gi,
    ];

    // Check whether dangerous patterns are present
    for (const pattern of dangerousPatterns) {
      if (pattern.test(content)) {
        console.warn("Dangerous pattern detected in message content:", pattern.source);
        return "";
      }
    }

    // Specifically inspect antArtifact tags for potentially malicious content
    const antArtifactPattern = /<antArtifact[^>]*>([\s\S]*?)<\/antArtifact>/gi;
    let match;
    while ((match = antArtifactPattern.exec(content)) !== null) {
      const artifactContent = match[1];

      // Check artifact content for dangerous patterns
      const artifactDangerousPatterns = [
        /<script[^>]*>/gi,
        /<iframe[^>]*>/gi,
        /javascript\s*:/gi,
        /vbscript\s*:/gi,
        /on\w+\s*=/gi,
        /<foreignObject[^>]*>[\s\S]*?<\/foreignObject>/gi,
        /<img[^>]*onerror[^>]*>/gi,
        /<svg[^>]*onload[^>]*>/gi,
      ];

      for (const dangerousPattern of artifactDangerousPatterns) {
        if (dangerousPattern.test(artifactContent)) {
          console.warn("Dangerous pattern detected in antArtifact content:", dangerousPattern.source);
          return "";
        }
      }
    }

    return content;
  }

  /**
   * Sanitize string parameter
   * @param param Parameter value
   * @returns Sanitized parameter value
   */
  private sanitizeStringParameter(param: string): string {
    if (!param || typeof param !== "string") {
      return "";
    }

    // Length limit
    if (param.length > 1000) {
      return param.substring(0, 1000);
    }

    // Remove dangerous characters and sequences
    return param
      .replace(/[<>]/g, "") // Remove angle brackets
      .replace(/javascript\s*:/gi, "") // Remove javascript: protocol
      .replace(/vbscript\s*:/gi, "") // Remove vbscript: protocol
      .replace(/data\s*:/gi, "") // Remove data: protocol
      .replace(/on\w+\s*=/gi, "") // Remove event handlers
      .trim();
  }
}
