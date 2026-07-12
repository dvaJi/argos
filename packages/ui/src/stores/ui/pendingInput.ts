import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";
import { createSessionClient } from "#api/SessionClient";
import type { PendingSessionInputRecord, SendMessageInput } from "@argos/shared/types/agent-interface";

const MAX_PENDING_INPUTS = 5;

const sessionClient = createSessionClient();

export const pendingInputStore = new Store({
  currentSessionId: null as string | null,
  items: [] as PendingSessionInputRecord[],
  loading: false,
  error: null as string | null,
});

export const steerItems = () => pendingInputStore.state.items.filter((item) => item.mode === "steer");

export const queueItems = () =>
  pendingInputStore.state.items
    .filter((item) => item.mode === "queue")
    .sort((left, right) => (left.queueOrder ?? 0) - (right.queueOrder ?? 0));

export const activeCount = () => queueItems().length;

export const isAtCapacity = () => activeCount() >= MAX_PENDING_INPUTS;

export async function loadPendingInputs(sessionId: string): Promise<void> {
  const requestedId = sessionId;
  pendingInputStore.setState((prev) => ({
    ...prev,
    currentSessionId: requestedId,
    loading: true,
    error: null,
  }));
  try {
    const loadedItems = await sessionClient.listPendingInputs(requestedId);
    if (requestedId !== pendingInputStore.state.currentSessionId) return;
    pendingInputStore.setState((prev) => ({ ...prev, items: loadedItems }));
  } catch (e) {
    if (requestedId !== pendingInputStore.state.currentSessionId) return;
    pendingInputStore.setState((prev) => ({
      ...prev,
      error: `Failed to load pending inputs: ${e}`,
    }));
  } finally {
    if (requestedId === pendingInputStore.state.currentSessionId) {
      pendingInputStore.setState((prev) => ({ ...prev, loading: false }));
    }
  }
}

export async function queueInput(sessionId: string, input: string | SendMessageInput): Promise<void> {
  pendingInputStore.setState((prev) => ({ ...prev, error: null }));
  try {
    await sessionClient.queuePendingInput(sessionId, input);
    if (pendingInputStore.state.currentSessionId === sessionId) {
      await loadPendingInputs(sessionId);
    }
  } catch (e) {
    pendingInputStore.setState((prev) => ({
      ...prev,
      error: `Failed to queue message: ${e}`,
    }));
    throw e;
  }
}

export async function updateQueueInput(
  sessionId: string,
  itemId: string,
  input: string | SendMessageInput,
): Promise<void> {
  pendingInputStore.setState((prev) => ({ ...prev, error: null }));
  try {
    const updated = await sessionClient.updateQueuedInput(sessionId, itemId, input);
    pendingInputStore.setState((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.id === updated.id ? updated : item)),
    }));
    if (pendingInputStore.state.currentSessionId === sessionId) {
      await loadPendingInputs(sessionId);
    }
  } catch (e) {
    pendingInputStore.setState((prev) => ({
      ...prev,
      error: `Failed to update queued message: ${e}`,
    }));
    throw e;
  }
}

export async function moveQueueInput(sessionId: string, itemId: string, toIndex: number): Promise<void> {
  pendingInputStore.setState((prev) => ({ ...prev, error: null }));
  try {
    const updatedItems = await sessionClient.moveQueuedInput(sessionId, itemId, toIndex);
    pendingInputStore.setState((prev) => ({ ...prev, items: updatedItems }));
  } catch (e) {
    pendingInputStore.setState((prev) => ({
      ...prev,
      error: `Failed to reorder queued message: ${e}`,
    }));
    throw e;
  }
}

export async function convertToSteer(sessionId: string, itemId: string): Promise<void> {
  pendingInputStore.setState((prev) => ({ ...prev, error: null }));
  try {
    const updated = await sessionClient.convertPendingInputToSteer(sessionId, itemId);
    pendingInputStore.setState((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.id === updated.id ? updated : item)),
    }));
    if (pendingInputStore.state.currentSessionId === sessionId) {
      await loadPendingInputs(sessionId);
    }
  } catch (e) {
    pendingInputStore.setState((prev) => ({
      ...prev,
      error: `Failed to convert queued message to steer: ${e}`,
    }));
    throw e;
  }
}

export async function deleteInput(sessionId: string, itemId: string): Promise<void> {
  pendingInputStore.setState((prev) => ({ ...prev, error: null }));
  try {
    await sessionClient.deletePendingInput(sessionId, itemId);
    pendingInputStore.setState((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== itemId),
    }));
  } catch (e) {
    pendingInputStore.setState((prev) => ({
      ...prev,
      error: `Failed to delete queued message: ${e}`,
    }));
    throw e;
  }
}

export async function steerPendingInput(sessionId: string, itemId: string): Promise<void> {
  pendingInputStore.setState((prev) => ({ ...prev, error: null }));
  try {
    await sessionClient.steerPendingInput(sessionId, itemId);
    if (pendingInputStore.state.currentSessionId === sessionId) {
      await loadPendingInputs(sessionId);
    }
  } catch (e) {
    pendingInputStore.setState((prev) => ({
      ...prev,
      error: `Failed to steer pending input: ${e}`,
    }));
    throw e;
  }
}

export function clear(): void {
  pendingInputStore.setState(() => ({
    currentSessionId: null,
    items: [],
    loading: false,
    error: null,
  }));
}

const pendingInputsHandler = (payload: { sessionId: string; version: number }) => {
  if (!payload.sessionId || payload.sessionId !== pendingInputStore.state.currentSessionId) return;
  void loadPendingInputs(payload.sessionId);
};

const unsubscribePendingInputs = sessionClient.onPendingInputsChanged(pendingInputsHandler);

export const disposePendingInputListeners = () => {
  unsubscribePendingInputs();
};

export function usePendingInputStore() {
  return useStore(pendingInputStore);
}
