/**
 * E2E test: Skills install → list → uninstall round-trip
 *
 * Verifies the daemon skills runtime wiring end-to-end:
 *   skills.installFromFolder → skills.listMetadata (contains skill) →
 *   skills.uninstall → skills.listMetadata (skill absent)
 *
 * Run with: bun run apps/daemon/test/e2e-skills-roundtrip.test.ts
 */
import { startDaemon, type DaemonHandle } from "../src/index";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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

/** Creates a minimal skill folder with the given name in a temp directory. */
function createSkillFolder(skillName: string): string {
  const base = mkdtempSync(join(tmpdir(), "argos-skill-test-"));
  const skillMd = [
    "---",
    `name: ${skillName}`,
    `description: "E2E test skill created by integration tests"`,
    "---",
    "",
    "# Test Skill",
    "",
    "This skill is created by integration tests and should be cleaned up automatically.",
  ].join("\n");
  writeFileSync(join(base, "SKILL.md"), skillMd, "utf-8");
  return base;
}

async function run(): Promise<void> {
  console.log("\n=== E2E: Skills Round-Trip ===\n");

  const DATA_DIR = `/tmp/argos-e2e-skills-${Date.now()}`;
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

  // Use a timestamped name so parallel test runs don't conflict
  const SKILL_NAME = `argos-e2e-test-skill-${Date.now()}`;
  const skillFolder = createSkillFolder(SKILL_NAME);

  try {
    await test("skills.listMetadata does not contain the test skill initially", async () => {
      const res = await postRoute(port, "skills.listMetadata");
      assert(res.ok === true, `expected ok=true, got: ${JSON.stringify(res)}`);
      assert(Array.isArray(res.output.skills), "output.skills should be array");
      const found = res.output.skills.some((s: any) => s.name === SKILL_NAME);
      assert(!found, `skill ${SKILL_NAME} should not exist before install`);
    });

    await test("skills.installFromFolder succeeds", async () => {
      const res = await postRoute(port, "skills.installFromFolder", { folderPath: skillFolder });
      assert(res.ok === true, `expected ok=true, got: ${JSON.stringify(res)}`);
      assert(res.output.result.success === true, `install failed: ${res.output.result.error}`);
      assert(
        res.output.result.name === SKILL_NAME || res.output.result.skillName === SKILL_NAME,
        `expected skill name ${SKILL_NAME}, got: ${JSON.stringify(res.output.result)}`,
      );
    });

    await test("skills.listMetadata includes the installed skill", async () => {
      const res = await postRoute(port, "skills.listMetadata");
      assert(res.ok === true, `expected ok=true, got: ${JSON.stringify(res)}`);
      const found = res.output.skills.some((s: any) => s.name === SKILL_NAME);
      assert(found, `skill ${SKILL_NAME} not found after install`);
    });

    await test("skills.uninstall removes the skill", async () => {
      const res = await postRoute(port, "skills.uninstall", { name: SKILL_NAME });
      assert(res.ok === true, `expected ok=true, got: ${JSON.stringify(res)}`);
      assert(res.output.result.success === true, `uninstall failed: ${res.output.result.error}`);
    });

    await test("skills.listMetadata no longer contains the skill after uninstall", async () => {
      const res = await postRoute(port, "skills.listMetadata");
      assert(res.ok === true, `expected ok=true, got: ${JSON.stringify(res)}`);
      const found = res.output.skills.some((s: any) => s.name === SKILL_NAME);
      assert(!found, `skill ${SKILL_NAME} should be absent after uninstall`);
    });
  } finally {
    console.log("\n--- Stopping daemon ---");
    await daemon.close();
    // Clean up the temp skill source directory
    rmSync(skillFolder, { recursive: true, force: true });
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
