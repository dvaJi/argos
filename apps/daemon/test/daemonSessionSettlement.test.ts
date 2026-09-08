import { describe, expect, it } from "bun:test";
import type { PendingSessionInputRecord } from "@argos/shared/types/agent-interface";
import {
  settleSessionForOwnershipChange,
  type SettleSessionHost,
  type SettleSessionResult,
} from "../src/host/sessionSettlement";

/**
 * Offline coverage for session settlement ahead of ownership changes
 * (delete / move / agent removal). Queue-mode pending inputs are discarded,
 * steer-mode inputs are kept, a running turn is cancelled and awaited, and
 * durable ACP bindings are purged best-effort.
 */

const noDelay = async () => {};

const input = (id: string, mode: "queue" | "steer"): PendingSessionInputRecord => ({
  id,
  sessionId: "session-1",
  mode,
  state: "pending",
  payload: { text: `payload-${id}` } as PendingSessionInputRecord["payload"],
  queueOrder: mode === "queue" ? 0 : null,
  claimedAt: null,
  consumedAt: null,
  createdAt: 1,
  updatedAt: 1,
});

type HostOverrides = Partial<SettleSessionHost> & {
  pendingInputs?: PendingSessionInputRecord[];
  status?: string | null;
  statusSequence?: Array<string | null>;
  settleAfterCancels?: number;
};

const createHost = (overrides: HostOverrides = {}) => {
  const state = {
    pendingInputs: overrides.pendingInputs ?? [],
    status: overrides.status ?? "idle",
    statusSequence: overrides.statusSequence ?? [],
    settleAfterCancels: overrides.settleAfterCancels ?? 0,
  };
  const host: SettleSessionHost & {
    deletedInputIds: string[];
    cancelCalls: string[];
    purgeCalls: string[];
  } = {
    getSession: async (sessionId) => {
      if (state.statusSequence.length > 0) {
        return { status: state.statusSequence.shift() ?? "idle" };
      }
      if (state.settleAfterCancels > 0) {
        state.settleAfterCancels -= 1;
        return { status: "generating" };
      }
      void sessionId;
      return { status: state.status === "generating" ? "idle" : state.status };
    },
    listPendingInputs: async (sessionId) => {
      void sessionId;
      return [...state.pendingInputs];
    },
    deletePendingInput: async (sessionId, itemId) => {
      void sessionId;
      state.pendingInputs = state.pendingInputs.filter((item) => item.id !== itemId);
      host.deletedInputIds.push(itemId);
    },
    cancelGeneration: async (sessionId) => {
      void sessionId;
      host.cancelCalls.push(sessionId);
    },
    purgeAcpSessionData: async (sessionId) => {
      host.purgeCalls.push(sessionId);
    },
    deletedInputIds: [],
    cancelCalls: [],
    purgeCalls: [],
    ...overrides,
  };
  return { host, state };
};

describe("settleSessionForOwnershipChange", () => {
  it("discards queue-mode inputs and keeps steer-mode inputs", async () => {
    const { host, state } = createHost({
      pendingInputs: [input("q-1", "queue"), input("q-2", "queue"), input("s-1", "steer")],
      status: "idle",
    });

    const result: SettleSessionResult = await settleSessionForOwnershipChange("session-1", host, {
      delay: noDelay,
    });

    expect(result.discardedQueueInputIds.sort()).toEqual(["q-1", "q-2"]);
    expect(host.deletedInputIds.sort()).toEqual(["q-1", "q-2"]);
    expect(state.pendingInputs.map((item) => item.id)).toEqual(["s-1"]);
    expect(host.cancelCalls).toEqual([]);
    expect(host.purgeCalls).toEqual(["session-1"]);
  });

  it("cancels a generating session and waits for the status to settle", async () => {
    const { host } = createHost({
      status: "generating",
      settleAfterCancels: 2,
    });

    const result = await settleSessionForOwnershipChange("session-1", host, { delay: noDelay, timeoutMs: 1000 });

    expect(result.cancelled).toBe(true);
    expect(host.cancelCalls).toEqual(["session-1"]);
    expect(host.purgeCalls).toEqual(["session-1"]);
  });

  it("does not cancel an idle session", async () => {
    const { host } = createHost({ status: "idle" });

    const result = await settleSessionForOwnershipChange("session-1", host, { delay: noDelay });

    expect(result.cancelled).toBe(false);
    expect(host.cancelCalls).toEqual([]);
  });

  it("throws when the session does not stop before the timeout", async () => {
    const { host } = createHost({ status: "generating", settleAfterCancels: 999 });

    await expect(settleSessionForOwnershipChange("session-1", host, { delay: noDelay, timeoutMs: 0 })).rejects.toThrow(
      "did not stop before ownership change",
    );
    expect(host.cancelCalls).toEqual(["session-1"]);
  });

  it("aborts when a queued input cannot be discarded (fail-closed)", async () => {
    const state = {
      pendingInputs: [input("q-1", "queue")],
    };
    const host: SettleSessionHost = {
      getSession: async () => ({ status: "idle" }),
      listPendingInputs: async () => [...state.pendingInputs],
      deletePendingInput: async () => {
        throw new Error("delete failed");
      },
      cancelGeneration: async () => undefined,
    };

    await expect(settleSessionForOwnershipChange("session-1", host, { delay: noDelay })).rejects.toThrow(
      "delete failed",
    );
  });

  it("aborts when queued inputs cannot be enumerated (fail-closed)", async () => {
    const host: SettleSessionHost = {
      getSession: async () => ({ status: "idle" }),
      listPendingInputs: async () => {
        throw new Error("db unavailable");
      },
      deletePendingInput: async () => undefined,
      cancelGeneration: async () => undefined,
    };

    await expect(settleSessionForOwnershipChange("session-1", host, { delay: noDelay })).rejects.toThrow(
      "db unavailable",
    );
  });

  it("aborts when the session status cannot be read (fail-safe)", async () => {
    let cancelCalls = 0;
    const host: SettleSessionHost = {
      getSession: async () => {
        throw new Error("read failed");
      },
      listPendingInputs: async () => [],
      deletePendingInput: async () => undefined,
      cancelGeneration: async () => {
        cancelCalls += 1;
      },
    };

    await expect(settleSessionForOwnershipChange("session-1", host, { delay: noDelay })).rejects.toThrow("read failed");
    expect(cancelCalls).toBe(0);
  });

  it("aborts when ACP bindings cannot be purged", async () => {
    const { host } = createHost({
      status: "idle",
      purgeAcpSessionData: async () => {
        throw new Error("purge failed");
      },
    });

    await expect(settleSessionForOwnershipChange("session-1", host, { delay: noDelay })).rejects.toThrow(
      "purge failed",
    );
  });
});
