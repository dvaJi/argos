/**
 * E2E test: MCP server lifecycle
 *
 * Verifies the daemon MCP runtime wiring end-to-end:
 *   mcp.addServer → mcp.startServer → mcp.listToolDefinitions (finds "echo" tool) →
 *   mcp.stopServer → mcp.removeServer
 *
 * Uses a minimal local mock MCP server (mock-mcp-server.mjs) that speaks the
 * NDJSON stdio transport used by @modelcontextprotocol/sdk v1.29.0.
 *
 * Run with: bun run apps/daemon/test/e2e-mcp-lifecycle.test.ts
 */
import { startDaemon, type DaemonHandle } from "../src/index";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

type TestResult = { name: string; passed: boolean; error?: string; durationMs: number };

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, durationMs: Date.now() - start });
    console.log(`  PASS ${name}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, error: msg, durationMs: Date.now() - start });
    console.error(`  FAIL ${name}: ${msg}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function postRoute(port: number, route: string, input: Record<string, unknown> = {}): Promise<any> {
  const res = await fetch(`http://127.0.0.1:${port}/api/v1/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ route, input }),
  });
  return res.json();
}

/** Resolve the absolute path to the mock MCP server script. */
function resolveMockServerPath(): string {
  // Works in both Bun (import.meta.dir) and Node.js (import.meta.url)
  const dir = typeof (import.meta as any).dir === "string"
    ? (import.meta as any).dir
    : dirname(fileURLToPath(import.meta.url));
  return join(dir, "mock-mcp-server.mjs");
}

async function run(): Promise<void> {
  console.log("\n=== E2E: MCP Server Lifecycle ===\n");

  const mockServerPath = resolveMockServerPath();
  if (!existsSync(mockServerPath)) {
    console.error(`Mock MCP server not found at: ${mockServerPath}`);
    process.exit(1);
  }

  const DATA_DIR = `/tmp/argos-e2e-mcp-${Date.now()}`;
  let daemon: DaemonHandle;
  let port: number;

  console.log("--- Starting daemon ---");
  try {
    daemon = await startDaemon({ dataDir: DATA_DIR, host: "127.0.0.1", port: 0 });
    port = daemon.port;
    console.log(`Daemon started on port ${port}`);
    console.log(`Mock server path: ${mockServerPath}\n`);
  } catch (error) {
    console.error("Failed to start daemon:", error);
    process.exit(1);
  }

  const SERVER_NAME = "mock-e2e-server";

  try {
    await test("mcp.addServer registers the mock server config", async () => {
      const res = await postRoute(port, "mcp.addServer", {
        serverName: SERVER_NAME,
        config: {
          type: "stdio",
          command: "node",
          args: [mockServerPath],
          env: {},
          descriptions: "Mock MCP server for e2e tests",
          icons: "🔧",
          autoApprove: [],
          enabled: true,
        },
      });
      assert(res.ok === true, `expected ok=true, got: ${JSON.stringify(res)}`);
      assert(res.output.success === true, `expected success=true, got: ${JSON.stringify(res.output)}`);
    });

    await test("mcp.startServer launches the mock server", async () => {
      const res = await postRoute(port, "mcp.startServer", { serverName: SERVER_NAME });
      assert(res.ok === true, `expected ok=true, got: ${JSON.stringify(res)}`);
      assert(res.output.started === true, `expected started=true, got: ${JSON.stringify(res.output)}`);
    });

    await test("mcp.listToolDefinitions includes the echo tool from mock server", async () => {
      const res = await postRoute(port, "mcp.listToolDefinitions", {});
      assert(res.ok === true, `expected ok=true, got: ${JSON.stringify(res)}`);
      assert(Array.isArray(res.output.tools), "output.tools should be array");
      // Tools are returned as { type: "function", function: { name, ... }, server }
      const echoTool = res.output.tools.find(
        (t: any) => t.function?.name === "echo" || t.function?.name?.endsWith("__echo"),
      );
      assert(echoTool !== undefined, `"echo" tool not found in tool list: ${JSON.stringify(res.output.tools)}`);
    });

    await test("mcp.stopServer terminates the mock server", async () => {
      const res = await postRoute(port, "mcp.stopServer", { serverName: SERVER_NAME });
      assert(res.ok === true, `expected ok=true, got: ${JSON.stringify(res)}`);
      assert(res.output.stopped === true, `expected stopped=true, got: ${JSON.stringify(res.output)}`);
    });

    await test("mcp.removeServer removes the server config", async () => {
      const res = await postRoute(port, "mcp.removeServer", { serverName: SERVER_NAME });
      assert(res.ok === true, `expected ok=true, got: ${JSON.stringify(res)}`);
      assert(res.output.removed === true, `expected removed=true, got: ${JSON.stringify(res.output)}`);
    });
  } finally {
    console.log("\n--- Stopping daemon ---");
    await daemon.close();
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalTime = results.reduce((sum, r) => sum + r.durationMs, 0);

  console.log(`\n=== Results: ${passed} passed, ${failed} failed (${totalTime}ms) ===`);

  if (failed > 0) {
    console.log("\nFailed tests:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  - ${r.name}: ${r.error}`);
    }
    process.exit(1);
  }
}

run().catch((error) => {
  console.error("E2E test failed:", error);
  process.exit(1);
});
