/**
 * E2E test: Config ACP round-trip
 *
 * Verifies that the daemon correctly persists and retrieves the ACP enabled state
 * through the config.setAcpEnabled / config.getAcpState route pair.
 *
 * Run with: bun run apps/daemon/test/e2e-config-roundtrip.test.ts
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
  console.log("\n=== E2E: Config ACP Round-Trip ===\n");

  const DATA_DIR = `/tmp/argos-e2e-config-${Date.now()}`;
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

  try {
    await test("config.getAcpState returns initial disabled state", async () => {
      const res = await postRoute(port, "config.getAcpState");
      assert(res.ok === true, `expected ok=true, got: ${JSON.stringify(res)}`);
      assert(typeof res.output.enabled === "boolean", "output.enabled should be boolean");
      assert(Array.isArray(res.output.agents), "output.agents should be array");
    });

    await test("config.setAcpEnabled(true) succeeds", async () => {
      const res = await postRoute(port, "config.setAcpEnabled", { enabled: true });
      assert(res.ok === true, `expected ok=true, got: ${JSON.stringify(res)}`);
    });

    await test("config.getAcpState reflects enabled=true", async () => {
      const res = await postRoute(port, "config.getAcpState");
      assert(res.ok === true, `expected ok=true, got: ${JSON.stringify(res)}`);
      assert(res.output.enabled === true, `expected enabled=true, got: ${res.output.enabled}`);
    });

    await test("config.setAcpEnabled(false) succeeds", async () => {
      const res = await postRoute(port, "config.setAcpEnabled", { enabled: false });
      assert(res.ok === true, `expected ok=true, got: ${JSON.stringify(res)}`);
    });

    await test("config.getAcpState reflects enabled=false after disabling", async () => {
      const res = await postRoute(port, "config.getAcpState");
      assert(res.ok === true, `expected ok=true, got: ${JSON.stringify(res)}`);
      assert(res.output.enabled === false, `expected enabled=false, got: ${res.output.enabled}`);
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
