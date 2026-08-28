import type { MCPToolDefinition, MCPToolResponse } from "@argos/shared/types/core/mcp";

export interface PiWorkerProvider {
  id: string;
  name: string;
  api: string;
  apiKey: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  model: {
    id: string;
    name: string;
    reasoning: boolean;
    input: Array<"text" | "image">;
    contextWindow: number;
    maxTokens: number;
    samplingParams?: Record<string, unknown>;
    cost?: {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
    };
  };
}

export interface PiWorkerInit {
  type: "init";
  sessionId: string;
  cwd: string;
  agentDir: string;
  sessionDir: string;
  sessionFile?: string;
  systemPrompt?: string;
  provider: PiWorkerProvider;
  thinkingLevel?: string;
  disabledTools: string[];
  /** Opt-in native PowerShell tool (Windows only; see createPowerShellTool). */
  enablePowershellTool?: boolean;
  tools: MCPToolDefinition[];
  orchestrationTools: MCPToolDefinition[];
  projectTrusted: boolean;
  permissionMode: "default" | "full_access";
  profileFingerprint: string;
}

export type PiWorkerCommand =
  | PiWorkerInit
  | { type: "prompt"; id: string; text: string }
  | { type: "steer"; id: string; text: string }
  | { type: "followUp"; id: string; text: string }
  | { type: "abort"; id: string }
  | { type: "compact"; id: string; instructions?: string }
  | { type: "permissionResponse"; id: string; granted: boolean }
  | { type: "mcpResponse"; id: string; response?: MCPToolResponse; error?: string }
  | { type: "uiResponse"; id: string; value?: unknown; error?: string }
  | { type: "dispose" };

export type PiWorkerEvent =
  | { type: "ready"; sessionFile?: string; diagnostics: PiWorkerDiagnostic[] }
  | { type: "accepted"; id: string; sessionFile?: string }
  | { type: "delta"; kind: "text" | "thinking"; text: string }
  | { type: "thinkingStart" }
  | { type: "thinkingEnd" }
  | { type: "toolStart"; toolCallId: string; toolName: string; input: unknown }
  | { type: "toolUpdate"; toolCallId: string; toolName: string; partialResult: unknown }
  | { type: "toolEnd"; toolCallId: string; toolName: string; result: unknown; isError: boolean }
  | { type: "bashUpdate"; toolCallId?: string; delta: string }
  | { type: "queue"; steering: readonly string[]; followUp: readonly string[] }
  | {
      type: "compaction";
      phase: "start" | "end" | "failed";
      reason: string;
      error?: string;
      aborted?: boolean;
      willRetry?: boolean;
    }
  | { type: "retry"; phase: "start" | "end"; attempt: number; error?: string }
  | { type: "settled"; id?: string; sessionFile?: string; messageTimestamp?: number }
  | { type: "error"; id?: string; message: string; stack?: string }
  | {
      type: "usage";
      id?: string;
      usage: {
        input: number;
        output: number;
        cacheRead: number;
        cacheWrite: number;
        total: number;
        cost: number;
      };
    }
  | {
      type: "permissionRequest";
      id: string;
      toolCallId: string;
      toolName: string;
      input: unknown;
    }
  | {
      type: "mcpRequest";
      id: string;
      toolCallId: string;
      toolName: string;
      input: Record<string, unknown>;
    }
  | {
      type: "uiRequest";
      id: string;
      method: "select" | "confirm" | "input" | "editor";
      title: string;
      message?: string;
      options?: string[];
    }
  | { type: "notification"; level: "info" | "warning" | "error"; message: string }
  | { type: "diagnostic"; diagnostic: PiWorkerDiagnostic };

interface PiWorkerDiagnostic {
  severity: "info" | "warning" | "error";
  source: string;
  message: string;
}
