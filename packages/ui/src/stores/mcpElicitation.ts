import { Store, useSelector } from "@tanstack/react-store";
import type { ElicitationChoiceProperty } from "#/lib/elicitationOptions";
import { useEffect } from "react";
import type { McpElicitationDecision, McpElicitationRequestPayload } from "@argos/shared/presenter";
import { createMcpClient } from "#api/McpClient";

const mcpClient = createMcpClient();

type ElicitationFieldValue = string | number | boolean | string[];

export type ElicitationPropertyView = ElicitationChoiceProperty & {
  type?: string;
  title?: string;
  description?: string;
};

/** A field's in-progress value: scalars as strings, multi-choice as a list. */
export type ElicitationInputValue = string | string[];

const hasInput = (value: ElicitationInputValue | undefined): boolean =>
  Array.isArray(value) ? value.length > 0 : typeof value === "string" && value.trim().length > 0;

type McpElicitationState = {
  /** The request currently shown in the dialog (head of the queue). */
  request: McpElicitationRequestPayload | null;
  /** Requests waiting behind the visible one, oldest first. */
  queue: McpElicitationRequestPayload[];
  /** Per-field values keyed by property name (scalars as strings until submit). */
  values: Record<string, ElicitationInputValue>;
  error: string | null;
};

const mcpElicitationStore = new Store<McpElicitationState>({
  request: null,
  queue: [],
  values: {},
  error: null,
});

/**
 * One shared set of event subscriptions, ref-counted across hook instances:
 * the first hook subscribes, the last one to unmount unsubscribes (a second
 * mount, or StrictMode's mount/unmount/mount, must not drop the listeners).
 */
let subscriberCount = 0;
let eventCleanups: Array<() => void> = [];

function schemaProperties(request: McpElicitationRequestPayload | null): Record<string, ElicitationPropertyView> {
  const schema = request?.requestedSchema as { properties?: Record<string, ElicitationPropertyView> } | undefined;
  return schema?.properties ?? {};
}

function requiredFields(request: McpElicitationRequestPayload | null): Set<string> {
  const schema = request?.requestedSchema as { required?: string[] } | undefined;
  return new Set(schema?.required ?? []);
}

/**
 * Enqueue a request. Concurrent elicitations (several servers or tool calls)
 * are shown one at a time instead of replacing each other, so every daemon
 * waiter eventually gets a decision.
 */
const openRequest = (request: McpElicitationRequestPayload) => {
  mcpElicitationStore.setState((prev) => {
    if (prev.request?.requestId === request.requestId || prev.queue.some((r) => r.requestId === request.requestId)) {
      return prev;
    }
    if (!prev.request) {
      return { ...prev, request, values: {}, error: null };
    }
    return { ...prev, queue: [...prev.queue, request] };
  });
};

/** Remove a request (visible or queued) and advance to the next one. */
const removeRequest = (requestId: string) => {
  mcpElicitationStore.setState((prev) => {
    if (prev.request?.requestId === requestId) {
      const [next = null, ...rest] = prev.queue;
      return { ...prev, request: next, queue: rest, values: {}, error: null };
    }
    return { ...prev, queue: prev.queue.filter((r) => r.requestId !== requestId) };
  });
};

const setValue = (key: string, value: ElicitationInputValue) => {
  mcpElicitationStore.setState((prev) => ({ ...prev, values: { ...prev.values, [key]: value } }));
};

const setError = (error: string | null) => {
  mcpElicitationStore.setState((prev) => ({ ...prev, error }));
};

/** Convert string field values to the JSON types the requested schema expects. */
const buildContent = (): Record<string, ElicitationFieldValue> => {
  const request = mcpElicitationStore.state.request;
  const properties = schemaProperties(request);
  const content: Record<string, ElicitationFieldValue> = {};
  for (const [key, prop] of Object.entries(properties)) {
    const raw = mcpElicitationStore.state.values[key];
    if (Array.isArray(raw)) {
      if (raw.length > 0) content[key] = raw;
      continue;
    }
    if (typeof raw !== "string" || !raw.trim()) continue;
    if (prop.type === "number" || prop.type === "integer") {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) content[key] = prop.type === "integer" ? Math.trunc(parsed) : parsed;
      continue;
    }
    if (prop.type === "boolean") {
      content[key] = raw === "true";
      continue;
    }
    if (prop.type === "array") {
      const list = raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      if (list.length > 0) content[key] = list;
      continue;
    }
    content[key] = raw;
  }
  return content;
};

const submitDecision = async (action: McpElicitationDecision["action"]) => {
  const request = mcpElicitationStore.state.request;
  if (!request) return;
  const missing = [...requiredFields(request)].filter((key) => {
    return action === "accept" && !hasInput(mcpElicitationStore.state.values[key]);
  });
  if (missing.length > 0) {
    setError(`Required: ${missing.join(", ")}`);
    return;
  }
  try {
    await mcpClient.submitElicitationDecision({
      requestId: request.requestId,
      action,
      ...(action === "accept" ? { content: buildContent() } : {}),
    });
    removeRequest(request.requestId);
  } catch (error) {
    console.error("[MCP] Failed to submit elicitation decision:", error);
    await mcpClient.cancelElicitation(request.requestId, "Decision submission failed").catch(() => undefined);
    removeRequest(request.requestId);
  }
};

const handleElicitationRequest = (payload: { request: unknown }) => {
  if (!payload?.request) return;
  openRequest(payload.request as McpElicitationRequestPayload);
};

const handleElicitationCancelled = (payload: { requestId: string }) => {
  if (payload?.requestId) removeRequest(payload.requestId);
};

const handleElicitationDecision = (payload: { decision: unknown }) => {
  const decision = payload.decision as McpElicitationDecision | undefined;
  if (decision?.requestId) removeRequest(decision.requestId);
};

const initMcpElicitation = () => {
  subscriberCount += 1;
  if (eventCleanups.length > 0) return;
  eventCleanups = [
    mcpClient.onElicitationRequest(handleElicitationRequest),
    mcpClient.onElicitationCancelled(handleElicitationCancelled),
    mcpClient.onElicitationDecision(handleElicitationDecision),
  ];
};

const cleanupMcpElicitation = () => {
  subscriberCount = Math.max(0, subscriberCount - 1);
  if (subscriberCount > 0) return;
  const cleanups = eventCleanups;
  eventCleanups = [];
  for (const cleanup of cleanups) cleanup();
};

export function useMcpElicitationStore() {
  return useSelector(mcpElicitationStore);
}

export function useInitMcpElicitation() {
  useEffect(() => {
    initMcpElicitation();
    return cleanupMcpElicitation;
  }, []);
}

export { mcpElicitationStore, submitDecision, setValue, setError, schemaProperties, requiredFields };
