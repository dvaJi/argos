import type { ToolchainName, ToolchainSource } from "@argos/shared-contracts/routes";

export type { ToolchainName, ToolchainSource };

/** A derived or explicit resolution result for one tool. */
export interface ResolvedToolchain {
  source: ToolchainSource;
  explicit: boolean;
  path: string | null;
  version: string | null;
  error: string | null;
}

/** Persisted explicit user choice (custom path / explicit unconfigured). */
export interface ToolchainSourceEntry {
  source: "custom" | "unconfigured";
  explicit: true;
  path?: string;
}

export interface ToolchainStateFile {
  version: 1;
  sources: Partial<Record<ToolchainName, ToolchainSourceEntry>>;
}

export interface InstallProgress {
  phase: "idle" | "downloading" | "extracting" | "activating";
  tool: ToolchainName;
  version: string;
  startedAt: number;
}

export interface ToolchainArchive {
  filename: string;
  url: string;
  sha256: string;
}
