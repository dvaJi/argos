import { spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

let fixtureRoot: string | null = null;

async function writeFixtureFile(relativePath: string, content: string): Promise<void> {
  if (!fixtureRoot) {
    throw new Error("fixture root not initialized");
  }
  const fullPath = join(fixtureRoot, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content);
}

function runArchitectureGuard(root: string) {
  const scriptPath = resolve(process.cwd(), "..", "..", "scripts", "architecture-guard.mjs");
  const scriptUrl = pathToFileURL(scriptPath).href;
  return spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", `process.chdir(${JSON.stringify(root)}); await import(${JSON.stringify(scriptUrl)});`],
    {
      encoding: "utf8",
    },
  );
}

describe("architecture guard fixture coverage", () => {
  afterEach(async () => {
    if (fixtureRoot) {
      await rm(fixtureRoot, { recursive: true, force: true });
      fixtureRoot = null;
    }
  });

  it("flags Bun, Electron, and shared-package host coupling violations", async () => {
    fixtureRoot = await mkdir(join(tmpdir(), "argos-guard-fixture-"), { recursive: true, mode: 0o700 });

    await writeFixtureFile("apps/desktop/src/main/presenter/index.ts", "export {};\n");
    await writeFixtureFile("apps/desktop/src/main/presenter/agentSessionPresenter/index.ts", "export {};\n");
    await writeFixtureFile("apps/desktop/src/main/presenter/agentRuntimePresenter/index.ts", "export {};\n");
    await writeFixtureFile("apps/desktop/src/main/presenter/llmProviderPresenter/index.ts", "export {};\n");
    await writeFixtureFile("apps/desktop/src/main/presenter/sessionPresenter/index.ts", "export {};\n");
    await writeFixtureFile("apps/desktop/src/main/eventbus.ts", "export {};\n");
    await writeFixtureFile("apps/desktop/src/main/bunFallback.ts", 'import "bun:child_process";\n');
    await writeFixtureFile("packages/ui/api/legacy/.keep", "");
    await writeFixtureFile("apps/daemon/src/index.ts", 'import { app } from "electron";\n');
    await writeFixtureFile("packages/acp-runtime/src/runtime.ts", 'import { app } from "electron";\n');
    await writeFixtureFile("docs/architecture/baselines/main-kernel-bridge-register.json", JSON.stringify({
      currentPhase: "P5",
      bridges: [],
    }));

    const result = runArchitectureGuard(fixtureRoot);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("[desktop-bun-import]");
    expect(result.stderr).toContain("[daemon-electron-import]");
    expect(result.stderr).toContain("[shared-package-forbidden-import]");
  });

  it("flags new desktop fallback presenter calls in daemon-owned route handlers", async () => {
    fixtureRoot = await mkdir(join(tmpdir(), "argos-guard-fixture-"), { recursive: true, mode: 0o700 });

    await writeFixtureFile("apps/desktop/src/main/routes/providers/providerRouteHandler.ts", [
      'export const dispatchProviderRoute = () => {',
      '  llmProviderPresenter.generateCompletion();',
      '};',
    ].join("\n"));
    await writeFixtureFile("apps/desktop/src/main/routes/models/modelRouteHandler.ts", [
      'export const dispatchModelRoute = () => {',
      '  llmProviderPresenter.summaryTitles();',
      '};',
    ].join("\n"));
    await writeFixtureFile("apps/desktop/src/main/presenter/index.ts", "export {};\n");
    await writeFixtureFile("apps/desktop/src/main/eventbus.ts", "export {};\n");
    await writeFixtureFile("apps/desktop/src/main/presenter/agentSessionPresenter/index.ts", "export {};\n");
    await writeFixtureFile("apps/desktop/src/main/presenter/agentRuntimePresenter/index.ts", "export {};\n");
    await writeFixtureFile("apps/desktop/src/main/presenter/llmProviderPresenter/index.ts", "export {};\n");
    await writeFixtureFile("apps/desktop/src/main/presenter/sessionPresenter/index.ts", "export {};\n");
    await writeFixtureFile("apps/daemon/src/index.ts", "export {};\n");
    await writeFixtureFile("docs/architecture/baselines/main-kernel-bridge-register.json", JSON.stringify({
      currentPhase: "P5",
      bridges: [],
    }));
    await writeFixtureFile("packages/ui/api/legacy/.keep", "");

    const result = runArchitectureGuard(fixtureRoot);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("[provider-route-handler-backend-fallback]");
    expect(result.stderr).toContain("[model-route-handler-backend-fallback]");
  });
});
