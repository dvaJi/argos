import { describe, expect, it, vi } from "bun:test";
import { Database } from "bun:sqlite";
import { DaemonTriggerRuntime } from "../src/host/daemonTriggerRuntime";

function createHarness() {
  const db = new Database(":memory:");
  const create = vi.fn(async () => ({ id: "session-1" }));
  const sendMessage = vi.fn(async () => ({ requestId: "r", messageId: "m" }));
  const publish = vi.fn();
  const runtime = new DaemonTriggerRuntime({
    db,
    eventPublisher: { publish, subscribe: () => () => undefined } as never,
    sessionRepository: {
      create,
      get: vi.fn(async () => ({ id: "session-1" })),
      list: vi.fn(async () => []),
      activate: vi.fn(),
      deactivate: vi.fn(),
      getActive: vi.fn(async () => null),
      setRestricted: vi.fn(async () => undefined),
      queuePendingInput: vi.fn(async () => ({})),
    } as never,
    providerExecutionPort: {
      sendMessage,
      getActiveGeneration: () => null,
    } as never,
  });
  return { runtime, create, sendMessage, publish };
}

describe("DaemonTriggerRuntime", () => {
  it("creates a restricted session and passes untrusted provenance for an outside webhook", async () => {
    const harness = createHarness();
    const trigger = harness.runtime.upsert({
      name: "GitHub",
      type: "webhook",
      config: {},
      prompt: "Review the payload",
      agentId: "argos",
      trust: "outside",
      enabled: true,
    });
    expect(trigger.webhookPath).toBe(`/api/v1/hooks/${trigger.id}`);
    expect(trigger.secret).toBeTruthy();

    const response = await harness.runtime.handleWebhook(
      trigger.id,
      new Request(`http://localhost${trigger.webhookPath}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${trigger.secret}` },
        body: JSON.stringify({ action: "opened" }),
      }),
    );
    expect(response.status).toBe(202);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(harness.create).toHaveBeenCalledWith(
      { agentId: "argos", message: "", restricted: true },
      -1,
    );
    expect(harness.sendMessage).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({
        text: expect.stringContaining('"action": "opened"'),
        provenance: expect.objectContaining({ trust: "untrusted", runKind: "event" }),
      }),
    );
  });

  it("rejects a wrong webhook secret", async () => {
    const harness = createHarness();
    const trigger = harness.runtime.upsert({
      name: "Hook",
      type: "webhook",
      config: {},
      prompt: "Go",
      agentId: "argos",
      enabled: true,
    });
    const response = await harness.runtime.handleWebhook(
      trigger.id,
      new Request(`http://localhost${trigger.webhookPath}`, {
        method: "POST",
        headers: { Authorization: "Bearer wrong" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(401);
    expect(harness.sendMessage).not.toHaveBeenCalled();
  });

  it("toggles and removes a trigger", () => {
    const harness = createHarness();
    const trigger = harness.runtime.upsert({
      name: "Folder",
      type: "webhook",
      config: {},
      prompt: "Go",
      agentId: "argos",
      enabled: true,
    });
    expect(harness.runtime.toggle(trigger.id, false).enabled).toBe(false);
    expect(harness.runtime.remove(trigger.id)).toBe(true);
    expect(harness.runtime.list()).toHaveLength(0);
  });
});
