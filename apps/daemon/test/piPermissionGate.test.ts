import { afterEach, describe, expect, it, vi } from "bun:test";
import { PiProviderExecutionPort } from "../src/host/pi-provider-execution";

/**
 * Permission auto-approval gate wiring (docs/features/decision-models,
 * Phase 2). The Pi worker itself is not spawned; the port is driven through
 * its private gate methods with stubbed config/session/fetch.
 */

const decisionsResponse = (p: number) => ({
  id: "gen-dec-1",
  model: "typesafe/jev-1.14",
  answers: { safe_unattended: { type: "noul", noul: p } },
  usage: { input_tokens: 42, output_tokens: 0, cost: 0.00001 },
});

function createPort(options: {
  agentConfig?: Record<string, unknown> | null;
  providers?: Array<{ id: string; apiKey: string; baseUrl: string }>;
}) {
  const published: Array<{ event: string; payload: unknown }> = [];
  const sessionRepository = {
    get: async () => ({ agentId: "agent-1" }),
    updateAssistantContent: async () => undefined,
  };
  const configPresenter = {
    resolveArgosAgentConfig: async () => options.agentConfig ?? null,
    getProviders: () => options.providers ?? [],
  };
  const port = new PiProviderExecutionPort(
    configPresenter as never,
    sessionRepository as never,
    {} as never,
    { publish: (event: string, payload: unknown) => published.push({ event, payload }) } as never,
    { listTools: async () => [], callTool: async () => ({ content: [] }) } as never,
    "C:\\tmp\\argos-workspace",
  );
  return { port, published };
}

function createWorker() {
  const sent: unknown[] = [];
  return {
    process: { stdin: { write: (data: string) => sent.push(JSON.parse(data)) } } as never,
    turn: {
      commandId: "cmd-1",
      requestId: "req-1",
      messageId: "msg-1",
      blocks: [],
      resolve: () => undefined,
      reject: () => undefined,
      startedAt: Date.now(),
    },
    sent,
  };
}

const permissionEvent = {
  type: "permissionRequest" as const,
  id: "worker-req-1",
  toolCallId: "tool-call-1",
  toolName: "bash",
  input: { command: "git status" },
};

describe("Pi permission auto-approval gate", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("resolves the gate only when the toggle, decision model, and openrouter provider line up", async () => {
    const disabled = createPort({
      agentConfig: { permissionAutoApproval: false, decisionModel: { providerId: "openrouter", modelId: "m" } },
    });
    await expect(
      (
        disabled.port as unknown as { resolvePermissionGateConfig: (id: string) => Promise<unknown> }
      ).resolvePermissionGateConfig("s1"),
    ).resolves.toBeNull();

    const noModel = createPort({ agentConfig: { permissionAutoApproval: true } });
    await expect(
      (
        noModel.port as unknown as { resolvePermissionGateConfig: (id: string) => Promise<unknown> }
      ).resolvePermissionGateConfig("s1"),
    ).resolves.toBeNull();

    const proxyProvider = createPort({
      agentConfig: { permissionAutoApproval: true, decisionModel: { providerId: "proxy", modelId: "m" } },
      providers: [{ id: "proxy", apiKey: "k", baseUrl: "https://proxy.example.com/v1/" }],
    });
    await expect(
      (
        proxyProvider.port as unknown as { resolvePermissionGateConfig: (id: string) => Promise<unknown> }
      ).resolvePermissionGateConfig("s1"),
    ).resolves.toBeNull();

    const usable = createPort({
      agentConfig: {
        permissionAutoApproval: true,
        decisionModel: { providerId: "openrouter", modelId: "typesafe/jev-1.14" },
      },
      providers: [{ id: "openrouter", apiKey: "sk-or", baseUrl: "https://openrouter.ai/api/v1/" }],
    });
    await expect(
      (
        usable.port as unknown as { resolvePermissionGateConfig: (id: string) => Promise<unknown> }
      ).resolvePermissionGateConfig("s1"),
    ).resolves.toEqual({ apiKey: "sk-or", modelId: "typesafe/jev-1.14", agentId: "agent-1" });
  });

  it("grants conclusively safe requests with a data-collection deny preference and an audit block", async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return new Response(JSON.stringify(decisionsResponse(0.93)), { status: 200 });
    }) as unknown as typeof fetch;

    const { port, published } = createPort({
      agentConfig: {
        permissionAutoApproval: true,
        decisionModel: { providerId: "openrouter", modelId: "typesafe/jev-1.14" },
      },
      providers: [{ id: "openrouter", apiKey: "sk-or", baseUrl: "https://openrouter.ai/api/v1/" }],
    });
    const worker = createWorker();

    const gate = (
      port as unknown as {
        tryAutoApprovePermission: (sessionId: string, worker: unknown, event: unknown) => Promise<boolean>;
      }
    ).tryAutoApprovePermission.bind(port);
    await expect(gate("session-1", worker, permissionEvent)).resolves.toBe(true);

    expect(calls).toHaveLength(1);
    expect(calls[0].body.provider).toEqual({ data_collection: "deny" });
    expect(calls[0].body.model).toBe("typesafe/jev-1.14");
    expect(calls[0].body.session_id).toBe("agent-1");

    const response = worker.sent[0] as { type: string; granted: boolean; id: string };
    expect(response).toEqual({ type: "permissionResponse", id: "worker-req-1", granted: true });

    expect(worker.turn.blocks).toHaveLength(1);
    const block = worker.turn.blocks[0] as Record<string, unknown>;
    expect(block.status).toBe("granted");
    expect(block.action_type).toBe("tool_call_permission");
    expect((block.extra as Record<string, unknown>).autoApproved).toBe(true);
    expect((block.extra as Record<string, unknown>).autoApproveProbability).toBeCloseTo(0.93);
    expect(published.some((entry) => entry.event === "chat.stream.updated")).toBe(true);
  });

  it("falls back to the human prompt when the gate answer is below threshold", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(decisionsResponse(0.4)), { status: 200 })) as unknown as typeof fetch;

    const { port } = createPort({
      agentConfig: {
        permissionAutoApproval: true,
        decisionModel: { providerId: "openrouter", modelId: "typesafe/jev-1.14" },
      },
      providers: [{ id: "openrouter", apiKey: "sk-or", baseUrl: "https://openrouter.ai/api/v1/" }],
    });
    const worker = createWorker();
    const gate = (
      port as unknown as {
        tryAutoApprovePermission: (sessionId: string, worker: unknown, event: unknown) => Promise<boolean>;
      }
    ).tryAutoApprovePermission.bind(port);
    await expect(gate("session-1", worker, permissionEvent)).resolves.toBe(false);
    expect(worker.sent).toHaveLength(0);
    expect(worker.turn.blocks).toHaveLength(0);
  });

  it("falls back to the human prompt when the gate API fails", async () => {
    globalThis.fetch = (async () => new Response("overloaded", { status: 502 })) as unknown as typeof fetch;

    const { port } = createPort({
      agentConfig: {
        permissionAutoApproval: true,
        decisionModel: { providerId: "openrouter", modelId: "typesafe/jev-1.14" },
      },
      providers: [{ id: "openrouter", apiKey: "sk-or", baseUrl: "https://openrouter.ai/api/v1/" }],
    });
    const worker = createWorker();
    const gate = (
      port as unknown as {
        tryAutoApprovePermission: (sessionId: string, worker: unknown, event: unknown) => Promise<boolean>;
      }
    ).tryAutoApprovePermission.bind(port);
    await expect(gate("session-1", worker, permissionEvent)).resolves.toBe(false);
    expect(worker.sent).toHaveLength(0);
    expect(worker.turn.blocks).toHaveLength(0);
  });
});
