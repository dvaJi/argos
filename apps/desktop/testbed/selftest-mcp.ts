/**
 * Automated self-test: drives Argos's real McpClient against the testbed
 * MCP server and checks every feature end to end. Dev-only.
 *
 *   bun apps/desktop/testbed/selftest-mcp.ts            # HTTP
 *   bun apps/desktop/testbed/selftest-mcp.ts --oauth    # HTTP + OAuth
 *   bun apps/desktop/testbed/selftest-mcp.ts --stdio    # stdio transport
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { McpClient } from "../../../packages/mcp-runtime/src/index.ts";

const SERVER = path.join(import.meta.dir, "mcp-server.ts");
const DESKTOP = path.join(import.meta.dir, "..");
const PORT = Number(process.env.TB_PORT ?? 4870);
const oauth = process.argv.includes("--oauth");
const stdio = process.argv.includes("--stdio");
const srvLog: string[] = [];
const startServer = async () => {
  const proc = spawn("bun", [SERVER, "--port", String(PORT), ...(oauth ? ["--oauth"] : [])], {
    cwd: DESKTOP,
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stderr.on("data", (d) => {
    const s = String(d);
    srvLog.push(s);
    if (process.env.VERBOSE) process.stdout.write("[srv] " + s);
  });
  await new Promise<void>((res, rej) => {
    const t = setTimeout(() => rej(new Error("server did not start:\n" + srvLog.join(""))), 20000);
    proc.stderr.on("data", (d) => {
      if (String(d).includes("MCP server") && String(d).includes("listening")) {
        clearTimeout(t);
        res();
      }
    });
  });
  return proc;
};
const killServer = async (proc: ReturnType<typeof spawn>) => {
  const exited = new Promise((r) => proc.once("exit", r));
  if (process.platform === "win32") spawn("taskkill", ["/PID", String(proc.pid), "/T", "/F"]);
  else proc.kill();
  await exited;
};
let srv = stdio ? null : await startServer();

const files = new Map<string, unknown>();
let browserOpens = 0;
const elicitations: any[] = [];
const progress: any[] = [];
const samplings: any[] = [];
const noop = () => {};
const ports: any = {
  paths: { homeDir: () => "/tmp", appVersion: () => "0.0.0-e2e" },
  runtime: {
    initializeRuntimes: noop,
    expandPath: (p: string) => p,
    processCommandWithArgs: (c: string, a: string[]) => ({ command: c, args: a }),
    normalizePathEnv: (p: string[]) => ({ key: "PATH", value: p.join(";") }),
    getDefaultPaths: () => [],
    getBunRuntimePath: () => null,
    getUvRuntimePath: () => null,
    setBunRuntimePath: noop,
    setUvRuntimePath: noop,
  },
  events: {
    broadcast: (ch: string, p: any) => {
      if (ch === "mcp:tool-call-progress") progress.push(p);
    },
    broadcastError: noop,
    subscribe: () => noop,
  },
  proxy: { getProxyUrl: () => null },
  services: {
    getMcpServers: async () => ({}),
    readJsonFile: async (k: string) => files.get(k) ?? null,
    writeJsonFile: async (k: string, v: unknown) => {
      files.set(k, v);
    },
    openExternal: async (url: string) => {
      browserOpens++;
      let next = url;
      for (let i = 0; i < 6; i++) {
        const r = await fetch(next, { redirect: "manual" });
        const loc = r.headers.get("location");
        if (!loc) return;
        next = new URL(loc, next).href;
      }
    },
    handleElicitationRequest: async (payload: any) => {
      elicitations.push(payload);
      const m = String(payload.message);
      if (m.includes('type "one"')) return { action: "accept", content: { answer: "one" } };
      if (m.includes('type "two"')) return { action: "accept", content: { answer: "two" } };
      if (m.includes("deployment target")) return { action: "accept", content: { target: "staging", confirm: true } };
      return {
        action: "accept",
        content: { name: "Ada", color: "green", age: 36, budget: 12.5, subscribe: true, tags: ["alpha"] },
      };
    },
    cancelElicitationRequest: async () => {},
    handleSamplingRequest: async (p: any) => (
      samplings.push(p),
      { requestId: p.requestId, approved: true, providerId: "prov", modelId: "model-x" }
    ),
    cancelSamplingRequest: async () => {},
    generateCompletionStandalone: async () => "fake completion",
    getProviderModels: () => [{ id: "model-x", name: "Model X" }],
    getCustomModels: () => [],
  },
};
// In stdio mode the server's stderr arrives through McpClient's relay.
const origInfo = console.info;
console.info = (...a: unknown[]) => {
  const line = a.map(String).join(" ");
  if (line.includes("StdioClientTransport")) srvLog.push(line);
  else if (process.env.VERBOSE) origInfo(...a);
};
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"} ${name} ${extra}`);
  if (!ok) process.exitCode = 1;
};
const t = (r: any) => JSON.stringify(r?.content ?? r);
const step = async (name: string, fn: () => Promise<void>) => {
  try {
    await fn();
  } catch (e) {
    check(name, false, String(e).slice(0, 300));
  }
};

const client = new McpClient(
  "testbed",
  (stdio
    ? { type: "stdio", command: "bun", args: [SERVER, "--stdio"], env: {}, enabled: true, cwd: DESKTOP }
    : { type: "http", baseUrl: `http://127.0.0.1:${PORT}/mcp`, oauth, enabled: true, cwd: DESKTOP }) as any,
  ports,
);
try {
  await step("connect", async () => {
    await client.connect();
    const tools = await client.listTools();
    check("connect + list tools", tools.length >= 10, `(${tools.map((x) => x.name).join(",")})`);
  });
  await step("echo", async () => {
    progress.length = 0;
    const r = await client.callTool("echo", { text: "hi" });
    check("plain tool (no task)", t(r).includes("echo: hi") && progress.length === 0);
  });
  await step("fail", async () => {
    const r: any = await client.callTool("fail_tool", {});
    check("tool-level error", r.isError === true);
  });
  await step("long_task", async () => {
    progress.length = 0;
    const r = await client.callTool("long_task", { seconds: 3 }, { toolCallId: "tc-1" });
    const st = progress.map((p) => p.status);
    check(
      "optional task completes with progress",
      t(r).includes("finished after 3s") &&
        st.at(-1) === "completed" &&
        progress.some((p) => /step/.test(p.statusMessage ?? "")),
      `(${st.join(">")})`,
    );
  });
  await step("required_task", async () => {
    const r = await client.callTool("required_task", { seconds: 2 });
    check("required task completes", t(r).includes("finished after 2s"));
  });
  await step("abort task", async () => {
    progress.length = 0;
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 1500);
    let err = "";
    try {
      await client.callTool("long_task", { seconds: 30 }, { signal: ac.signal });
    } catch (e) {
      err = String(e);
    }
    await new Promise((r) => setTimeout(r, 1500));
    check(
      "STOP cancels task (server saw tasks/cancel)",
      /cancelled/.test(err) &&
        srvLog.join("").includes("<- tasks/cancel") &&
        srvLog.join("").includes("cancelled by the client") &&
        progress.at(-1)?.status === "cancelled",
    );
  });
  await step("abort plain", async () => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 1500);
    let err = "";
    try {
      await client.callTool("slow_plain", { seconds: 30 }, { signal: ac.signal });
    } catch (e) {
      err = String(e);
    }
    await new Promise((r) => setTimeout(r, 1500));
    check(
      "STOP cancels plain call (server saw notifications/cancelled)",
      err !== "" &&
        srvLog.join("").includes("<- notifications/cancelled") &&
        srvLog.join("").includes("slow_plain aborted"),
      `(${err.slice(0, 80)})`,
    );
  });
  await step("ask_form", async () => {
    const r = await client.callTool("ask_form", {});
    const last = elicitations.at(-1);
    check(
      "form elicitation (message + 6 fields reach host)",
      t(r).includes("accept") &&
        t(r).includes("Ada") &&
        last?.message?.includes("every field type") &&
        Object.keys(last?.requestedSchema?.properties ?? {}).length === 6,
    );
  });
  await step("ask_two", async () => {
    elicitations.length = 0;
    const r = await client.callTool("ask_two", {});
    const ids = elicitations.map((e) => e.requestId);
    check(
      "two concurrent elicitations routed",
      t(r).includes('\\"answer\\":\\"one\\"') &&
        t(r).includes('\\"answer\\":\\"two\\"') &&
        new Set(ids).size === 2 &&
        ids.every((i) => i.startsWith("testbed:")),
      `(${ids.join(", ")})`,
    );
  });
  await step("task_needs_input", async () => {
    progress.length = 0;
    elicitations.length = 0;
    const r = await client.callTool("task_needs_input", {});
    check(
      "task input_required -> elicitation -> result",
      t(r).includes("staging") && elicitations.length === 1,
      `(${progress.map((p) => p.status).join(">")}) ${t(r).slice(0, 120)}`,
    );
  });
  await step("sample", async () => {
    const r = await client.callTool("sample", {});
    check(
      "sampling (messages reach host)",
      t(r).includes("fake completion") && samplings.at(-1)?.messages?.length === 1,
      JSON.stringify(samplings.at(-1)?.messages ?? null).slice(0, 100),
    );
  });
  await step("roots", async () => {
    const r = await client.callTool("list_roots", {});
    check("roots/list", t(r).includes("file://"), t(r).slice(0, 100));
  });
  await step("templates", async () => {
    const tpl = await client.listResourceTemplates();
    check("resource templates listed", tpl.length === 3, `(${tpl.map((x) => x.uriTemplate).join(" ")})`);
  });
  await step("completion", async () => {
    const c: any = await client.completeArgument({
      ref: { type: "ref/resource", uri: "testbed://weather/{city}{?units}" },
      argument: { name: "city", value: "B" },
    } as any);
    const v = c?.completion?.values ?? c?.values ?? [];
    check("template argument completion", v.includes("Berlin"), JSON.stringify(c).slice(0, 120));
  });
  await step("prompt completion", async () => {
    const c: any = await client.completeArgument({
      ref: { type: "ref/prompt", name: "review_code" },
      argument: { name: "language", value: "ty" },
    } as any);
    const v = c?.completion?.values ?? c?.values ?? [];
    check("prompt argument completion", v.includes("typescript"), JSON.stringify(c).slice(0, 120));
  });
  if (oauth)
    await step("bad token", async () => {
      await client.disconnect();
      const before = browserOpens;
      const registration = JSON.stringify(files.get("mcp-oauth:testbed:client"));
      files.set("mcp-oauth:testbed:tokens", { access_token: "bogus", token_type: "bearer" });
      const again = new McpClient(
        "testbed",
        { type: "http", baseUrl: `http://127.0.0.1:${PORT}/mcp`, oauth, enabled: true } as any,
        ports,
      );
      await again.connect();
      const tools = await again.listTools();
      await again.disconnect();
      check(
        "bad token -> one re-auth, same registration",
        browserOpens === before + 1 &&
          tools.length > 0 &&
          JSON.stringify(files.get("mcp-oauth:testbed:client")) === registration,
      );
      await client.connect();
    });
  if (srv && !oauth)
    await step("server restart", async () => {
      // The server process dies and comes back: its old session is gone, so
      // the next call hits a session error and must reconnect, not crash.
      // A tool error empties the client's tool cache, so the next call's
      // task-support probe (tools/list) is the request that hits the dead session.
      await client.callTool("fail_tool", {});
      await killServer(srv!);
      srv = await startServer();
      let r: any;
      let err = "";
      try {
        r = await client.callTool("echo", { text: "again" });
      } catch (e) {
        err = String(e);
      }
      check(
        "call after server restart reconnects transparently",
        String(t(r)).includes("echo: again"),
        err.slice(0, 160),
      );

      // Warm cache this time: tools/call itself hits the dead session.
      await killServer(srv!);
      srv = await startServer();
      err = "";
      try {
        r = await client.callTool("echo", { text: "third" });
      } catch (e) {
        err = String(e);
      }
      check("tools/call on a lost session is retried once", String(t(r)).includes("echo: third"), err.slice(0, 160));

      // A task whose session is lost mid-run must not be started again: the
      // first run may already have had side effects.
      const running = client.callTool("long_task", { seconds: 30 }, { toolCallId: "tc-restart" }).then(
        () => "resolved",
        (e) => `rejected: ${String(e).slice(0, 80)}`,
      );
      await new Promise((res) => setTimeout(res, 1500));
      await killServer(srv!);
      srv = await startServer();
      const afterRestart = srvLog.length;
      const outcome = await running;
      await new Promise((res) => setTimeout(res, 500));
      const reissued = srvLog
        .slice(afterRestart)
        .some((line) => line.includes("<- tools/call") && line.includes("long_task"));
      check(
        "lost session mid-task does not start the task again",
        !reissued && outcome.startsWith("rejected"),
        outcome,
      );
    });
  await step("read", async () => {
    const r: any = await client.readResource("testbed://files/docs/guide/setup.md");
    check("read {+path} resource", JSON.stringify(r).includes("Contents of docs/guide/setup.md"));
  });
} finally {
  await client.disconnect().catch(() => {});
  if (srv) await killServer(srv).catch(() => {});
  console.log(process.exitCode ? "\nSome checks FAILED (re-run with VERBOSE=1 for logs)" : "\nAll checks passed");
  setTimeout(() => process.exit(), 300);
}
