/**
 * E2E test: ACP execution smoke test
 *
 * Verifies the daemon correctly routes chat.sendMessage through the ACP provider
 * execution port when the session's providerId is "acp". The test intentionally
 * uses a non-existent agent model — the expected outcome is an error that proves
 * the ACP plumbing is wired correctly (not an "unknown route" or missing runtime
 * error, but rather "ACP agent not found").
 *
 * Run with: bun run apps/daemon/test/e2e-acp-smoke.test.ts
 */
import { startDaemon, type DaemonHandle } from "../src/index";

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

async function run(): Promise<void> {
  console.log("\n=== E2E: ACP Execution Smoke Test ===\n");

  const DATA_DIR = `/tmp/argos-e2e-acp-${Date.now()}`;
  let daemon: DaemonHandle;
  let port: number;

  console.log("--- Starting daemon ---");
  try {
    daemon = await startDaemon({ dataDir: DATA_DIR, host: "127.0.0.1", port: 0 });
    port = daemon.port;
    console.log(`Daemon started on port ${port}\n`);
  } catch (error) {
    console.error("Failed to start daemon:", error);
    process.exit(1);
  }

  let sessionId: string;

  try {
    await test("sessions.create with providerId=acp succeeds", async () => {
      const res = await postRoute(port, "sessions.create", {
        agentId: "argos",
        message: "hello from e2e acp smoke test",
        providerId: "acp",
        modelId: "nonexistent-acp-agent",
      });
      assert(res.ok === true, `expected ok=true, got: ${JSON.stringify(res)}`);
      assert(typeof res.output.session?.id === "string", "session.id should be a string");
      assert(res.output.session.id.length > 0, "session.id should not be empty");
      sessionId = res.output.session.id;
    });

    await test("chat.sendMessage routes to ACP execution port (not LLM provider)", async () => {
      const res = await postRoute(port, "chat.sendMessage", {
        sessionId,
        content: "test message via ACP",
      });
      // The ACP provider execution port should throw "ACP agent not found" because
      // "nonexistent-acp-agent" is not configured. This proves the routing plumbing
      // is wired: we reached the ACP port, not the LLM port.
      assert(res.ok === false, `expected ok=false (ACP agent lookup failure), got ok=true`);
      assert(
        res.error.message.includes("ACP agent not found"),
        `expected "ACP agent not found" in error, got: ${res.error.message}`,
      );
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
