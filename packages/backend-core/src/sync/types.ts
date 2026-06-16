export type BackupStatus = "idle" | "preparing" | "collecting" | "compressing" | "finalizing" | "error";

export interface SyncConfigPort {
  getSyncFolderPath(): string;
  getSyncEnabled(): boolean;
  getLastSyncTime(): number;
  setLastSyncTime(time: number): void;
  getResolvedCloudSyncConfig(): import("./cloudStorageService").ResolvedCloudSyncConfig | null;
  getDatabasePath?(): string;
  getAppSettingsPath?(): string;
}

export interface FileSystemPort {
  existsSync(path: string): boolean;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  readFileSync(path: string): Buffer;
  writeFileSync(path: string, data: Buffer | string): void;
  copyFileSync(src: string, dest: string): void;
  unlinkSync(path: string): void;
  readdirSync(path: string): string[];
  statSync(path: string): { size: number; mtimeMs: number };
  renameSync(oldPath: string, newPath: string): void;
  rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
}

export interface EventPublisherPort {
  publish(eventName: string, payload?: unknown): void;
  subscribe(eventName: string, handler: (payload?: unknown) => void): () => void;
}

export interface SyncServiceDeps {
  config: SyncConfigPort;
  fs: FileSystemPort;
  events: EventPublisherPort;
}

export interface SyncBackupManifest {
  version: number;
  createdAt?: number;
  files?: string[];
  configStorage?: string;
  configSchemaVersion?: number;
  databaseEncrypted?: boolean;
  databaseCipher?: string;
}
