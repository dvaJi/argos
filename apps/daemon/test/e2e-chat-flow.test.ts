import { startDaemon, type DaemonHandle } from "../src/index";

type TestResult = {
  name: string;
  passed: boolean;
  error?: string;
  durationMs: number;
};

const results: TestResult[] = [];

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, durationMs: Date.now() - start });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, error: msg, durationMs: Date.now() - start });
    console.error(`  ✗ ${name}: ${msg}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function assertEq<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertContains(actual: string, expected: string, message: string): void {
  if (!actual.includes(expected)) {
    throw new Error(`${message}: expected to contain "${expected}", got "${actual.slice(0, 200)}"`);
  }
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
  console.log("=== E2E Chat Flow Test ===\n");

  let daemon: DaemonHandle;
  try {
    console.log("--- Starting daemon ---");
    daemon = await startDaemon({ port: 0 });
    const port = (daemon as any).port;
    console.log(`Daemon started on port ${port}\n`);

    // 1. Health check
    await test("Health check", async () => {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      const data = await res.json();
      assertEq(data.status, "ok", "health status");
    });

    // 2. Add a provider (with dummy key for testing)
    await test("Add OpenAI provider", async () => {
      const res = await postRoute(port, "providers.add", {
        provider: {
          id: "openai",
          name: "OpenAI",
          apiType: "openai",
          apiKey: "sk-test-dummy-key-for-wiring-test",
          baseUrl: "https://api.openai.com/v1",
          enable: true,
        },
      });
      assertEq(res.ok, true, "route response ok");
      assert(res.output?.provider?.id === "openai", "provider added");
    });

    // 3. Verify provider is listed
    await test("Provider listed after add", async () => {
      const res = await postRoute(port, "providers.list");
      assertEq(res.ok, true, "route response ok");
      const providers = res.output?.providers || [];
      assert(providers.length > 0, "has providers");
      assert(
        providers.some((p: any) => p.id === "openai"),
        "openai provider exists",
      );
    });

    // 4. Create a session
    let sessionId: string;
    await test("Create session", async () => {
      const res = await postRoute(port, "sessions.create", {
        agentId: "argos",
        message: "Hello, this is a test message.",
        providerId: "openai",
        modelId: "gpt-4o-mini",
      });
      assertEq(res.ok, true, "route response ok");
      sessionId = res.output?.session?.id;
      assert(sessionId, "session id returned");
      console.log(`    Session ID: ${sessionId}`);
    });

    // 5. Test connection (will fail with dummy key, but wiring is correct)
    await test("Test connection returns error for dummy key", async () => {
      const res = await postRoute(port, "providers.testConnection", {
        providerId: "openai",
      });
      assertEq(res.ok, true, "route response ok");
      // Should return isOk: false because the dummy key won't work
      assertEq(res.output?.isOk, false, "connection should fail with dummy key");
      assert(res.output?.errorMsg, "should have error message");
      console.log(`    Error: ${res.output.errorMsg}`);
    });

    // 6. Send message (will fail with dummy key, but wiring is correct)
    await test("Chat.sendMessage routes to provider execution", async () => {
      const res = await postRoute(port, "chat.sendMessage", {
        sessionId: sessionId!,
        content: "Hello, this is a test message.",
      });
      // Route is dispatched correctly (not "unknown route")
      // The LLM call fails with dummy key — that's expected
      // We verify the route was recognized and reached the provider execution port
      assert(res.ok || res.error?.message?.includes("API"), "route reached provider execution");
    });

    // 7. Stop stream (should work even without active stream)
    await test("Chat.stopStream works", async () => {
      const res = await postRoute(port, "chat.stopStream", {
        sessionId: sessionId!,
      });
      assertEq(res.ok, true, "route response ok");
      assertEq(res.output?.stopped, true, "stopped");
    });

    // 8. Session still exists after chat attempt
    await test("Session persists after chat", async () => {
      const res = await postRoute(port, "sessions.restore", {
        sessionId: sessionId!,
      });
      assertEq(res.ok, true, "route response ok");
      assert(res.output?.session, "session exists");
    });

    // 9. Delete session
    await test("Delete session", async () => {
      const res = await postRoute(port, "sessions.delete", {
        sessionId: sessionId!,
      });
      assertEq(res.ok, true, "route response ok");
      assertEq(res.output?.deleted, true, "deleted");
    });

    // 10. Verify session is gone
    await test("Session gone after delete", async () => {
      const res = await postRoute(port, "sessions.restore", {
        sessionId: sessionId!,
      });
      assertEq(res.ok, true, "route response ok");
      assertEq(res.output?.session, null, "session is null");
    });
  } finally {
    console.log("\n--- Stopping daemon ---");
    await daemon!.close();
  }

  // === Summary ===
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
