import { Store, useSelector } from "@tanstack/react-store";
import { useEffect } from "react";
import type { McpElicitationDecision, McpElicitationRequestPayload } from "@argos/shared/presenter";
import { createMcpClient } from "#api/McpClient";

const mcpClient = createMcpClient();

type ElicitationFieldValue = string | number | boolean | string[];

export type ElicitationPropertyView = {
  type?: string;
  title?: string;
  description?: string;
  enum?: string[];
  items?: { type?: string; enum?: string[] };
};

type McpElicitationState = {
  request: McpElicitationRequestPayload | null;
  /** Per-field values keyed by property name (scalars as strings until submit). */
  values: Record<string, string>;
  error: string | null;
};

const mcpElicitationStore = new Store<McpElicitationState>({
  request: null,
  values: {},
  error: null,
});

const eventCleanups: Array<() => void> = [];

function schemaProperties(request: McpElicitationRequestPayload | null): Record<string, ElicitationPropertyView> {
  const schema = request?.requestedSchema as { properties?: Record<string, ElicitationPropertyView> } | undefined;
  return schema?.properties ?? {};
}

function requiredFields(request: McpElicitationRequestPayload | null): Set<string> {
  const schema = request?.requestedSchema as { required?: string[] } | undefined;
  return new Set(schema?.required ?? []);
}

const openRequest = (request: McpElicitationRequestPayload) => {
  mcpElicitationStore.setState((prev) => ({ ...prev, request, values: {}, error: null }));
};

const clearRequest = () => {
  mcpElicitationStore.setState((prev) => ({ ...prev, request: null, values: {}, error: null }));
};

const setValue = (key: string, value: string) => {
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
    const value = mcpElicitationStore.state.values[key];
    return action === "accept" && (value === undefined || !value.trim());
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
    clearRequest();
  } catch (error) {
    console.error("[MCP] Failed to submit elicitation decision:", error);
    await mcpClient.cancelElicitation(request.requestId, "Decision submission failed");
    clearRequest();
  }
};

const handleElicitationRequest = (payload: { request: unknown }) => {
  if (!payload?.request) return;
  openRequest(payload.request as McpElicitationRequestPayload);
};

const handleElicitationCancelled = (payload: { requestId: string }) => {
  if (mcpElicitationStore.state.request && payload.requestId === mcpElicitationStore.state.request.requestId) {
    clearRequest();
  }
};

const handleElicitationDecision = (payload: { decision: unknown }) => {
  const decision = payload.decision as McpElicitationDecision | undefined;
  if (mcpElicitationStore.state.request && decision?.requestId === mcpElicitationStore.state.request.requestId) {
    clearRequest();
  }
};

const initMcpElicitation = () => {
  eventCleanups.push(mcpClient.onElicitationRequest(handleElicitationRequest));
  eventCleanups.push(mcpClient.onElicitationCancelled(handleElicitationCancelled));
  eventCleanups.push(mcpClient.onElicitationDecision(handleElicitationDecision));
};

const cleanupMcpElicitation = () => {
  while (eventCleanups.length > 0) {
    eventCleanups.pop()?.();
  }
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
