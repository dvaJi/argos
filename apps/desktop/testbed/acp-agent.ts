/**
 * Argos ACP testbed agent: a scripted ACP agent that exercises every ACP
 * feature Argos supports. Add it in Argos as a custom agent:
 *
 *   command: bun
 *   args:    <repo>/apps/desktop/testbed/acp-agent.ts
 *
 * Then type `/help` in a chat with it. Each slash command triggers one
 * scenario (tool calls, permissions, elicitation, plans, subagents, ...).
 * Every inbound request is logged to stderr and to
 * `<tmp>/argos-acp-testbed.log` so you can see what Argos sent.
 *
 * Env toggles:
 *   TESTBED_ACP_NO_TITLE=1        don't advertise sessionCapabilities.title
 *   TESTBED_ACP_TITLE_DELAY_MS    how long session/set_title takes (default 4000)
 *   TESTBED_ACP_REQUIRE_AUTH=1    require `authenticate` before session/new
 *
 * stdout is the ACP channel: never console.log here.
 */
import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { agent, ndJsonStream, PROTOCOL_VERSION, RequestError } from "@agentclientprotocol/sdk/unstable";
import type * as schema from "@agentclientprotocol/sdk/unstable";
import type { AgentContext } from "@agentclientprotocol/sdk/unstable";

// ---------------------------------------------------------------- config
const NO_TITLE = process.env.TESTBED_ACP_NO_TITLE === "1";
const TITLE_DELAY_MS = Number(process.env.TESTBED_ACP_TITLE_DELAY_MS ?? 4000);
const REQUIRE_AUTH = process.env.TESTBED_ACP_REQUIRE_AUTH === "1";
const LOG_FILE = path.join(tmpdir(), "argos-acp-testbed.log");

function log(...parts: unknown[]) {
  const line = `${new Date().toISOString()} ${parts
    .map((part) => (typeof part === "string" ? part : JSON.stringify(part)))
    .join(" ")}`;
  process.stderr.write(`[acp-testbed] ${line}\n`);
  try {
    appendFileSync(LOG_FILE, `${line}\n`);
  } catch {
    // best effort
  }
}

// ---------------------------------------------------------------- state
type ConfigValues = { model: string; verbose: boolean };
type TestbedSession = {
  sessionId: string;
  cwd: string;
  title: string | null;
  archived: boolean;
  config: ConfigValues;
  updatedAt: string;
  prompts: number;
  running: AbortController | null;
};
const sessions = new Map<string, TestbedSession>();
let authenticated = !REQUIRE_AUTH;
let counter = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

const COMMANDS: Array<{ name: string; description: string }> = [
  { name: "help", description: "List testbed scenarios" },
  { name: "slow", description: "Stream for 30s - press STOP to test session/cancel" },
  { name: "tool", description: "A tool call with progress, a diff and a completion" },
  { name: "permission", description: "Ask for permission (session/request_permission)" },
  { name: "elicit", description: "Form elicitation (elicitation/create, mode: form)" },
  { name: "elicit-url", description: "URL elicitation, auto-completed after 8s (elicitation/complete)" },
  { name: "plan", description: "A plan whose entries progress (plan + plan_update)" },
  { name: "subagent", description: "Two subagents streaming messages (subagent_update + session_message)" },
  { name: "compact", description: "A compaction with a streamed summary (compaction_update)" },
  { name: "notice", description: "Info, warning and error notices" },
  { name: "cursor", description: "Announce a forkable cursor (cursor_update) - then try Fork" },
  { name: "suggest", description: "Prompt suggestion chips (prompt_suggestions_update)" },
  { name: "title", description: "Agent-side title change (session_info_update)" },
  { name: "fail", description: "The prompt fails with an error" },
];

const configOptions = (values: ConfigValues): schema.SessionConfigOption[] => [
  {
    id: "model",
    name: "Model",
    description: "Persisted per conversation by Argos",
    type: "select",
    currentValue: values.model,
    options: [
      { value: "fast", name: "Fast" },
      { value: "smart", name: "Smart" },
      { value: "creative", name: "Creative" },
    ],
  },
  {
    id: "verbose",
    name: "Verbose answers",
    type: "boolean",
    currentValue: values.verbose,
  },
];

function getSession(sessionId: string): TestbedSession {
  const session = sessions.get(sessionId);
  if (!session) throw RequestError.resourceNotFound(sessionId);
  return session;
}

function createSession(cwd: string, sessionId = nextId("tb-session")): TestbedSession {
  const session: TestbedSession = {
    sessionId,
    cwd,
    title: null,
    archived: false,
    config: { model: "fast", verbose: false },
    updatedAt: new Date().toISOString(),
    prompts: 0,
    running: null,
  };
  sessions.set(sessionId, session);
  return session;
}

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

function updater(client: AgentContext, sessionId: string) {
  return (update: schema.SessionUpdate) => client.notify("session/update", { sessionId, update });
}

async function streamText(
  send: ReturnType<typeof updater>,
  text: string,
  signal?: AbortSignal,
  messageId = nextId("msg"),
  delayMs = 40,
) {
  for (const word of text.split(/(\s+)/)) {
    if (signal?.aborted) return;
    if (!word) continue;
    await send({ sessionUpdate: "agent_message_chunk", messageId, content: { type: "text", text: word } });
    await sleep(delayMs, signal);
  }
}

// ---------------------------------------------------------------- scenarios
type Scenario = (input: {
  session: TestbedSession;
  send: ReturnType<typeof updater>;
  client: AgentContext;
  signal: AbortSignal;
  text: string;
}) => Promise<schema.StopReason | void>;

const scenarios: Record<string, Scenario> = {
  async help({ send }) {
    const lines = COMMANDS.map((command) => `- \`/${command.name}\` - ${command.description}`).join("\n");
    await streamText(
      send,
      `**Argos ACP testbed.** Scenarios:\n\n${lines}\n\nAnything else gets a plain streamed reply.`,
      undefined,
      undefined,
      5,
    );
  },

  async slow({ send, signal }) {
    const messageId = nextId("msg");
    for (let i = 1; i <= 30; i++) {
      if (signal.aborted) {
        log("slow: cancelled by the client after", i - 1, "s");
        return "cancelled";
      }
      await send({ sessionUpdate: "agent_message_chunk", messageId, content: { type: "text", text: `tick ${i}… ` } });
      await sleep(1000, signal);
    }
    return signal.aborted ? "cancelled" : "end_turn";
  },

  async tool({ send, signal }) {
    const toolCallId = nextId("tool");
    await send({
      sessionUpdate: "tool_call",
      toolCallId,
      title: "Editing src/greeting.ts",
      kind: "edit",
      status: "pending",
      rawInput: { path: "src/greeting.ts" },
      locations: [{ path: "src/greeting.ts", line: 1 }],
    });
    await sleep(600, signal);
    await send({ sessionUpdate: "tool_call_update", toolCallId, status: "in_progress" });
    await sleep(1200, signal);
    await send({
      sessionUpdate: "tool_call_update",
      toolCallId,
      status: "completed",
      content: [
        {
          type: "diff",
          path: "src/greeting.ts",
          oldText: 'export const greet = () => "hi";\n',
          newText: "export const greet = (name: string) => `hi ${name}`;\n",
        },
      ],
      rawOutput: { ok: true },
    });
    await streamText(send, "Done: the tool call above should show a diff.", signal);
  },

  async permission({ send, client, session, signal }) {
    const toolCallId = nextId("tool");
    await send({ sessionUpdate: "tool_call", toolCallId, title: "rm -rf build/", kind: "execute", status: "pending" });
    const response = await client.request(
      "session/request_permission",
      {
        sessionId: session.sessionId,
        toolCall: { toolCallId, title: "rm -rf build/", kind: "execute", status: "pending" },
        options: [
          { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
          { optionId: "allow-always", name: "Always allow", kind: "allow_always" },
          { optionId: "reject", name: "Reject", kind: "reject_once" },
        ],
      },
      { cancellationSignal: signal },
    );
    log("permission outcome:", response.outcome);
    const allowed = response.outcome.outcome === "selected" && response.outcome.optionId !== "reject";
    await send({ sessionUpdate: "tool_call_update", toolCallId, status: allowed ? "completed" : "failed" });
    await streamText(send, `Permission outcome: \`${JSON.stringify(response.outcome)}\``, signal);
  },

  async elicit({ send, client, session, signal }) {
    const response = await client.request(
      "elicitation/create",
      {
        sessionId: session.sessionId,
        mode: "form",
        message: "Testbed: configure the deployment",
        requestedSchema: {
          type: "object",
          properties: {
            environment: { type: "string", title: "Environment", enum: ["staging", "production"] },
            replicas: { type: "integer", title: "Replicas", minimum: 1, maximum: 10 },
            notify: { type: "boolean", title: "Notify the team" },
            note: { type: "string", title: "Release note" },
          },
          required: ["environment"],
        },
      },
      { cancellationSignal: signal },
    );
    log("elicitation (form) response:", response);
    await streamText(send, `Elicitation response: \`${JSON.stringify(response)}\``, signal);
  },

  async "elicit-url"({ send, client, session, signal }) {
    const elicitationId = nextId("elicit");
    // The agent marks the URL flow complete on its own (as if the browser
    // round-trip finished); Argos should auto-accept on elicitation/complete.
    const completeTimer = setTimeout(() => {
      log("sending elicitation/complete for", elicitationId);
      void client.notify("elicitation/complete", { elicitationId });
    }, 8000);
    try {
      const response = await client.request(
        "elicitation/create",
        {
          sessionId: session.sessionId,
          mode: "url",
          elicitationId,
          url: "https://example.com/testbed-consent",
          message: "Testbed: open the consent page (auto-completes in 8s)",
        },
        { cancellationSignal: signal },
      );
      log("elicitation (url) response:", response);
      await streamText(send, `URL elicitation response: \`${JSON.stringify(response)}\``, signal);
    } finally {
      clearTimeout(completeTimer);
    }
  },

  async plan({ send, signal }) {
    const entries = (done: number): schema.PlanEntry[] =>
      ["Read the code", "Write the fix", "Run the tests"].map((content, index) => ({
        content,
        priority: index === 1 ? "high" : "medium",
        status: index < done ? "completed" : index === done ? "in_progress" : "pending",
      }));
    for (let done = 0; done <= 3; done++) {
      if (signal.aborted) return "cancelled";
      await send({ sessionUpdate: "plan", entries: entries(done) });
      await sleep(900, signal);
    }
    await streamText(send, "Plan finished.", signal);
  },

  async subagent({ send, session, signal }) {
    const children = [`${session.sessionId}-researcher`, `${session.sessionId}-reviewer`];
    await send({
      sessionUpdate: "subagent_update",
      sessionId: children[0],
      title: "Researcher",
      description: "Looks things up",
      state: { state: "running" },
    });
    await send({
      sessionUpdate: "subagent_update",
      sessionId: children[1],
      title: "Reviewer",
      description: "Reviews the findings",
      state: { state: "running" },
    });
    // Two children: chunks carry no sender, so Argos must attribute them via
    // the owner recorded by the first session_message.
    for (const [index, child] of children.entries()) {
      const messageId = nextId("submsg");
      await send({ sessionUpdate: "session_message", messageId, senderSessionId: child, content: null });
      for (const word of `${index === 0 ? "Researcher" : "Reviewer"} streaming its own message.`.split(" ")) {
        if (signal.aborted) return "cancelled";
        await send({ sessionUpdate: "session_message_chunk", messageId, content: { type: "text", text: `${word} ` } });
        await sleep(120, signal);
      }
    }
    for (const child of children) {
      await send({ sessionUpdate: "subagent_update", sessionId: child, state: { state: "idle" } });
    }
    await streamText(send, "Both subagents finished.", signal);
  },

  async compact({ send, signal }) {
    const compactionId = nextId("compaction");
    await send({ sessionUpdate: "compaction_update", compactionId, status: "in_progress" });
    for (const piece of ["Summary: ", "the user is testing ", "the ACP testbed."]) {
      await sleep(500, signal);
      await send({ sessionUpdate: "compaction_summary_chunk", compactionId, content: { type: "text", text: piece } });
    }
    await send({ sessionUpdate: "compaction_update", compactionId, status: "completed" });
  },

  async notice({ send }) {
    await send({ sessionUpdate: "notice", severity: "info", title: "Info notice", description: "Just so you know." });
    await send({ sessionUpdate: "notice", severity: "warning", title: "Warning notice", description: "Careful." });
    await send({ sessionUpdate: "notice", severity: "error", title: "Error notice", description: "Something broke." });
  },

  async cursor({ send, signal }) {
    const cursorId = nextId("cursor");
    await send({ sessionUpdate: "cursor_update", cursorId, capabilities: { fork: {} } });
    await streamText(send, `Announced forkable cursor \`${cursorId}\`. Try forking the conversation here.`, signal);
  },

  async suggest({ send, signal }) {
    await streamText(send, "Pick a follow-up:", signal);
    await send({
      sessionUpdate: "prompt_suggestions_update",
      suggestions: ["/tool", "/plan", "/subagent"].map((text) => ({ prompt: [{ type: "text", text }] })),
    });
  },

  async title({ send, session }) {
    session.title = `Agent title ${new Date().toLocaleTimeString()}`;
    await send({ sessionUpdate: "session_info_update", title: session.title, updatedAt: new Date().toISOString() });
  },

  async fail() {
    throw new Error("Scenario /fail: the agent failed on purpose");
  },
};

// ---------------------------------------------------------------- agent
const app = agent({ name: "argos-acp-testbed" })
  .onRequest("initialize", ({ params }) => {
    log("initialize", { protocolVersion: params.protocolVersion, clientCapabilities: params.clientCapabilities });
    return {
      protocolVersion: PROTOCOL_VERSION,
      agentInfo: { name: "argos-acp-testbed", title: "Argos ACP testbed", version: "1.0.0" },
      authMethods: REQUIRE_AUTH ? [{ id: "testbed-login", name: "Testbed login", description: "Always succeeds" }] : [],
      agentCapabilities: {
        loadSession: true,
        promptCapabilities: { image: true, embeddedContext: true },
        sessionCapabilities: {
          list: {},
          resume: {},
          close: {},
          delete: {},
          archive: {},
          status: {},
          fork: {},
          ...(NO_TITLE ? {} : { title: {} }),
        },
      },
    };
  })
  .onRequest("authenticate", ({ params }) => {
    log("authenticate", params);
    authenticated = true;
    return {};
  })
  .onRequest("session/new", async ({ params, client }) => {
    if (!authenticated) throw RequestError.authRequired();
    const session = createSession(params.cwd);
    log("session/new", { sessionId: session.sessionId, cwd: params.cwd, mcpServers: params.mcpServers?.length ?? 0 });
    queueMicrotask(() => {
      void updater(
        client,
        session.sessionId,
      )({
        sessionUpdate: "available_commands_update",
        availableCommands: COMMANDS.map((command) => ({ name: command.name, description: command.description })),
      });
    });
    return { sessionId: session.sessionId, configOptions: configOptions(session.config) };
  })
  .onRequest("session/load", async ({ params, client }) => {
    const session = sessions.get(params.sessionId) ?? createSession(params.cwd, params.sessionId);
    log("session/load", { sessionId: params.sessionId });
    const send = updater(client, session.sessionId);
    await send({ sessionUpdate: "user_message_chunk", content: { type: "text", text: "(replayed) earlier question" } });
    await send({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "(replayed) earlier answer" } });
    return { configOptions: configOptions(session.config) };
  })
  .onRequest("session/resume", ({ params }) => {
    const session = sessions.get(params.sessionId) ?? createSession(params.cwd, params.sessionId);
    log("session/resume", { sessionId: session.sessionId });
    return { configOptions: configOptions(session.config) };
  })
  .onRequest("session/list", ({ params }) => {
    log("session/list", params);
    return {
      sessions: [...sessions.values()].map((session) => ({
        sessionId: session.sessionId,
        cwd: session.cwd,
        title: session.title,
        updatedAt: session.updatedAt,
        archived: session.archived,
      })),
    };
  })
  .onRequest("session/status", ({ params }) => {
    const session = getSession(params.sessionId);
    return { status: session.running ? "running" : "open" };
  })
  .onRequest("session/close", ({ params }) => {
    log("session/close", params);
    sessions.get(params.sessionId)?.running?.abort();
    return {};
  })
  .onRequest("session/delete", ({ params }) => {
    log("session/delete", params);
    sessions.get(params.sessionId)?.running?.abort();
    sessions.delete(params.sessionId);
    return {};
  })
  .onRequest("session/archive", ({ params }) => {
    log("session/archive", params);
    getSession(params.sessionId).archived = true;
    return {};
  })
  .onRequest("session/unarchive", ({ params }) => {
    log("session/unarchive", params);
    getSession(params.sessionId).archived = false;
    return {};
  })
  .onRequest("session/fork", ({ params }) => {
    const source = getSession(params.sessionId);
    const fork = createSession(params.cwd ?? source.cwd);
    fork.config = { ...source.config };
    fork.title = source.title ? `${source.title} (fork)` : null;
    log("session/fork", { from: params.sessionId, to: fork.sessionId, params });
    return { sessionId: fork.sessionId, configOptions: configOptions(fork.config) };
  })
  .onRequest("session/set_title", async ({ params }) => {
    log(`session/set_title "${params.title}" (answering in ${TITLE_DELAY_MS}ms)`);
    // Deliberately slow: renaming in Argos must not wait on this.
    await sleep(TITLE_DELAY_MS);
    getSession(params.sessionId).title = params.title;
    log("session/set_title done", params.sessionId);
    return { title: params.title };
  })
  .onRequest("session/set_config_option", ({ params }) => {
    const session = getSession(params.sessionId);
    log("session/set_config_option", { sessionId: params.sessionId, configId: params.configId, value: params.value });
    if (params.configId === "model" && typeof params.value === "string") session.config.model = params.value;
    if (params.configId === "verbose") session.config.verbose = Boolean(params.value);
    return { configOptions: configOptions(session.config) };
  })
  .onRequest("session/prompt", async ({ params, client, signal }) => {
    const session = getSession(params.sessionId);
    const text = params.prompt
      .map((block) => (block.type === "text" ? block.text : `[${block.type}]`))
      .join(" ")
      .trim();
    log("session/prompt", { sessionId: session.sessionId, text, config: session.config });

    const controller = new AbortController();
    signal.addEventListener("abort", () => controller.abort(), { once: true });
    session.running = controller;
    session.prompts += 1;
    session.updatedAt = new Date().toISOString();
    const send = updater(client, session.sessionId);

    try {
      const command = text.match(/^\/([\w-]+)/)?.[1];
      const scenario = command ? scenarios[command] : undefined;
      let stop: schema.StopReason | void = undefined;
      if (scenario) {
        stop = await scenario({ session, send, client, signal: controller.signal, text });
      } else {
        await send({
          sessionUpdate: "agent_thought_chunk",
          content: { type: "text", text: "Thinking about the reply…" },
        });
        await streamText(
          send,
          `You said: "${text}". (model=${session.config.model}, verbose=${session.config.verbose}). Type /help for scenarios.`,
          controller.signal,
        );
        if (session.prompts === 1) {
          // Agent-proposed title for brand new conversations.
          session.title = text.slice(0, 40) || "Testbed chat";
          await send({ sessionUpdate: "session_info_update", title: session.title });
        }
      }
      await send({
        sessionUpdate: "usage_update",
        used: 1200 * session.prompts,
        size: 200_000,
        cost: { amount: 0.001 * session.prompts, currency: "USD" },
      });
      return { stopReason: controller.signal.aborted ? "cancelled" : (stop ?? "end_turn") };
    } finally {
      session.running = null;
    }
  })
  .onNotification("session/cancel", ({ params }) => {
    log("session/cancel", params);
    sessions.get(params.sessionId)?.running?.abort();
  })
  .onRequest("*", ({ method, params }) => {
    log("UNHANDLED request", method, params);
    throw RequestError.methodNotFound(method);
  })
  .onNotification("*", ({ method, params }) => {
    log("unhandled notification", method, params);
  });

log(`starting (pid ${process.pid}); title capability ${NO_TITLE ? "OFF" : "ON"}; log file ${LOG_FILE}`);
const stream = ndJsonStream(
  Writable.toWeb(process.stdout) as WritableStream<Uint8Array>,
  Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>,
);
const connection = app.connect(stream);
await connection.closed;
log("connection closed");
