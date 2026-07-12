import { beforeEach, describe, expect, it, vi } from "vitest";
import { PendingInputCoordinator } from "#/presenter/agentRuntimePresenter/pendingInputCoordinator";
import type { PendingSessionInputRecord } from "@argos/shared/types/agent-interface";

vi.mock("#/eventbus", () => ({
  eventBus: {
    sendToRenderer: vi.fn<(...args: any[]) => any>(),
  },
  SendTarget: {
    ALL_WINDOWS: "all",
  },
}));

vi.mock("#/events", () => ({
  SESSION_EVENTS: {
    PENDING_INPUTS_UPDATED: "session:pending-inputs-updated",
  },
}));

vi.mock("#/routes/publishArgosEvent", () => ({
  publishArgosEvent: vi.fn<(...args: any[]) => any>(),
}));

function createRecord(
  id: string,
  sessionId: string,
  mode: PendingSessionInputRecord["mode"],
): PendingSessionInputRecord {
  return {
    id,
    sessionId,
    mode,
    state: "claimed",
    payload: {
      text: id,
      files: [],
    },
    queueOrder: mode === "queue" ? 1 : null,
    claimedAt: 1,
    consumedAt: null,
    createdAt: 1,
    updatedAt: 1,
  };
}

function createCoordinator(records: Map<string, PendingSessionInputRecord>) {
  const store = {
    getInput: vi.fn<(...args: any[]) => any>((itemId: string) => records.get(itemId) ?? null),
    releaseClaimedQueueInput: vi.fn<(...args: any[]) => any>((itemId: string) => records.get(itemId)!),
    releaseClaimedInput: vi.fn<(...args: any[]) => any>((itemId: string) => records.get(itemId)!),
    consumeQueueInput: vi.fn<(...args: any[]) => any>((itemId: string) => {
      records.delete(itemId);
    }),
    consumeSteerInput: vi.fn<(...args: any[]) => any>((itemId: string) => {
      const record = records.get(itemId);
      if (record) {
        records.set(itemId, {
          ...record,
          state: "consumed",
          consumedAt: 2,
        });
      }
    }),
  };

  return {
    coordinator: new PendingInputCoordinator(store as any),
    store,
  };
}

describe("PendingInputCoordinator claimed input ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not release a claimed queue input from another session", () => {
    const records = new Map<string, PendingSessionInputRecord>([
      ["queue-1", createRecord("queue-1", "session-2", "queue")],
    ]);
    const { coordinator, store } = createCoordinator(records);

    expect(() => coordinator.releaseClaimedQueueInput("session-1", "queue-1")).toThrow(
      "does not belong to session session-1",
    );
    expect(store.releaseClaimedQueueInput).not.toHaveBeenCalled();
  });

  it("does not consume a claimed steer input from another session", () => {
    const records = new Map<string, PendingSessionInputRecord>([
      ["steer-1", createRecord("steer-1", "session-2", "steer")],
    ]);
    const { coordinator, store } = createCoordinator(records);

    expect(() => coordinator.consumeSteerInput("session-1", "steer-1")).toThrow("does not belong to session session-1");
    expect(store.consumeSteerInput).not.toHaveBeenCalled();
  });
});
