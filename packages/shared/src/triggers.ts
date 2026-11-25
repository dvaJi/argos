export const TRIGGER_TYPES = ["webhook", "folder"] as const;
export type TriggerType = (typeof TRIGGER_TYPES)[number];

export type TriggerTrust = "owner" | "outside";

export interface TriggerConfig {
  /** Folder triggers only. */
  path?: string;
  /** Folder triggers only; optional glob such as *.pdf. */
  pattern?: string;
}

export interface TriggerRecord {
  id: string;
  name: string;
  type: TriggerType;
  config: TriggerConfig;
  prompt: string;
  agentId: string;
  sessionId: string | null;
  trust: TriggerTrust;
  enabled: boolean;
  webhookPath: string | null;
  secret: string | null;
  lastRunAt: number | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface TriggerUpsertInput {
  id?: string;
  name: string;
  type: TriggerType;
  config: TriggerConfig;
  prompt: string;
  agentId: string;
  sessionId?: string | null;
  trust?: TriggerTrust;
  enabled?: boolean;
}
