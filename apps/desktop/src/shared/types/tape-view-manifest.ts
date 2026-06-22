export type ArgosTapeViewTaskType = "chat" | "resume" | "tool_loop";

export type ArgosTapeViewPolicy =
  | "legacy_context_v1"
  | "legacy_context_shadow"
  | "resume_shadow"
  | "tool_loop_shadow"
  | "context_pressure_recovery_shadow";

export type ArgosTapeViewEntryRole = "system" | "user" | "assistant" | "tool" | null;

export type ArgosTapeViewEntrySource = "tape" | "synthetic";

export type ArgosTapeViewEntryReason =
  | "system_prompt"
  | "selected_history"
  | "new_user_input"
  | "resume_target"
  | "tool_loop_message";

export type ArgosTapeViewExcludedReason =
  | "before_summary_cursor"
  | "compaction_indicator"
  | "pending_not_context_history"
  | "out_of_budget"
  | "empty_after_formatting"
  | "superseded"
  | "retracted";

export interface ArgosTapeViewEntryRef {
  entryId: number | null;
  messageId: string | null;
  orderSeq: number | null;
  role: ArgosTapeViewEntryRole;
  source: ArgosTapeViewEntrySource;
  reason: ArgosTapeViewEntryReason;
}

export interface ArgosTapeViewExcludedRef {
  entryId: number | null;
  messageId: string | null;
  orderSeq: number | null;
  reason: ArgosTapeViewExcludedReason;
}

export interface ArgosTapeViewExcludedRange {
  fromOrderSeq: number;
  toOrderSeq: number;
  count: number;
  reason: ArgosTapeViewExcludedReason;
}

export interface ArgosTapeViewTokenBudget {
  contextLength: number;
  requestedMaxTokens: number;
  effectiveMaxTokens: number;
  reserveTokens: number;
  toolReserveTokens: number;
  estimatedPromptTokens: number;
}

export interface ArgosTapeViewHashes {
  promptHash: string;
  toolDefinitionsHash: string;
  manifestHash: string;
}

export interface ArgosTapeViewMeta {
  providerId: string;
  modelId: string;
  summaryCursorOrderSeq: number;
  supportsVision: boolean;
  supportsAudioInput: boolean;
  traceDebugEnabled: boolean;
}

export interface ArgosTapeViewManifest {
  schemaVersion: 1 | 2;
  hashVersion: number;
  viewId: string;
  sessionId: string;
  messageId: string;
  requestSeq: number;
  taskType: ArgosTapeViewTaskType;
  policy: ArgosTapeViewPolicy;
  policyVersion: number | null;
  contextBuilderVersion: "legacy-v1";
  latestEntryId: number;
  anchorEntryIds: number[];
  reconstructionAnchorEntryId?: number | null;
  parentViewId?: string | null;
  included: ArgosTapeViewEntryRef[];
  excluded: ArgosTapeViewExcludedRef[];
  excludedRanges?: ArgosTapeViewExcludedRange[];
  tokenBudget: ArgosTapeViewTokenBudget;
  hashes: ArgosTapeViewHashes;
  meta: ArgosTapeViewMeta;
  assembledAt: number;
}

export type ArgosTapeViewManifestIntegrity = "valid" | "invalid" | "unverified";

export interface ArgosTapeViewManifestRecord {
  sessionId: string;
  messageId: string;
  requestSeq: number;
  entryId: number;
  createdAt: number;
  manifest: ArgosTapeViewManifest;
  integrity?: ArgosTapeViewManifestIntegrity;
}
