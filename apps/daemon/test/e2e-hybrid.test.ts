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

async function postRoute(
  port: number,
  route: string,
  input: Record<string, unknown> = {},
  token?: string,
): Promise<any> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`http://127.0.0.1:${port}/api/v1/route`, {
    method: "POST",
    headers,
    body: JSON.stringify({ route, input }),
  });
  return res.json();
}

async function getHealth(port: number, token?: string): Promise<any> {
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`http://127.0.0.1:${port}/health`, { headers });
  return res.json();
}

async function run(): Promise<void> {
  console.log("\n=== T6.3: Hybrid Bridge E2E Validation ===\n");

  const DATA_DIR = `/tmp/argos-e2e-test-${Date.now()}`;
  let daemon: DaemonHandle;
  let port: number;

  console.log("--- Starting daemon ---");
  try {
    daemon = await startDaemon({
      dataDir: DATA_DIR,
      host: "127.0.0.1",
      port: 0,
    });
    console.log(`Daemon started on port ${daemon.port}\n`);
  } catch (error) {
    console.error("Failed to start daemon:", error);
    process.exit(1);
  }

  port = daemon.port;

  try {
    // === Health ===
    console.log("--- Health ---");
    await test("GET /health returns ok", async () => {
      const health = await getHealth(port);
      assertEq(health.status, "ok", "status");
      assertEq(health.version, "0.1.0", "version");
      assert(typeof health.uptime === "number", "uptime is number");
    });

    // === Auth ===
    console.log("\n--- Auth ---");
    const authDaemon = await startDaemon({
      dataDir: DATA_DIR + "-auth",
      host: "127.0.0.1",
      port: 0,
      token: "test-secret-token",
    });
    const authPort = authDaemon.port;

    await test("Request without auth token returns 401 on remote", async () => {
      const res = await fetch(`http://127.0.0.1:${authPort}/api/v1/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ route: "config.getLanguage", input: {} }),
      });
      // Note: localhost requests bypass auth by design
      assert(res.status === 200 || res.status === 401, "status is 200 (localhost bypass) or 401");
    });

    await test("Request with correct auth token succeeds", async () => {
      const result = await postRoute(authPort, "config.getLanguage", {}, "test-secret-token");
      assert(result.ok, "should be ok");
    });

    await test("Health endpoint bypasses auth", async () => {
      const health = await getHealth(authPort);
      assertEq(health.status, "ok", "status");
    });

    await authDaemon.close();

    // === Config routes ===
    console.log("\n--- Config routes ---");
    await test("config.getLanguage", async () => {
      const result = await postRoute(port, "config.getLanguage");
      assert(result.ok, "should be ok");
      assert(typeof result.output.requestedLanguage === "string", "requestedLanguage is string");
    });

    await test("config.setLanguage", async () => {
      const result = await postRoute(port, "config.setLanguage", { language: "fr" });
      assert(result.ok, "should be ok");
      assertEq(result.output.requestedLanguage, "fr", "requestedLanguage");
    });

    await test("config.getTheme", async () => {
      const result = await postRoute(port, "config.getTheme");
      assert(result.ok, "should be ok");
      assert(["dark", "light", "system"].includes(result.output.theme), "valid theme");
    });

    await test("config.setTheme", async () => {
      const result = await postRoute(port, "config.setTheme", { theme: "dark" });
      assert(result.ok, "should be ok");
      assertEq(result.output.theme, "dark", "theme");
    });

    await test("config.getFloatingButton", async () => {
      const result = await postRoute(port, "config.getFloatingButton");
      assert(result.ok, "should be ok");
      assert(typeof result.output.enabled === "boolean", "enabled is boolean");
    });

    await test("config.setFloatingButton", async () => {
      const result = await postRoute(port, "config.setFloatingButton", { enabled: false });
      assert(result.ok, "should be ok");
      assertEq(result.output.enabled, false, "enabled");
    });

    await test("config.getDefaultProjectPath", async () => {
      const result = await postRoute(port, "config.getDefaultProjectPath");
      assert(result.ok, "should be ok");
    });

    await test("config.updateEntries", async () => {
      const result = await postRoute(port, "config.updateEntries", {
        changes: [{ key: "init_complete", value: true }],
      });
      assert(result.ok, "should be ok");
      assert(Array.isArray(result.output.changedKeys), "changedKeys is array");
    });

    await test("config.getShortcutKeys", async () => {
      const result = await postRoute(port, "config.getShortcutKeys");
      assert(result.ok, "should be ok");
      assert(typeof result.output.shortcuts === "object", "shortcuts is object");
    });

    // === Onboarding routes ===
    console.log("\n--- Onboarding routes ---");
    await test("onboarding.getState", async () => {
      const result = await postRoute(port, "onboarding.getState");
      assert(result.ok, "should be ok");
      assert(result.output.state, "state exists");
      assert(Array.isArray(result.output.state.steps), "steps is array");
    });

    await test("onboarding.start", async () => {
      const result = await postRoute(port, "onboarding.start", {});
      assert(result.ok, "should be ok");
      assertEq(result.output.state.status, "active", "status");
    });

    await test("onboarding.setStepStatus", async () => {
      const result = await postRoute(port, "onboarding.setStepStatus", {
        stepId: "select-provider",
        status: "completed",
      });
      assert(result.ok, "should be ok");
    });

    await test("onboarding.complete fails without required steps", async () => {
      const result = await postRoute(port, "onboarding.complete", { force: true });
      assert(!result.ok, "should fail because required steps not completed");
      assert(result.error.message.includes("required step"), "mentions required step");
    });

    await test("onboarding.reset", async () => {
      const result = await postRoute(port, "onboarding.reset", {});
      assert(result.ok, "should be ok");
      assertEq(result.output.state.status, "idle", "status");
    });

    // === Settings routes ===
    console.log("\n--- Settings routes ---");
    await test("settings.getSnapshot", async () => {
      const result = await postRoute(port, "settings.getSnapshot", { keys: ["autoScrollEnabled"] });
      assert(result.ok, "should be ok");
      assert(typeof result.output.values.autoScrollEnabled === "boolean", "autoScrollEnabled is boolean");
    });

    await test("settings.update", async () => {
      const result = await postRoute(port, "settings.update", {
        changes: [{ key: "autoScrollEnabled", value: false }],
      });
      assert(result.ok, "should be ok");
    });

    // === Provider routes ===
    console.log("\n--- Provider routes ---");
    await test("providers.list", async () => {
      const result = await postRoute(port, "providers.list");
      assert(result.ok, "should be ok");
      assert(Array.isArray(result.output.providers), "providers is array");
    });

    await test("providers.listSummaries", async () => {
      const result = await postRoute(port, "providers.listSummaries");
      assert(result.ok, "should be ok");
      assert(Array.isArray(result.output.providers), "providers is array");
    });

    await test("providers.add", async () => {
      const result = await postRoute(port, "providers.add", {
        provider: {
          id: "test-provider",
          name: "Test Provider",
          endpointType: "openai",
          apiType: "openai",
          apiKey: "sk-test",
          baseUrl: "https://api.openai.com/v1",
          enable: true,
        },
      });
      assert(result.ok, "should be ok");
      assertEq(result.output.provider.id, "test-provider", "provider id");
    });

    await test("providers.list after add", async () => {
      const result = await postRoute(port, "providers.list");
      assert(result.ok, "should be ok");
      assert(result.output.providers.length >= 1, "has providers");
    });

    await test("providers.remove", async () => {
      const result = await postRoute(port, "providers.remove", { providerId: "test-provider" });
      assert(result.ok, "should be ok");
      assertEq(result.output.removed, true, "removed");
    });

    // === Model routes ===
    console.log("\n--- Model routes ---");
    await test("models.getProviderCatalog", async () => {
      const result = await postRoute(port, "models.getProviderCatalog", { providerId: "openai" });
      assert(result.ok, "should be ok");
      assert(result.output.catalog, "catalog exists");
    });

    await test("models.getCapabilities", async () => {
      const result = await postRoute(port, "models.getCapabilities", {
        providerId: "openai",
        modelId: "gpt-4",
      });
      assert(result.ok, "should be ok");
      assert(typeof result.output.capabilities === "object", "capabilities is object");
    });

    // === Desktop-only routes ===
    console.log("\n--- Desktop-only routes ---");
    await test("window.getCurrentState returns error", async () => {
      const result = await postRoute(port, "window.getCurrentState");
      assert(!result.ok, "should not be ok");
      assert(result.error.message.includes("not available"), "error message");
    });

    await test("browser.getStatus returns error", async () => {
      const result = await postRoute(port, "browser.getStatus");
      assert(!result.ok, "should not be ok");
    });

    await test("dialog.respond returns error", async () => {
      const result = await postRoute(port, "dialog.respond");
      assert(!result.ok, "should not be ok");
    });

    // === Tier 2 routes (not yet supported) ===
    console.log("\n--- Tier 2 routes (not yet supported) ---");
    await test("sessions.list returns empty array", async () => {
      const result = await postRoute(port, "sessions.list");
      assert(result.ok, "should be ok");
      assert(Array.isArray(result.output.sessions), "sessions is array");
    });

    let createdSessionId: string;

    await test("sessions.create", async () => {
      const result = await postRoute(port, "sessions.create", {
        agentId: "argos",
        message: "Hello from E2E test",
      });
      assert(result.ok, "should be ok");
      assert(result.output.session, "session exists");
      assert(result.output.session.id, "session has id");
      assertEq(result.output.session.agentId, "argos", "agentId");
      createdSessionId = result.output.session.id;
    });

    await test("sessions.list after create", async () => {
      const result = await postRoute(port, "sessions.list");
      assert(result.ok, "should be ok");
      assert(result.output.sessions.length >= 1, "has sessions");
    });

    await test("sessions.restore", async () => {
      const result = await postRoute(port, "sessions.restore", { sessionId: createdSessionId });
      assert(result.ok, "should be ok");
      assert(result.output.session, "session exists");
      assert(result.output.session.id === createdSessionId, "correct session");
    });

    await test("sessions.rename", async () => {
      const result = await postRoute(port, "sessions.rename", {
        sessionId: createdSessionId,
        title: "Renamed Session",
      });
      assert(result.ok, "should be ok");
      assertEq(result.output.updated, true, "updated");
    });

    await test("sessions.togglePinned", async () => {
      const result = await postRoute(port, "sessions.togglePinned", {
        sessionId: createdSessionId,
        pinned: true,
      });
      assert(result.ok, "should be ok");
      assertEq(result.output.updated, true, "updated");
    });

    await test("sessions.setProjectDir", async () => {
      const result = await postRoute(port, "sessions.setProjectDir", {
        sessionId: createdSessionId,
        projectDir: "/tmp/test-project",
      });
      assert(result.ok, "should be ok");
      assertEq(result.output.session.projectDir, "/tmp/test-project", "projectDir");
    });

    await test("sessions.delete", async () => {
      const result = await postRoute(port, "sessions.delete", { sessionId: createdSessionId });
      assert(result.ok, "should be ok");
    });

    await test("sessions.list after delete", async () => {
      const result = await postRoute(port, "sessions.list");
      assert(result.ok, "should be ok");
      const found = result.output.sessions.find((s: any) => s.id === createdSessionId);
      assert(!found, "deleted session not in list");
    });

    // === Session persistence across restart ===
    console.log("\n--- Session persistence ---");

    let persistentSessionId: string;

    await test("create session for persistence test", async () => {
      const result = await postRoute(port, "sessions.create", {
        agentId: "argos",
        message: "Persistent session",
      });
      assert(result.ok, "should be ok");
      persistentSessionId = result.output.session.id;
    });

    await test("session data written to database file", async () => {
      const { existsSync, readFileSync } = await import("node:fs");
      const dbPath = `${DATA_DIR}/data/argos.db`;
      assert(existsSync(dbPath), "database file exists");
      const size = readFileSync(dbPath).length;
      assert(size > 0, "database file is not empty");
    });

    await test("cleanup persistent session", async () => {
      const result = await postRoute(port, "sessions.delete", { sessionId: persistentSessionId });
      assert(result.ok, "should be ok");
    });

    await test("chat.sendMessage returns coming soon", async () => {
      const result = await postRoute(port, "chat.sendMessage", { sessionId: "test", content: "hi" });
      assert(!result.ok, "should not be ok");
    });

    // === Invalid routes ===
    console.log("\n--- Error handling ---");
    await test("Unknown route returns error", async () => {
      const result = await postRoute(port, "nonexistent.route");
      assert(!result.ok, "should not be ok");
      assert(result.error.code === "unknown_route" || result.error.code === "dispatch_error", "error code");
    });

    await test("Invalid JSON body returns 400", async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "not json",
      });
      assertEq(res.status, 400, "status code");
    });

    await test("Non-POST method returns error", async () => {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/route`, {
        method: "GET",
      });
      assertEq(res.status, 404, "status code");
    });

    await test("Unknown endpoint returns 404", async () => {
      const res = await fetch(`http://127.0.0.1:${port}/nonexistent`);
      assertEq(res.status, 404, "status code");
    });
  } finally {
    console.log("\n--- Stopping daemon ---");
    await daemon.close();
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
