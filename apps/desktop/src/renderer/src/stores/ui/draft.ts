import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";
import { normalizeImageGenerationOptions } from "@shared/imageGenerationSettings";
import { normalizeVideoGenerationOptions } from "@shared/videoGenerationSettings";
import type { CreateSessionInput, PermissionMode, SessionGenerationSettings } from "@shared/types/agent-interface";

export interface StartDeeplinkPayload {
  token: number;
  msg: string;
  modelId: string | null;
  systemPrompt: string;
  mentions: string[];
  autoSend: boolean;
}

let nextStartToken = 0;

export const draftStore = new Store({
  providerId: undefined as string | undefined,
  modelId: undefined as string | undefined,
  projectDir: undefined as string | undefined,
  agentId: "argos" as string,
  systemPrompt: undefined as string | undefined,
  temperature: undefined as number | undefined,
  topP: undefined as number | undefined,
  contextLength: undefined as number | undefined,
  maxTokens: undefined as number | undefined,
  timeout: undefined as number | undefined,
  thinkingBudget: undefined as number | undefined,
  reasoningEffort: undefined as SessionGenerationSettings["reasoningEffort"] | undefined,
  reasoningVisibility: undefined as SessionGenerationSettings["reasoningVisibility"] | undefined,
  verbosity: undefined as SessionGenerationSettings["verbosity"] | undefined,
  forceInterleavedThinkingCompat: undefined as boolean | undefined,
  imageGeneration: undefined as SessionGenerationSettings["imageGeneration"] | undefined,
  videoGeneration: undefined as SessionGenerationSettings["videoGeneration"] | undefined,
  permissionMode: "full_access" as PermissionMode,
  disabledAgentTools: [] as string[],
  subagentEnabled: false as boolean,
  pendingStartDeeplink: null as StartDeeplinkPayload | null,
});

function normalizeDraftImageGeneration(
  value: SessionGenerationSettings["imageGeneration"],
): SessionGenerationSettings["imageGeneration"] {
  return normalizeImageGenerationOptions(value);
}

function normalizeDraftVideoGeneration(
  value: SessionGenerationSettings["videoGeneration"],
): SessionGenerationSettings["videoGeneration"] {
  return normalizeVideoGenerationOptions(value);
}

export function toGenerationSettings(): Partial<SessionGenerationSettings> | undefined {
  const s = draftStore.state;
  const settings: Partial<SessionGenerationSettings> = {};

  if (s.systemPrompt !== undefined) settings.systemPrompt = s.systemPrompt;
  if (s.temperature !== undefined) settings.temperature = s.temperature;
  if (s.topP !== undefined) settings.topP = s.topP;
  if (s.contextLength !== undefined) settings.contextLength = s.contextLength;
  if (s.maxTokens !== undefined) settings.maxTokens = s.maxTokens;
  if (s.timeout !== undefined) settings.timeout = s.timeout;
  if (s.thinkingBudget !== undefined) settings.thinkingBudget = s.thinkingBudget;
  if (s.reasoningEffort !== undefined) settings.reasoningEffort = s.reasoningEffort;
  if (s.reasoningVisibility !== undefined) settings.reasoningVisibility = s.reasoningVisibility;
  if (s.verbosity !== undefined) settings.verbosity = s.verbosity;
  if (s.forceInterleavedThinkingCompat !== undefined) {
    settings.forceInterleavedThinkingCompat = s.forceInterleavedThinkingCompat;
  }
  const normalizedImageGeneration = normalizeDraftImageGeneration(s.imageGeneration);
  if (normalizedImageGeneration !== undefined) settings.imageGeneration = normalizedImageGeneration;
  const normalizedVideoGeneration = normalizeDraftVideoGeneration(s.videoGeneration);
  if (normalizedVideoGeneration !== undefined) settings.videoGeneration = normalizedVideoGeneration;

  return Object.keys(settings).length > 0 ? settings : undefined;
}

export function toCreateInput(message: string): CreateSessionInput {
  const s = draftStore.state;
  return {
    agentId: s.agentId,
    message,
    projectDir: s.projectDir,
    providerId: s.providerId,
    modelId: s.modelId,
    permissionMode: s.permissionMode,
    disabledAgentTools: [...s.disabledAgentTools],
    subagentEnabled: s.subagentEnabled,
    generationSettings: toGenerationSettings(),
  };
}

export function updateGenerationSettings(settings: Partial<SessionGenerationSettings>): void {
  const updates: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(settings, "systemPrompt")) {
    updates.systemPrompt = settings.systemPrompt;
  }
  if (Object.prototype.hasOwnProperty.call(settings, "temperature")) {
    updates.temperature = settings.temperature;
  }
  if (Object.prototype.hasOwnProperty.call(settings, "topP")) {
    updates.topP = settings.topP;
  }
  if (Object.prototype.hasOwnProperty.call(settings, "contextLength")) {
    updates.contextLength = settings.contextLength;
  }
  if (Object.prototype.hasOwnProperty.call(settings, "maxTokens")) {
    updates.maxTokens = settings.maxTokens;
  }
  if (Object.prototype.hasOwnProperty.call(settings, "timeout")) {
    updates.timeout = settings.timeout;
  }
  if (Object.prototype.hasOwnProperty.call(settings, "thinkingBudget")) {
    updates.thinkingBudget = settings.thinkingBudget;
  }
  if (Object.prototype.hasOwnProperty.call(settings, "reasoningEffort")) {
    updates.reasoningEffort = settings.reasoningEffort;
  }
  if (Object.prototype.hasOwnProperty.call(settings, "reasoningVisibility")) {
    updates.reasoningVisibility = settings.reasoningVisibility;
  }
  if (Object.prototype.hasOwnProperty.call(settings, "verbosity")) {
    updates.verbosity = settings.verbosity;
  }
  if (Object.prototype.hasOwnProperty.call(settings, "forceInterleavedThinkingCompat")) {
    updates.forceInterleavedThinkingCompat = settings.forceInterleavedThinkingCompat;
  }
  if (Object.prototype.hasOwnProperty.call(settings, "imageGeneration")) {
    updates.imageGeneration = normalizeDraftImageGeneration(settings.imageGeneration);
  }
  if (Object.prototype.hasOwnProperty.call(settings, "videoGeneration")) {
    updates.videoGeneration = normalizeDraftVideoGeneration(settings.videoGeneration);
  }

  draftStore.setState((prev) => ({ ...prev, ...updates }));
}

export function resetGenerationSettings(): void {
  draftStore.setState((prev) => ({
    ...prev,
    systemPrompt: undefined,
    temperature: undefined,
    topP: undefined,
    contextLength: undefined,
    maxTokens: undefined,
    timeout: undefined,
    thinkingBudget: undefined,
    reasoningEffort: undefined,
    reasoningVisibility: undefined,
    verbosity: undefined,
    forceInterleavedThinkingCompat: undefined,
    imageGeneration: undefined,
    videoGeneration: undefined,
  }));
}

export function reset(): void {
  nextStartToken = 0;
  draftStore.setState(() => ({
    providerId: undefined,
    modelId: undefined,
    projectDir: undefined,
    agentId: "argos",
    systemPrompt: undefined,
    temperature: undefined,
    topP: undefined,
    contextLength: undefined,
    maxTokens: undefined,
    timeout: undefined,
    thinkingBudget: undefined,
    reasoningEffort: undefined,
    reasoningVisibility: undefined,
    verbosity: undefined,
    forceInterleavedThinkingCompat: undefined,
    imageGeneration: undefined,
    videoGeneration: undefined,
    permissionMode: "full_access",
    disabledAgentTools: [],
    subagentEnabled: false,
    pendingStartDeeplink: null,
  }));
}

export function setPendingStartDeeplink(payload: Omit<StartDeeplinkPayload, "token">): StartDeeplinkPayload {
  const nextPayload: StartDeeplinkPayload = { ...payload, token: ++nextStartToken };
  draftStore.setState((prev) => ({ ...prev, pendingStartDeeplink: nextPayload }));
  return nextPayload;
}

export function clearPendingStartDeeplink(): void {
  draftStore.setState((prev) => ({ ...prev, pendingStartDeeplink: null }));
}

export function useDraftStore() {
  return useStore(draftStore);
}
