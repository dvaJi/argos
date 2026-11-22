/**
 * Argos MCP testbed server: a local MCP server that exercises every MCP
 * feature Argos supports (OAuth, task augmentation, cancellation,
 * elicitation, sampling, roots, resource templates + completions, prompt
 * completions). Dev-only; see ./README.md.
 *
 *   bun apps/desktop/testbed/mcp-server.ts                 # HTTP on :4800, no auth
 *   bun apps/desktop/testbed/mcp-server.ts --oauth         # HTTP + OAuth (auth server on :4801)
 *   bun apps/desktop/testbed/mcp-server.ts --port 4810     # second instance
 *   bun apps/desktop/testbed/mcp-server.ts --stdio         # stdio transport (spawned by Argos)
 *
 * Every inbound JSON-RPC message is logged to stderr, so you can watch
 * `tasks/cancel`, `notifications/cancelled`, `roots/list`, ... arrive.
 */
import { randomUUID } from "node:crypto";
import * as z from "zod/v4";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import {
  getOAuthProtectedResourceMetadataUrl,
  mcpAuthMetadataRouter,
} from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { setupAuthServer } from "@modelcontextprotocol/sdk/examples/server/demoInMemoryOAuthProvider.js";
import {
  InMemoryTaskMessageQueue,
  InMemoryTaskStore,
} from "@modelcontextprotocol/sdk/experimental/tasks/stores/in-memory.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

// ---------------------------------------------------------------- options
const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(name);
const option = (name: string, fallback: string) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const STDIO = flag("--stdio");
const OAUTH = flag("--oauth");
const PORT = Number(option("--port", "4800"));
const AUTH_PORT = PORT + 1;
const NAME = option("--name", STDIO ? "testbed-stdio" : `testbed-${PORT}`);

// stdout is the protocol channel in stdio mode: log to stderr only.
const log = (...parts: unknown[]) => console.error(`[${NAME}]`, ...parts);

// ---------------------------------------------------------------- helpers
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] });

/** Log every inbound JSON-RPC message (requests, notifications, responses). */
function tapInbound(transport: { onmessage?: (message: any, extra?: any) => void }) {
  const original = transport.onmessage;
  transport.onmessage = (message, extra) => {
    if (message?.method) {
      const params = message.params ? JSON.stringify(message.params) : "";
      log(`<- ${message.method}${message.id !== undefined ? ` #${message.id}` : ""}`, params.slice(0, 200));
    } else if (message?.id !== undefined) {
      log(`<- response #${message.id}`, message.error ? `error: ${message.error.message}` : "ok");
    }
    original?.(message, extra);
  };
}

const NOTES: Record<string, string> = {
  "release-plan": "Ship v1.0 on Friday. Freeze on Wednesday.",
  "retro-2026-11": "Went well: OAuth. To improve: flaky tests.",
  roadmap: "Q1: tasks. Q2: elicitation everywhere.",
};
const CITIES = ["Buenos Aires", "Barcelona", "Berlin", "Bogotá", "Santiago", "São Paulo", "Seattle"];
const FILES = ["src/index.ts", "src/server/app.ts", "src/server/routes.ts", "docs/README.md", "docs/guide/setup.md"];

// One task store for all sessions (as in the SDK example).
const taskStore = new InMemoryTaskStore();

/** Background task work: emits status messages, honors tasks/cancel. */
function runTaskInBackground(taskId: string, seconds: number, label: string) {
  void (async () => {
    for (let elapsed = 1; elapsed <= seconds; elapsed++) {
      await sleep(1000);
      const current = await taskStore.getTask(taskId);
      if (!current || current.status === "cancelled") {
        log(`task ${taskId} (${label}) stopped: cancelled by the client after ${elapsed}s`);
        return;
      }
      await taskStore.updateTaskStatus(taskId, "working", `${label}: step ${elapsed}/${seconds}`);
    }
    const current = await taskStore.getTask(taskId);
    if (current?.status === "cancelled") return;
    await taskStore.storeTaskResult(taskId, "completed", text(`${label} finished after ${seconds}s`));
    log(`task ${taskId} (${label}) completed`);
  })().catch((error) => log(`task ${taskId} crashed:`, error));
}

// ---------------------------------------------------------------- server
function createServer(): McpServer {
  const server = new McpServer({ name: NAME, version: "1.0.0" }, {
    capabilities: {
      logging: {},
      completions: {},
      tasks: { requests: { tools: { call: {} } }, cancel: {}, list: {} },
    },
    taskStore,
    taskMessageQueue: new InMemoryTaskMessageQueue(),
  } as never);

  // --- plain tools ------------------------------------------------------
  server.registerTool(
    "echo",
    { description: "Plain tool (no task support). Echoes the text back.", inputSchema: { text: z.string() } },
    async ({ text: value }) => text(`echo: ${value}`),
  );

  server.registerTool(
    "slow_plain",
    {
      description:
        "Plain (non-task) tool that runs for N seconds. Press STOP: the server logs notifications/cancelled.",
      inputSchema: { seconds: z.number().int().min(1).max(120).default(20) },
    },
    async ({ seconds }, extra) => {
      for (let i = 1; i <= seconds; i++) {
        await sleep(1000, extra.signal);
        if (extra.signal.aborted) {
          log(`slow_plain aborted by the client after ${i}s`);
          return text("aborted");
        }
        const progressToken = extra._meta?.progressToken;
        if (progressToken !== undefined) {
          await extra.sendNotification({
            method: "notifications/progress",
            params: { progressToken, progress: i, total: seconds, message: `second ${i}` },
          });
        }
      }
      return text(`slow_plain finished after ${seconds}s`);
    },
  );

  server.registerTool(
    "fail_tool",
    { description: "Always returns a tool-level error (isError: true).", inputSchema: {} },
    async () => ({ ...text("This tool failed on purpose."), isError: true }),
  );

  // --- task-augmented tools --------------------------------------------
  const taskHandler = (label: string) => ({
    async createTask({ seconds }: { seconds: number }, extra: any) {
      const task = await extra.taskStore.createTask({ ttl: extra.taskRequestedTtl ?? 10 * 60_000, pollInterval: 1000 });
      log(`task ${task.taskId} (${label}) created for ${seconds}s`);
      runTaskInBackground(task.taskId, seconds, label);
      return { task };
    },
    async getTask(_args: unknown, extra: any) {
      return await extra.taskStore.getTask(extra.taskId);
    },
    async getTaskResult(_args: unknown, extra: any) {
      return await extra.taskStore.getTaskResult(extra.taskId);
    },
  });

  server.experimental.tasks.registerToolTask(
    "long_task",
    {
      description: "Task-augmented tool (taskSupport: optional). Shows live progress; STOP sends tasks/cancel.",
      inputSchema: { seconds: z.number().int().min(1).max(300).default(15) },
      execution: { taskSupport: "optional" },
    },
    taskHandler("long_task") as never,
  );

  server.experimental.tasks.registerToolTask(
    "required_task",
    {
      description: "Task-augmented tool (taskSupport: required). Must be called as a task.",
      inputSchema: { seconds: z.number().int().min(1).max(60).default(5) },
      execution: { taskSupport: "required" },
    },
    taskHandler("required_task") as never,
  );

  server.experimental.tasks.registerToolTask(
    "task_needs_input",
    {
      description: "Task that pauses in input_required and asks the user a question through tasks/result.",
      inputSchema: {},
      execution: { taskSupport: "optional" },
    },
    {
      async createTask(_args: unknown, extra: any) {
        const task = await extra.taskStore.createTask({ ttl: 10 * 60_000, pollInterval: 1000 });
        log(`task ${task.taskId} (task_needs_input) created; waiting for user input`);
        void (async () => {
          try {
            const stream = server.server.experimental.tasks.elicitInputStream({
              mode: "form",
              message: "The task needs a deployment target to continue.",
              requestedSchema: {
                type: "object",
                properties: {
                  target: { type: "string", title: "Target", enum: ["staging", "production"] },
                  confirm: { type: "boolean", title: "I know what I'm doing" },
                },
                required: ["target"],
              },
            } as never);
            let result: any;
            for await (const message of stream as AsyncIterable<any>) {
              if (message.type === "result") result = message.result;
              else if (message.type === "error") throw message.error;
            }
            log(`task ${task.taskId} got user input:`, JSON.stringify(result));
            await taskStore.storeTaskResult(
              task.taskId,
              "completed",
              text(`Input received: ${JSON.stringify(result)}`),
            );
          } catch (error) {
            log(`task ${task.taskId} input failed:`, error);
            await taskStore
              .storeTaskResult(task.taskId, "failed", { ...text(`Error: ${error}`), isError: true })
              .catch(() => undefined);
          }
        })();
        return { task };
      },
      async getTask(_args: unknown, extra: any) {
        return await extra.taskStore.getTask(extra.taskId);
      },
      async getTaskResult(_args: unknown, extra: any) {
        return await extra.taskStore.getTaskResult(extra.taskId);
      },
    } as never,
  );

  // --- elicitation --------------------------------------------------------
  server.registerTool(
    "ask_form",
    { description: "Asks the user a form with every field type (elicitation).", inputSchema: {} },
    async () => {
      const result = await server.server.elicitInput({
        mode: "form",
        message: "Testbed form: fill in every field type",
        requestedSchema: {
          type: "object",
          properties: {
            name: { type: "string", title: "Name", description: "Free text" },
            age: { type: "integer", title: "Age", minimum: 0, maximum: 150 },
            budget: { type: "number", title: "Budget (USD)" },
            subscribe: { type: "boolean", title: "Subscribe to updates" },
            color: { type: "string", title: "Favorite color", enum: ["red", "green", "blue"] },
            tags: {
              type: "array",
              title: "Tags",
              items: { type: "string", enum: ["alpha", "beta", "gamma"] },
            },
          },
          required: ["name", "color"],
        },
      } as never);
      log("ask_form result:", JSON.stringify(result));
      return text(`ask_form -> ${JSON.stringify(result)}`);
    },
  );

  server.registerTool(
    "ask_two",
    {
      description: "Sends two elicitations at once. Argos must queue them and route each answer correctly.",
      inputSchema: {},
    },
    async () => {
      const ask = (question: string) =>
        server.server.elicitInput({
          mode: "form",
          message: question,
          requestedSchema: {
            type: "object",
            properties: { answer: { type: "string", title: "Answer" } },
            required: ["answer"],
          },
        } as never);
      const [first, second] = await Promise.all([
        ask(`[${NAME}] Question 1 of 2: type "one"`),
        ask(`[${NAME}] Question 2 of 2: type "two"`),
      ]);
      log("ask_two results:", JSON.stringify({ first, second }));
      return text(`first=${JSON.stringify(first)} second=${JSON.stringify(second)}`);
    },
  );

  // --- sampling + roots -------------------------------------------------
  server.registerTool(
    "sample",
    {
      description: "Asks the client's LLM to complete a prompt (sampling/createMessage).",
      inputSchema: { prompt: z.string().default("Write a haiku about local test servers.") },
    },
    async ({ prompt }) => {
      const result = await server.server.createMessage({
        messages: [{ role: "user", content: { type: "text", text: prompt } }],
        maxTokens: 200,
        systemPrompt: "You are a terse assistant.",
      });
      return text(`model=${result.model}\n${result.content.type === "text" ? result.content.text : "(non-text)"}`);
    },
  );

  server.registerTool(
    "list_roots",
    { description: "Asks the client for its roots (roots/list).", inputSchema: {} },
    async () => {
      const { roots } = await server.server.listRoots();
      return text(roots.length ? roots.map((root) => `${root.name ?? ""} ${root.uri}`).join("\n") : "(no roots)");
    },
  );

  // --- resources + templates with completions ---------------------------
  server.registerResource(
    "readme",
    "testbed://readme",
    { title: "Testbed README", mimeType: "text/plain" },
    async (uri) => ({ contents: [{ uri: uri.href, text: `Static resource served by ${NAME}.` }] }),
  );

  server.registerResource(
    "note",
    new ResourceTemplate("testbed://notes/{noteId}", {
      list: undefined,
      complete: { noteId: (value) => Object.keys(NOTES).filter((id) => id.startsWith(value)) },
    }),
    { title: "Note by id", description: "Simple {var} template; noteId completes", mimeType: "text/plain" },
    async (uri, { noteId }) => ({
      contents: [{ uri: uri.href, text: NOTES[String(noteId)] ?? `No note named ${noteId}` }],
    }),
  );

  server.registerResource(
    "weather",
    new ResourceTemplate("testbed://weather/{city}{?units}", {
      list: undefined,
      complete: {
        city: (value) => CITIES.filter((city) => city.toLowerCase().startsWith(value.toLowerCase())),
        units: (value) => ["metric", "imperial"].filter((unit) => unit.startsWith(value)),
      },
    }),
    { title: "Weather", description: "Template with a {?query} operator", mimeType: "text/plain" },
    async (uri, { city, units }) => ({
      contents: [{ uri: uri.href, text: `Weather in ${city}: 21° (${units ?? "metric"})` }],
    }),
  );

  server.registerResource(
    "file",
    new ResourceTemplate("testbed://files/{+path}", {
      list: undefined,
      complete: { path: (value) => FILES.filter((file) => file.startsWith(value)) },
    }),
    {
      title: "File by path",
      description: "Template with a {+reserved} operator (keeps slashes)",
      mimeType: "text/plain",
    },
    async (uri, { path }) => ({ contents: [{ uri: uri.href, text: `Contents of ${path}` }] }),
  );

  // --- prompts with argument completions ---------------------------------
  server.registerPrompt(
    "review_code",
    {
      title: "Review code",
      description: "Prompt with completable arguments",
      argsSchema: {
        language: completable(z.string(), (value) =>
          ["typescript", "python", "rust", "go"].filter((lang) => lang.startsWith(value)),
        ),
        focus: completable(z.string(), (value) =>
          ["security", "performance", "readability"].filter((item) => item.startsWith(value)),
        ),
      },
    },
    async ({ language, focus }) => ({
      messages: [{ role: "user", content: { type: "text", text: `Review this ${language} code for ${focus}.` } }],
    }),
  );

  return server;
}

// ---------------------------------------------------------------- stdio
async function startStdio() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  tapInbound(transport as never);
  log(`stdio server ready (pid ${process.pid})`);
}

// ---------------------------------------------------------------- http
function listenOrExplain(app: { listen: (...args: any[]) => any }, port: number, what: string) {
  const httpServer = app.listen(port, "127.0.0.1", () => log(`${what} listening on http://127.0.0.1:${port}`));
  httpServer.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      log(`port ${port} is already in use (another testbed still running?). Use --port <n> or stop it.`);
    } else {
      log(`${what} failed:`, error);
    }
    process.exit(1);
  });
}

async function startHttp() {
  const app = createMcpExpressApp() as any;
  const mcpUrl = new URL(`http://127.0.0.1:${PORT}/mcp`);
  let auth: any = null;

  if (OAUTH) {
    const authServerUrl = new URL(`http://127.0.0.1:${AUTH_PORT}`);
    // The SDK demo authorization server: dynamic client registration + PKCE,
    // auto-approves the login (no consent page) and redirects back.
    const oauthMetadata = setupAuthServer({ authServerUrl, mcpServerUrl: mcpUrl, strictResource: true });
    app.use(
      mcpAuthMetadataRouter({
        oauthMetadata,
        resourceServerUrl: mcpUrl,
        scopesSupported: ["mcp:tools"],
        resourceName: NAME,
      }),
    );
    auth = requireBearerAuth({
      verifier: {
        verifyAccessToken: async (token: string) => {
          const response = await fetch(oauthMetadata.introspection_endpoint!, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ token }).toString(),
          });
          // Unlike the SDK demo, answer 401 (not 500) for bad tokens so the
          // client re-runs the OAuth flow, as a real server would.
          if (!response.ok) throw new InvalidTokenError("Invalid or expired token");
          const data = await response.json();
          return {
            token,
            clientId: data.client_id,
            scopes: data.scope ? data.scope.split(" ") : [],
            expiresAt: data.exp,
            resource: data.aud ? new URL([data.aud].flat()[0]) : undefined,
          };
        },
      },
      requiredScopes: [],
      resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl),
      expectedResource: mcpUrl,
    });
  }

  const sessions = new Map<string, StreamableHTTPServerTransport>();
  const guard = (handler: any) => (auth ? [auth, handler] : [handler]);

  app.post(
    "/mcp",
    ...guard(async (req: any, res: any) => {
      const sessionId = req.headers["mcp-session-id"] as string | undefined;
      try {
        let transport = sessionId ? sessions.get(sessionId) : undefined;
        if (!transport) {
          if (sessionId || !isInitializeRequest(req.body)) {
            res.status(sessionId ? 404 : 400).json({
              jsonrpc: "2.0",
              error: { code: -32001, message: sessionId ? "Session not found" : "No session" },
              id: null,
            });
            return;
          }
          const created: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (id) => {
              sessions.set(id, created);
              log(`session ${id} initialized`);
            },
          });
          created.onclose = () => {
            if (created.sessionId) sessions.delete(created.sessionId);
          };
          await createServer().connect(created);
          tapInbound(created as never);
          transport = created;
        }
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        log("request failed:", error);
        if (!res.headersSent)
          res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal" }, id: null });
      }
    }),
  );
  const forward = async (req: any, res: any) => {
    const transport = sessions.get(req.headers["mcp-session-id"] as string);
    if (!transport) {
      res.status(404).send("Session not found");
      return;
    }
    await transport.handleRequest(req, res);
  };
  app.get("/mcp", ...guard(forward));
  app.delete("/mcp", ...guard(forward));

  listenOrExplain(app, PORT, `MCP server (${OAUTH ? "OAuth" : "no auth"}) pid ${process.pid}`);
  log(`Argos config: type "http", baseUrl "${mcpUrl.href}"${OAUTH ? ", OAuth toggle ON" : ""}`);
}

if (STDIO) await startStdio();
else await startHttp();
