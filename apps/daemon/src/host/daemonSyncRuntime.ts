import fs from "node:fs";
import path from "node:path";
import { zipSync, unzipSync } from "fflate";
import type { IEventPublisher } from "@argos/backend-core";
import { BunS3CloudStorageService, type DaemonResolvedCloudSyncConfig } from "./bunS3CloudStorageService";

export interface BackupInfo {
  name: string;
  fileName: string;
  timestamp: number;
  createdAt: number;
  size: number;
}

interface CloudSyncConfigBase {
  enabled: boolean;
  endpoint: string;
  bucket: string;
  region: string;
  prefix: string;
  accessKeyId: string;
}

export interface CloudSyncConfigView extends CloudSyncConfigBase {
  hasSecret: boolean;
  safeStorageAvailable: boolean;
}

export interface CloudSyncConfigInput extends Partial<CloudSyncConfigBase> {
  secretAccessKey?: string;
}

export interface CloudSyncResult {
  success: boolean;
  message: string;
  fileName?: string;
}

interface StoredCloudSyncConfig extends CloudSyncConfigBase {
  secretAccessKey: string;
}

const DEFAULT_CLOUD_CONFIG: StoredCloudSyncConfig = {
  enabled: false,
  endpoint: "",
  bucket: "",
  region: "auto",
  prefix: "argos-backups",
  accessKeyId: "",
  secretAccessKey: "",
};

const DAEMON_BACKUP_FILE_NAME_REGEX = /^(?:daemon-)?backup-\d+\.zip$/;

/**
 * Daemon sync runtime. Backs up / restores the daemon's JSON-backed data dir
 * (config + MCP/ACP stores). The desktop's sync is coupled to its SQLite agent
 * DB; the daemon's data model is simpler JSON files, so this is a purpose-built
 * implementation rather than a shared port.
 */
export class DaemonSyncRuntime {
  private readonly configDir: string;
  private readonly cloudConfigPath: string;
  private readonly configPresenter: { getSyncFolderPath(): string };

  constructor(deps: {
    configDir: string;
    eventPublisher: IEventPublisher;
    configPresenter: { getSyncFolderPath(): string };
  }) {
    this.configDir = deps.configDir;
    this.configPresenter = deps.configPresenter;
    this.cloudConfigPath = path.join(deps.configDir, "cloud-sync.json");
    this.ensureBackupDir();
  }

  async getBackupStatus(): Promise<{ autoSyncEnabled: boolean; lastBackupTimestamp: number | null }> {
    const backups = this.listBackupsSync();
    return {
      autoSyncEnabled: false,
      lastBackupTimestamp: backups.length ? backups[0].timestamp : null,
    };
  }

  async listBackups(): Promise<{ backups: BackupInfo[] }> {
    return { backups: this.listBackupsSync() };
  }

  async startBackup(): Promise<{ timestamp: number }> {
    const backupDir = this.ensureBackupDir();
    const timestamp = Date.now();
    const name = `backup-${timestamp}.zip`;
    const target = path.join(backupDir, name);
    // Collect JSON config files from the config dir.
    const entries: Record<string, Uint8Array> = {};
    for (const file of this.configFiles()) {
      try {
        entries[file] = fs.readFileSync(path.join(this.configDirRoot(), file));
      } catch {
        // skip missing files
      }
    }
    fs.writeFileSync(target, zipSync(entries));
    return { timestamp };
  }

  async restoreBackup(name: string): Promise<void> {
    const target = path.join(this.resolveBackupDir(), name);
    if (!fs.existsSync(target)) throw new Error(`Backup not found: ${name}`);
    const raw = fs.readFileSync(target);
    const extracted = unzipSync(new Uint8Array(raw));
    for (const [file, data] of Object.entries(extracted)) {
      const dest = path.join(this.configDirRoot(), file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, data as Uint8Array);
    }
  }

  // ---- cloud ----
  async getCloudConfig(): Promise<CloudSyncConfigView> {
    return this.toCloudConfigView(this.readCloudConfigWithEnv());
  }

  async setCloudConfig(config: CloudSyncConfigInput): Promise<CloudSyncConfigView> {
    const current = this.readStoredCloudConfig();
    const next: StoredCloudSyncConfig = {
      enabled: config.enabled ?? current.enabled,
      endpoint: config.endpoint ?? current.endpoint,
      bucket: config.bucket ?? current.bucket,
      region: config.region ?? current.region,
      prefix: config.prefix ?? current.prefix,
      accessKeyId: config.accessKeyId ?? current.accessKeyId,
      secretAccessKey:
        typeof config.secretAccessKey === "string" && config.secretAccessKey.length > 0
          ? config.secretAccessKey
          : current.secretAccessKey,
    };

    fs.mkdirSync(path.dirname(this.cloudConfigPath), { recursive: true });
    fs.writeFileSync(this.cloudConfigPath, JSON.stringify(next, null, 2));

    return this.toCloudConfigView(this.readCloudConfigWithEnv());
  }

  async uploadToCloud(): Promise<CloudSyncResult> {
    try {
      const service = this.buildCloudService();
      const { timestamp } = await this.startBackup();
      const backup = this.listBackupsSync().find((entry) => entry.timestamp === timestamp);
      if (!backup) {
        return { success: false, message: "sync.error.noLocalBackup" };
      }

      await service.uploadBackup(path.join(this.resolveBackupDir(), backup.fileName), backup.fileName);
      return { success: true, message: "sync.success.cloudUploaded", fileName: backup.fileName };
    } catch (error) {
      console.error("Daemon cloud upload failed:", error);
      return { success: false, message: this.normalizeCloudError(error) };
    }
  }

  async pullFromCloud(): Promise<CloudSyncResult> {
    try {
      const service = this.buildCloudService();
      const fileName = await service.downloadLatest(this.ensureBackupDir());
      if (!fileName) {
        return { success: false, message: "sync.error.cloudNoBackup" };
      }
      await this.restoreBackup(fileName);
      return { success: true, message: "sync.success.cloudDownloaded", fileName };
    } catch (error) {
      console.error("Daemon cloud pull failed:", error);
      return { success: false, message: this.normalizeCloudError(error) };
    }
  }

  async testCloud(): Promise<CloudSyncResult> {
    try {
      const service = this.buildCloudService();
      await service.testConnection();
      return { success: true, message: "sync.success.cloudConnected" };
    } catch (error) {
      console.error("Daemon cloud connection test failed:", error);
      return { success: false, message: this.normalizeCloudError(error) };
    }
  }

  private listBackupsSync(): BackupInfo[] {
    const backupDir = this.ensureBackupDir();
    try {
      return fs
        .readdirSync(backupDir)
        .filter((f) => DAEMON_BACKUP_FILE_NAME_REGEX.test(f))
        .map((f) => {
          const stat = fs.statSync(path.join(backupDir, f));
          const match = f.match(/backup-(\d+)\.zip$/);
          const timestamp = match ? Number(match[1]) : stat.mtimeMs;
          return { name: f, fileName: f, timestamp, createdAt: timestamp, size: stat.size };
        })
        .sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error("Failed to list daemon backup files:", error);
      throw new Error("sync.error.backupListFailed");
    }
  }

  private configDirRoot(): string {
    return this.configDir;
  }

  private resolveBackupDir(): string {
    return this.configPresenter.getSyncFolderPath().trim() || path.join(this.configDir, "backups");
  }

  private ensureBackupDir(): string {
    const backupDir = this.resolveBackupDir();
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    return backupDir;
  }

  private configFiles(): string[] {
    return ["config.json", "mcp-settings.json", "acp_agents.json"];
  }

  private readStoredCloudConfig(): StoredCloudSyncConfig {
    try {
      if (!fs.existsSync(this.cloudConfigPath)) {
        return { ...DEFAULT_CLOUD_CONFIG };
      }
      const parsed = JSON.parse(fs.readFileSync(this.cloudConfigPath, "utf-8")) as Partial<StoredCloudSyncConfig>;
      return {
        enabled: parsed.enabled ?? DEFAULT_CLOUD_CONFIG.enabled,
        endpoint: parsed.endpoint ?? DEFAULT_CLOUD_CONFIG.endpoint,
        bucket: parsed.bucket ?? DEFAULT_CLOUD_CONFIG.bucket,
        region: parsed.region ?? DEFAULT_CLOUD_CONFIG.region,
        prefix: parsed.prefix ?? DEFAULT_CLOUD_CONFIG.prefix,
        accessKeyId: parsed.accessKeyId ?? DEFAULT_CLOUD_CONFIG.accessKeyId,
        secretAccessKey: parsed.secretAccessKey ?? DEFAULT_CLOUD_CONFIG.secretAccessKey,
      };
    } catch (error) {
      console.error("Failed to read daemon cloud sync config:", error);
      return { ...DEFAULT_CLOUD_CONFIG };
    }
  }

  private readCloudConfigWithEnv(): StoredCloudSyncConfig {
    const stored = this.readStoredCloudConfig();
    return {
      enabled: stored.enabled,
      endpoint: process.env.ARGOS_SYNC_S3_ENDPOINT || stored.endpoint,
      bucket: process.env.ARGOS_SYNC_S3_BUCKET || stored.bucket,
      region: process.env.ARGOS_SYNC_S3_REGION || stored.region,
      prefix: process.env.ARGOS_SYNC_S3_PREFIX || stored.prefix,
      accessKeyId: process.env.ARGOS_SYNC_S3_ACCESS_KEY_ID || stored.accessKeyId,
      secretAccessKey: process.env.ARGOS_SYNC_S3_SECRET_ACCESS_KEY || stored.secretAccessKey,
    };
  }

  private toCloudConfigView(config: StoredCloudSyncConfig): CloudSyncConfigView {
    return {
      enabled: config.enabled,
      endpoint: config.endpoint,
      bucket: config.bucket,
      region: config.region,
      prefix: config.prefix,
      accessKeyId: config.accessKeyId,
      hasSecret: Boolean(config.secretAccessKey),
      safeStorageAvailable: false,
    };
  }

  private getResolvedCloudSyncConfig(): DaemonResolvedCloudSyncConfig | null {
    const config = this.readCloudConfigWithEnv();
    if (!config.endpoint || !config.bucket || !config.accessKeyId || !config.secretAccessKey) {
      return null;
    }
    return {
      endpoint: config.endpoint,
      bucket: config.bucket,
      region: config.region,
      prefix: config.prefix,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    };
  }

  private buildCloudService(): BunS3CloudStorageService {
    const resolved = this.getResolvedCloudSyncConfig();
    if (!resolved) {
      throw new Error("sync.error.cloudNotConfigured");
    }
    return new BunS3CloudStorageService(resolved);
  }

  private normalizeCloudError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("sync.error.")) {
      return message;
    }
    return message || "sync.error.cloudOperationFailed";
  }
}
