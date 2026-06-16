export interface ProviderRequestTracePayload {
  endpoint: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface ProviderRequestTraceContext {
  enabled: boolean;
  persist: (payload: ProviderRequestTracePayload) => void | Promise<void>;
}

export function resolveRequestTraceContext(modelConfig: Record<string, unknown>): ProviderRequestTraceContext | null {
  const candidate = modelConfig.requestTraceContext as ProviderRequestTraceContext | undefined;
  if (!candidate || candidate.enabled !== true || typeof candidate.persist !== "function") {
    return null;
  }
  return candidate;
}
