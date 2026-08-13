import readline from "node:readline";
import {
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent,
  type ExtensionUIContext,
  type InlineExtension,
  type ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { createArgosOrchestratorExtension } from "@argos/pi-orchestrator-extension";
import type { PiWorkerCommand, PiWorkerEvent, PiWorkerInit } from "./piWorkerProtocol";

declare const __DAEMON_VERSION__: string | undefined;

if (process.argv.includes("--version")) {
  process.stdout.write(`${typeof __DAEMON_VERSION__ === "string" ? __DAEMON_VERSION__ : "development"}\n`);
  process.exit(0);
}

let session: AgentSession | undefined;
let init: PiWorkerInit | undefined;
let activeCommandId: string | undefined;
const pending = new Map<string, { resolve: (value: any) => void; reject: (error: Error) => void }>();
// `getSessionStats()` returns CUMULATIVE totals for the whole session. To store
// per-turn usage we emit the delta since the last settled turn (keyed by
// session file so a resumed session doesn't double-count).
const lastEmittedTotals = new Map<
  string,
  { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number }
>();

function emit(event: PiWorkerEvent): void {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function request<T>(event: PiWorkerEvent & { id: string }): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    pending.set(event.id, { resolve, reject });
    emit(event);
  });
}

function diagnostic(error: unknown, source: string): void {
  emit({
    type: "diagnostic",
    diagnostic: {
      severity: "error",
      source,
      message: error instanceof Error ? error.message : String(error),
    },
  });
}

function apiFor(value: string): any {
  const aliases: Record<string, string> = {
    anthropic: "anthropic-messages",
    gemini: "google-generative-ai",
    google: "google-generative-ai",
    vertex: "google-vertex",
    "aws-bedrock": "bedrock-converse-stream",
    bedrock: "bedrock-converse-stream",
    azure: "azure-openai-responses",
    "openai-responses": "openai-responses",
    openai_responses: "openai-responses",
  };
  return aliases[value] ?? "openai-completions";
}

function createHostExtension(config: PiWorkerInit): InlineExtension {
  return {
    name: "argos-host",
    factory: (pi) => {
      pi.on("tool_call", async (event) => {
        if (config.permissionMode === "full_access") return;
        const granted = await request<boolean>({
          type: "permissionRequest",
          id: crypto.randomUUID(),
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          input: event.input,
        });
        if (!granted) return { block: true, reason: "Denied by the user" };
      });
    },
  };
}

function createMcpTools(config: PiWorkerInit): ToolDefinition[] {
  return config.tools.map((tool) =>
    defineTool({
      name: tool.function.name,
      label: tool.function.name,
      description: tool.function.description,
      parameters: Type.Unsafe(tool.function.parameters),
      execute: async (toolCallId, input) => {
        const response = await request<any>({
          type: "mcpRequest",
          id: crypto.randomUUID(),
          toolCallId,
          toolName: tool.function.name,
          input: input as Record<string, unknown>,
        });
        const raw = response?.content;
        const content = Array.isArray(raw)
          ? raw.map((item: any) =>
              item?.type === "image"
                ? { type: "image" as const, data: item.data, mimeType: item.mimeType }
                : { type: "text" as const, text: item?.text ?? JSON.stringify(item) },
            )
          : [{ type: "text" as const, text: typeof raw === "string" ? raw : JSON.stringify(raw ?? response) }];
        return { content, details: response, isError: Boolean(response?.isError) };
      },
    }),
  );
}

function unsupported(method: string): never {
  throw new Error(`Pi extension UI method '${method}' requires the terminal UI and is not supported by Argos.`);
}

function createUiContext(): ExtensionUIContext {
  const dialog = (method: "select" | "confirm" | "input" | "editor", title: string, rest: any = {}) =>
    request<any>({ type: "uiRequest", id: crypto.randomUUID(), method, title, ...rest });
  return {
    select: (title, options) => dialog("select", title, { options }),
    confirm: (title, message) => dialog("confirm", title, { message }),
    input: (title, placeholder) => dialog("input", title, { message: placeholder }),
    editor: (title, prefill) => dialog("editor", title, { message: prefill }),
    notify: (message, level = "info") => emit({ type: "notification", level, message }),
    setStatus: () => {},
    setWorkingMessage: () => {},
    setWorkingVisible: () => {},
    setWorkingIndicator: () => {},
    setHiddenThinkingLabel: () => {},
    setTitle: () => {},
    getEditorText: () => "",
    setEditorText: () => {},
    pasteToEditor: () => {},
    onTerminalInput: () => () => {},
    setWidget: () => unsupported("setWidget"),
    setFooter: () => unsupported("setFooter"),
    setHeader: () => unsupported("setHeader"),
    custom: () => Promise.reject(new Error("Pi custom TUI components are not supported by Argos.")),
    addAutocompleteProvider: () => {},
    setEditorComponent: () => unsupported("setEditorComponent"),
    getEditorComponent: () => undefined,
    getAllThemes: () => [],
    getTheme: () => undefined,
    setTheme: () => ({ success: false, error: "Themes are rendered by Argos." }),
    getToolsExpanded: () => true,
    setToolsExpanded: () => {},
    get theme(): any {
      return undefined;
    },
  } as ExtensionUIContext;
}

function handleSessionEvent(event: AgentSessionEvent): void {
  switch (event.type) {
    case "message_update": {
      const part = event.assistantMessageEvent;
      if (part.type === "text_delta") emit({ type: "delta", kind: "text", text: part.delta });
      if (part.type === "thinking_delta") emit({ type: "delta", kind: "thinking", text: part.delta });
      break;
    }
    case "tool_execution_start":
      emit({ type: "toolStart", toolCallId: event.toolCallId, toolName: event.toolName, input: event.args });
      break;
    case "tool_execution_update":
      emit({
        type: "toolUpdate",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        partialResult: event.partialResult,
      });
      break;
    case "tool_execution_end":
      emit({
        type: "toolEnd",
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        result: event.result,
        isError: event.isError,
      });
      break;
    case "queue_update":
      emit({ type: "queue", steering: event.steering, followUp: event.followUp });
      break;
    case "compaction_start":
      emit({ type: "compaction", phase: "start", reason: event.reason });
      break;
    case "compaction_end":
      emit({ type: "compaction", phase: "end", reason: event.reason, error: event.errorMessage });
      break;
    case "auto_retry_start":
      emit({ type: "retry", phase: "start", attempt: event.attempt, error: event.errorMessage });
      break;
    case "auto_retry_end":
      emit({ type: "retry", phase: "end", attempt: event.attempt, error: event.finalError });
      break;
    case "agent_settled": {
      // Emit usage BEFORE settled: the daemon persists usage from the settled
      // handler, which runs synchronously when the settled event arrives.
      if (session) {
        try {
          const stats = session.getSessionStats();
          const key = session.sessionFile ?? activeCommandId ?? "default";
          const previous = lastEmittedTotals.get(key);
          const input = stats.tokens.input - (previous?.input ?? 0);
          const output = stats.tokens.output - (previous?.output ?? 0);
          const cacheRead = stats.tokens.cacheRead - (previous?.cacheRead ?? 0);
          const cacheWrite = stats.tokens.cacheWrite - (previous?.cacheWrite ?? 0);
          const cost = (stats.cost ?? 0) - (previous?.cost ?? 0);
          lastEmittedTotals.set(key, {
            input: stats.tokens.input,
            output: stats.tokens.output,
            cacheRead: stats.tokens.cacheRead,
            cacheWrite: stats.tokens.cacheWrite,
            cost: stats.cost ?? 0,
          });
          // A resumed session may reset counters; only emit meaningful deltas.
          if (input + output + cacheRead + cacheWrite + cost > 0) {
            emit({
              type: "usage",
              id: activeCommandId,
              usage: {
                input: Math.max(0, input),
                output: Math.max(0, output),
                cacheRead: Math.max(0, cacheRead),
                cacheWrite: Math.max(0, cacheWrite),
                total: Math.max(0, input + output + cacheRead + cacheWrite),
                cost: Math.max(0, cost),
              },
            });
          }
        } catch (error) {
          diagnostic(error, "usage");
        }
      }
      emit({ type: "settled", id: activeCommandId, sessionFile: session?.sessionFile });
      activeCommandId = undefined;
      break;
    }
  }
}

async function initialize(config: PiWorkerInit): Promise<void> {
  init = config;
  const settingsManager = SettingsManager.create(config.cwd, config.agentDir);
  const loader = new DefaultResourceLoader({
    cwd: config.cwd,
    agentDir: config.agentDir,
    settingsManager,
    systemPromptOverride: () => config.systemPrompt,
    extensionFactories: [
      createHostExtension(config),
      ...(config.orchestrationTools.length
        ? [
            createArgosOrchestratorExtension({
              tools: config.orchestrationTools,
              call: async (toolCallId, toolName, input) =>
                await request<any>({ type: "mcpRequest", id: crypto.randomUUID(), toolCallId, toolName, input }),
            }),
          ]
        : []),
    ],
  });
  await loader.reload({ resolveProjectTrust: async () => config.projectTrusted });

  const modelRuntime = await ModelRuntime.create({
    authPath: `${config.agentDir}/auth.json`,
    modelsPath: `${config.agentDir}/models.json`,
    allowModelNetwork: false,
  });
  modelRuntime.registerProvider(config.provider.id, {
    name: config.provider.name,
    baseUrl: config.provider.baseUrl,
    api: apiFor(config.provider.api),
    headers: config.provider.headers,
    models: [
      {
        ...config.provider.model,
        api: apiFor(config.provider.api),
        cost: config.provider.model.cost ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      },
    ],
  });
  await modelRuntime.setRuntimeApiKey(config.provider.id, config.provider.apiKey);
  const model = modelRuntime.getModel(config.provider.id, config.provider.model.id);
  if (!model) throw new Error(`Pi could not register model ${config.provider.id}/${config.provider.model.id}`);

  const sessionManager = config.sessionFile
    ? SessionManager.open(config.sessionFile, config.sessionDir, config.cwd)
    : SessionManager.create(config.cwd, config.sessionDir);
  const created = await createAgentSession({
    cwd: config.cwd,
    agentDir: config.agentDir,
    modelRuntime,
    model,
    thinkingLevel: config.thinkingLevel as any,
    excludeTools: config.disabledTools,
    customTools: createMcpTools(config),
    resourceLoader: loader,
    sessionManager,
    settingsManager,
  });
  session = created.session;
  session.bindExtensions({ uiContext: createUiContext(), mode: "rpc" });
  session.subscribe(handleSessionEvent);

  const resources = [
    ...loader.getExtensions().errors.map((item: any) => ({
      severity: "error" as const,
      source: "extension",
      message: String(item.error ?? item),
    })),
    ...loader.getSkills().diagnostics.map((item: any) => ({
      severity: item.severity ?? "warning",
      source: "skill",
      message: item.message,
    })),
    ...loader.getPrompts().diagnostics.map((item: any) => ({
      severity: item.severity ?? "warning",
      source: "prompt",
      message: item.message,
    })),
  ];
  emit({ type: "ready", sessionFile: session.sessionFile, diagnostics: resources });
}

async function handle(command: PiWorkerCommand): Promise<void> {
  if (command.type === "init") return initialize(command);
  if (command.type === "permissionResponse" || command.type === "mcpResponse" || command.type === "uiResponse") {
    const waiter = pending.get(command.id);
    if (!waiter) return;
    pending.delete(command.id);
    if ("error" in command && command.error) waiter.reject(new Error(command.error));
    else if (command.type === "permissionResponse") waiter.resolve(command.granted);
    else if (command.type === "mcpResponse") waiter.resolve(command.response);
    else waiter.resolve(command.value);
    return;
  }
  if (!session || !init) throw new Error("Pi worker has not been initialized.");
  if (command.type === "dispose") {
    session.dispose();
    process.exit(0);
  }
  if (command.type === "abort") {
    await session.abort();
    return;
  }
  activeCommandId = command.id;
  emit({ type: "accepted", id: command.id, sessionFile: session.sessionFile });
  if (command.type === "steer") return session.steer(command.text);
  if (command.type === "followUp") return session.followUp(command.text);
  if (command.type === "compact") {
    await session.compact(command.instructions);
    emit({ type: "settled", id: command.id, sessionFile: session.sessionFile });
    activeCommandId = undefined;
    return;
  }
  await session.prompt(command.text);
}

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
lines.on("line", (line) => {
  let command: PiWorkerCommand;
  try {
    command = JSON.parse(line) as PiWorkerCommand;
  } catch (error) {
    diagnostic(error, "protocol");
    return;
  }
  void handle(command).catch((error) => {
    emit({
      type: "error",
      id: "id" in command ? command.id : undefined,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  });
});

process.on("uncaughtException", (error) => {
  diagnostic(error, "uncaughtException");
  process.exit(1);
});
process.on("unhandledRejection", (error) => {
  diagnostic(error, "unhandledRejection");
  process.exit(1);
});
