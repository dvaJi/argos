import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import type { AcpAgentInstallState } from "@argos/shared/presenter";
import { DaemonAcpConfig } from "../src/host/daemonAcpConfig";

/**
 * Offline tests for the startup/manual-refresh agent reconciliation in
 * DaemonAcpConfig. The registry cache is pre-seeded with a fresh timestamp so
 * the automatic TTL refresh never hits the network; binary-install coverage
 * either pre-creates the target version dir (ensure short-circuits) or uses an
 * unreachable archive URL (ensure fails and the previous state must survive).
 */
describe("DaemonAcpConfig reconcileInstalledAgents", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length > 0) {
      const root = roots.pop();
      if (root) {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  const platformKey = `${({ darwin: "darwin", linux: "linux", win32: "windows" } as Record<string, string>)[process.platform]}-${
    ({ arm64: "aarch64", x64: "x86_64" } as Record<string, string>)[process.arch]
  }`;

  const runnerAgent = {
    id: "pi-acp",
    name: "Pi",
    version: "0.0.33",
    distribution: { npx: { package: "pi-acp", args: ["--acp"] } },
  };

  const binaryOkAgent = {
    id: "opencode",
    name: "OpenCode",
    version: "1.18.19",
    distribution: { binary: { [platformKey]: { archive: "https://example.invalid/x.zip", cmd: "opencode.exe" } } },
  };

  const binaryFailAgent = {
    id: "locked-agent",
    name: "Locked Agent",
    version: "2.0.0",
    distribution: { binary: { [platformKey]: { archive: "https://localhost.invalid/x.zip", cmd: "agent.exe" } } },
  };

  const disabledAgent = {
    id: "disabled-agent",
    name: "Disabled Agent",
    version: "9.9.9",
    distribution: { npx: { package: "disabled-agent" } },
  };

  type Harness = {
    config: DaemonAcpConfig;
    configDir: string;
    dataDir: string;
  };

  const createConfig = (options: {
    registryStates: Record<string, { enabled: boolean }>;
    installStates?: Record<string, AcpAgentInstallState>;
    agents?: Array<Record<string, unknown>>;
  }): Harness => {
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "argos-acp-cfg-"));
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "argos-acp-data-"));
    roots.push(configDir, dataDir);

    const registryCacheDir = path.join(dataDir, "acp-registry");
    fs.mkdirSync(registryCacheDir, { recursive: true });
    fs.writeFileSync(
      path.join(registryCacheDir, "meta.json"),
      JSON.stringify({ version: "1.0.0", lastUpdated: Date.now(), lastAttemptedAt: Date.now(), sourceUrl: "" }),
    );
    fs.writeFileSync(
      path.join(registryCacheDir, "registry.json"),
      JSON.stringify({
        version: "1.0.0",
        agents: options.agents ?? [runnerAgent, binaryOkAgent, binaryFailAgent, disabledAgent],
      }),
    );

    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "acp_agents.json"),
      JSON.stringify({
        enabled: true,
        version: "4",
        registryStates: options.registryStates,
        manualAgents: [],
        installStates: options.installStates ?? {},
        sharedMcpSelections: [],
      }),
    );

    return { config: new DaemonAcpConfig({ configDir, dataDir }), configDir, dataDir };
  };

  const seedBinaryTargetDir = (harness: Harness, agentId: string, version: string, cmd: string): void => {
    const installDir = path.join(harness.dataDir, "acp-registry", "agents", agentId, version);
    fs.mkdirSync(installDir, { recursive: true });
    fs.writeFileSync(path.join(installDir, cmd), "binary");
  };

  const readInstallState = (harness: Harness, agentId: string): AcpAgentInstallState | null => {
    const store = JSON.parse(fs.readFileSync(path.join(harness.configDir, "acp_agents.json"), "utf-8")) as {
      installStates: Record<string, AcpAgentInstallState>;
    };
    return store.installStates[agentId] ?? null;
  };

  it("tracks the registry version for a bumped runner agent on startup", async () => {
    const harness = createConfig({
      registryStates: { [runnerAgent.id]: { enabled: true } },
      installStates: {
        [runnerAgent.id]: {
          status: "installed",
          distributionType: "npx",
          version: "0.0.32",
          installedAt: 123,
          lastCheckedAt: 123,
        },
      },
    });

    await harness.config.initialReconcile;

    const state = readInstallState(harness, runnerAgent.id);
    expect(state?.status).toBe("installed");
    expect(state?.version).toBe(runnerAgent.version);
    expect(state?.error ?? null).toBeNull();
    // installedAt is preserved across runner reconciliation
    expect(state?.installedAt).toBe(123);
  });

  it("updateAcpAgent persists the registry version for a runner agent", async () => {
    const harness = createConfig({
      registryStates: { [runnerAgent.id]: { enabled: true } },
      installStates: {
        [runnerAgent.id]: {
          status: "installed",
          distributionType: "npx",
          version: "0.0.32",
          installedAt: 123,
          lastCheckedAt: 123,
        },
      },
    });

    const state = await harness.config.updateAcpAgent(runnerAgent.id);
    expect(state.status).toBe("installed");
    expect(state.version).toBe(runnerAgent.version);
    expect(readInstallState(harness, runnerAgent.id)?.version).toBe(runnerAgent.version);
  });

  it("installs a bumped binary agent when the target version dir already exists", async () => {
    const harness = createConfig({
      registryStates: { [binaryOkAgent.id]: { enabled: true } },
      installStates: {
        [binaryOkAgent.id]: {
          status: "installed",
          distributionType: "binary",
          version: "1.18.18",
          installedAt: 123,
          lastCheckedAt: 123,
          installDir: path.join("C:", "old", "1.18.18"),
        },
      },
    });

    // Pre-create the target version dir so ensure short-circuits without network.
    seedBinaryTargetDir(harness, binaryOkAgent.id, binaryOkAgent.version, "opencode.exe");

    await harness.config.initialReconcile;

    const state = readInstallState(harness, binaryOkAgent.id);
    expect(state?.status).toBe("installed");
    expect(state?.version).toBe(binaryOkAgent.version);
    expect(state?.installDir).toContain(path.join("agents", binaryOkAgent.id, binaryOkAgent.version));
  });

  it("keeps the previous good state when a binary update fails", async () => {
    const harness = createConfig({
      registryStates: { [binaryFailAgent.id]: { enabled: true } },
      installStates: {
        [binaryFailAgent.id]: {
          status: "installed",
          distributionType: "binary",
          version: "1.0.0",
          installedAt: 123,
          lastCheckedAt: 123,
          installDir: path.join("C:", "old", "1.0.0"),
        },
      },
    });

    await harness.config.initialReconcile;

    const state = readInstallState(harness, binaryFailAgent.id);
    expect(state?.version).toBe("1.0.0");
    expect(state?.status).toBe("installed");
    expect(state?.error ?? null).toBeNull();
  });

  it("does not reconcile disabled agents", async () => {
    const harness = createConfig({
      registryStates: { [disabledAgent.id]: { enabled: false } },
      installStates: {
        [disabledAgent.id]: {
          status: "installed",
          distributionType: "npx",
          version: "0.0.1",
          installedAt: 123,
          lastCheckedAt: 123,
        },
      },
    });

    await harness.config.initialReconcile;

    expect(readInstallState(harness, disabledAgent.id)?.version).toBe("0.0.1");
  });

  it("blocks uninstall while the agent still has conversations", async () => {
    const configDir = fs.mkdtempSync(path.join(os.tmpdir(), "argos-acp-cfg-"));
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "argos-acp-data-"));
    roots.push(configDir, dataDir);

    fs.mkdirSync(path.join(dataDir, "acp-registry"), { recursive: true });
    fs.writeFileSync(
      path.join(dataDir, "acp-registry", "meta.json"),
      JSON.stringify({ version: "1.0.0", lastUpdated: Date.now(), lastAttemptedAt: Date.now(), sourceUrl: "" }),
    );
    fs.writeFileSync(
      path.join(dataDir, "acp-registry", "registry.json"),
      JSON.stringify({ version: "1.0.0", agents: [binaryOkAgent] }),
    );
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "acp_agents.json"),
      JSON.stringify({
        enabled: true,
        version: "4",
        registryStates: { [binaryOkAgent.id]: { enabled: true } },
        manualAgents: [],
        installStates: {},
        sharedMcpSelections: [],
      }),
    );

    const config = new DaemonAcpConfig({
      configDir,
      dataDir,
      hasAcpAgentSessions: (agentId) => agentId === binaryOkAgent.id,
    });

    await expect(config.uninstallAcpRegistryAgent(binaryOkAgent.id)).rejects.toThrow("still has related conversations");
  });
});
