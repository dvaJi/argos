import type { SkillMetadata } from "@shared/types/skill";

/** Filesystem + bundle paths (replaces `app.getPath`/`app.getAppPath`/`app.isPackaged`). */
export interface SkillPathsPort {
  tempDir(): string;
  homeDir(): string;
  /** Bundled skills resource roots. Empty on hosts without a bundle (daemon). */
  bundledSkillRoots(): string[];
}

/** Event broadcast (replaces `eventBus` + `publishArgosEvent`). */
export interface SkillEventPort {
  broadcast(channel: string, payload: unknown): void;
  publish(eventName: string, payload: unknown): void;
}

/**
 * Optional host hooks. Hosts may omit desktop-only capabilities such as
 * worker-backed discovery or file-manager integration.
 */
export interface SkillHostServices {
  /** Discover skill metadata (desktop runs it in a worker; daemon runs inline). */
  discoverMetadata?(input: {
    skillsDir: string;
    sidecarDirName: string;
    maxDepth: number;
  }): Promise<{ skills: SkillMetadata[]; warnings: unknown[] }>;
  /** Open a path in the OS file manager (desktop `shell.openPath`). Optional. */
  openPath?(target: string): Promise<void>;
}

export interface SkillHostPorts {
  paths: SkillPathsPort;
  events: SkillEventPort;
  services?: SkillHostServices;
}
