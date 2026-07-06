/**
 * E2E test: Memory add → list → search → delete round-trip
 *
 * Verifies the daemon memory runtime wiring end-to-end:
 *   memory.add → memory.list → memory.search → memory.delete → memory.list (empty)
 *
 * Run with: bun run apps/daemon/test/e2e-memory-roundtrip.test.ts
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
  console.log("\n=== E2E: Memory Round-Trip ===\n");

  const DATA_DIR = `/tmp/argos-e2e-memory-${Date.now()}`;
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

  const AGENT_ID = "test-agent";
  // Use a unique token to ensure FTS5 and LIKE fallback both work
  const UNIQUE_TOKEN = `argose2etoken${Date.now()}`;
  const MEMORY_CONTENT = `Integration test memory with unique token ${UNIQUE_TOKEN}`;
  let memoryId: string;

  try {
    await test("memory.list returns empty array initially", async () => {
      const res = await postRoute(port, "memory.list", { agentId: AGENT_ID });
      assert(res.ok === true, `expected ok=true, got: ${JSON.stringify(res)}`);
      assert(Array.isArray(res.output.memories), "output.memories should be array");
      assert(res.output.memories.length === 0, `expected 0 memories, got ${res.output.memories.length}`);
    });

    await test("memory.add stores a new memory", async () => {
      const res = await postRoute(port, "memory.add", {
        agentId: AGENT_ID,
        content: MEMORY_CONTENT,
        kind: "semantic",
        importance: 0.8,
      });
      assert(res.ok === true, `expected ok=true, got: ${JSON.stringify(res)}`);
      assert(res.output.result.action === "created", `expected action=created, got: ${res.output.result.action}`);
      assert(typeof res.output.result.memoryId === "string", "memoryId should be a string");
      assert(res.output.result.memoryId.length > 0, "memoryId should not be empty");
      memoryId = res.output.result.memoryId;
    });

    await test("memory.list returns the added memory", async () => {
      const res = await postRoute(port, "memory.list", { agentId: AGENT_ID });
      assert(res.ok === true, `expected ok=true, got: ${JSON.stringify(res)}`);
      assert(res.output.memories.length === 1, `expected 1 memory, got ${res.output.memories.length}`);
      const mem = res.output.memories[0];
      assert(mem.id === memoryId, `expected id=${memoryId}, got: ${mem.id}`);
      assert(mem.agentId === AGENT_ID, `expected agentId=${AGENT_ID}, got: ${mem.agentId}`);
      assert(mem.content === MEMORY_CONTENT, "content mismatch");
      assert(mem.kind === "semantic", `expected kind=semantic, got: ${mem.kind}`);
    });

    await test("memory.search finds the memory by unique token", async () => {
      const res = await postRoute(port, "memory.search", {
        agentId: AGENT_ID,
        query: UNIQUE_TOKEN,
        limit: 10,
      });
      assert(res.ok === true, `expected ok=true, got: ${JSON.stringify(res)}`);
      assert(Array.isArray(res.output.results), "results should be array");
      assert(res.output.results.length > 0, "search should return at least one result");
      const found = res.output.results.some((r: any) => r.id === memoryId);
      assert(found, `memory ${memoryId} not found in search results`);
    });

    await test("memory.delete removes the memory", async () => {
      const res = await postRoute(port, "memory.delete", { agentId: AGENT_ID, memoryId });
      assert(res.ok === true, `expected ok=true, got: ${JSON.stringify(res)}`);
      assert(res.output.ok === true, `expected output.ok=true, got: ${res.output.ok}`);
    });

    await test("memory.list is empty after deletion", async () => {
      const res = await postRoute(port, "memory.list", { agentId: AGENT_ID });
      assert(res.ok === true, `expected ok=true, got: ${JSON.stringify(res)}`);
      assert(res.output.memories.length === 0, `expected 0 memories after delete, got ${res.output.memories.length}`);
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
