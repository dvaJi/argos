import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

describe("DaemonConfigPresenter", () => {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length > 0) {
      const root = roots.pop();
      if (root) {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

  it("resolves a valid Argos agent config object", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "argos-daemon-config-"));
    roots.push(root);
    const { DaemonConfigPresenter } = await import("../src/host/daemonConfigPresenter");
    const presenter = new DaemonConfigPresenter(path.join(root, "config"), path.join(root, "data"));

    presenter.setDefaultModel({ providerId: "openai", modelId: "gpt-4o-mini" });
    presenter.setDefaultProjectPath("/tmp/project");

    const config = await presenter.resolveArgosAgentConfig("agent-1");
    expect(config).toMatchObject({
      defaultModelPreset: { providerId: "openai", modelId: "gpt-4o-mini" },
      defaultProjectPath: "/tmp/project",
      subagentEnabled: true,
    });
  }, 15000);

  it("persists knowledge configs in the daemon config store", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "argos-daemon-config-"));
    roots.push(root);
    const { DaemonConfigPresenter } = await import("../src/host/daemonConfigPresenter");
    const presenter = new DaemonConfigPresenter(path.join(root, "config"), path.join(root, "data"));

    const configs = [
      {
        id: "kb-1",
        description: "Daemon knowledge base",
        enabled: true,
        dimensions: 1536,
        normalized: true,
        files: [],
      },
    ] as const;

    presenter.setKnowledgeConfigs(configs as never);

    expect(presenter.getKnowledgeConfigs()).toEqual(configs);
    expect(JSON.parse(fs.readFileSync(path.join(root, "config", "config.json"), "utf-8"))).toMatchObject({
      knowledgeConfigs: configs,
    });
  }, 15000);

  it("exposes ACP bootstrap state from the daemon config facade", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "argos-daemon-config-"));
    roots.push(root);
    const { DaemonConfigPresenter } = await import("../src/host/daemonConfigPresenter");
    const presenter = new DaemonConfigPresenter(path.join(root, "config"), path.join(root, "data"));

    await expect(presenter.getAcpEnabled()).resolves.toBe(false);
    await expect(presenter.listAgents()).resolves.toEqual([]);
  });

  it("tags ACP agents with type 'acp' so they satisfy the Agent route contract", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "argos-daemon-config-"));
    roots.push(root);
    const { DaemonConfigPresenter } = await import("../src/host/daemonConfigPresenter");
    const presenter = new DaemonConfigPresenter(path.join(root, "config"), path.join(root, "data"));

    await presenter.setAcpEnabled(true);
    await presenter.addManualAcpAgent({
      id: "acp-manual-1",
      name: "Manual ACP",
      command: "echo",
      enabled: true,
    });

    const agents = await presenter.listAgents();
    const acp = agents.find((a) => a.id === "acp-manual-1");
    expect(acp).toBeDefined();
    expect(acp?.type).toBe("acp");
    expect(acp?.agentType).toBe("acp");
  });

  it("persists per-model enabled state in the model_status table", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "argos-daemon-config-"));
    roots.push(root);
    const { DaemonConfigPresenter } = await import("../src/host/daemonConfigPresenter");

    // Minimal in-memory model_status table fake.
    const rows = new Map<string, { model_id: string; provider_id: string; enabled: number }>();
    const db = {
      prepare(sql: string) {
        return {
          all: (...params: unknown[]) => {
            if (sql.includes("WHERE provider_id = ?")) {
              const pid = String(params[0]);
              return [...rows.values()].filter((r) => r.provider_id === pid);
            }
            return [...rows.values()];
          },
          get: () => undefined,
          run: (...params: unknown[]) => {
            const [modelId, providerId, enabled] = params as [string, string, number];
            rows.set(`${providerId}:${modelId}`, { model_id: modelId, provider_id: providerId, enabled });
            return { changes: 1 };
          },
        };
      },
    };

    const presenter = new DaemonConfigPresenter(path.join(root, "config"), path.join(root, "data"), db as never);

    // Initially empty.
    expect(presenter.getModelStatusMap("deepseek")).toEqual({});

    // Toggle a model on, then off, then another on.
    presenter.setModelStatus("deepseek", "deepseek-chat", true);
    presenter.setModelStatus("deepseek", "deepseek-reasoner", true);
    presenter.setModelStatus("deepseek", "deepseek-chat", false);

    const map = presenter.getModelStatusMap("deepseek");
    expect(map["deepseek-chat"]).toBe(false);
    expect(map["deepseek-reasoner"]).toBe(true);

    // Without a providerId, keys are namespaced "provider:model".
    const all = presenter.getModelStatusMap();
    expect(all["deepseek:deepseek-reasoner"]).toBe(true);
  });

  it("round-trips samplingParams through the model config store", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "argos-daemon-config-"));
    roots.push(root);
    const { DaemonConfigPresenter } = await import("../src/host/daemonConfigPresenter");
    const configPath = path.join(root, "config");
    const dataPath = path.join(root, "data");
    const presenter = new DaemonConfigPresenter(configPath, dataPath);

    const saved = presenter.setModelConfig("my-model", "openai", {
      samplingParams: { temperature: 0.3, top_p: 0.9, frequency_penalty: 0.2 },
    } as never);

    expect(saved.samplingParams).toEqual({ temperature: 0.3, top_p: 0.9, frequency_penalty: 0.2 });

    // Reload a fresh presenter from the same paths to verify disk persistence
    // (the setter updates the in-memory store before save()).
    const reloadedPresenter = new DaemonConfigPresenter(configPath, dataPath);
    expect(reloadedPresenter.getModelConfig("my-model", "openai").samplingParams).toEqual({
      temperature: 0.3,
      top_p: 0.9,
      frequency_penalty: 0.2,
    });

    // Absent configs default to undefined.
    expect(reloadedPresenter.getModelConfig("other-model", "openai").samplingParams).toBeUndefined();
  });
});
