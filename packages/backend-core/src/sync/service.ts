import path from "path";
import { zipSync } from "fflate";
import type { SyncBackupInfo, CloudSyncResult } from "@shared/presenter";
import { CloudStorageService } from "./cloudStorageService";
import type { SyncServiceDeps, BackupStatus } from "./types";

const BACKUP_PREFIX = "backup-";
const BACKUP_EXTENSION = ".zip";
const BACKUP_FILE_NAME_REGEX = /^backup-\d+\.zip$/;
const BACKUP_DELAY = 60 * 1000;
const CURRENT_SYNC_BACKUP_VERSION = 2;

const ZIP_PATHS = {
  agentDb: "database/agent.db",
  chatDb: "database/chat.db",
  appSettings: "configs/app-settings.json",
  customPrompts: "configs/custom_prompts.json",
  systemPrompts: "configs/system_prompts.json",
  mcpSettings: "configs/mcp-settings.json",
  manifest: "manifest.json",
};

export class SyncService {
  private isBackingUp = false;
  private currentBackupStatus: BackupStatus = "idle";
  private backupTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly deps: SyncServiceDeps) {}

  public init(): void {
    this.listenForChanges();
  }

  public destroy(): void {
    if (this.backupTimer) {
      clearTimeout(this.backupTimer);
      this.backupTimer = null;
    }
  }

  public async checkSyncFolder(): Promise<{ exists: boolean; path: string }> {
    const syncFolderPath = this.deps.config.getSyncFolderPath();
    const exists = this.deps.fs.existsSync(syncFolderPath);
    return { exists, path: syncFolderPath };
  }

  public async getBackupStatus(): Promise<{ isBackingUp: boolean; lastBackupTime: number }> {
    const lastBackupTime = this.deps.config.getLastSyncTime();
    return { isBackingUp: this.isBackingUp, lastBackupTime };
  }

  public async listBackups(): Promise<SyncBackupInfo[]> {
    const { path: syncFolderPath } = await this.checkSyncFolder();
    const backupsDir = this.getBackupsDirectory(syncFolderPath);
    if (!this.deps.fs.existsSync(backupsDir)) {
      return [];
    }

    const entries = this.deps.fs.readdirSync(backupsDir);
    return entries
      .filter((file: string) => file.endsWith(BACKUP_EXTENSION))
      .map((fileName: string) => {
        const match = fileName.match(/backup-(\d+)\.zip$/);
        const createdAt = match ? Number(match[1]) : this.deps.fs.statSync(path.join(backupsDir, fileName)).mtimeMs;
        const stats = this.deps.fs.statSync(path.join(backupsDir, fileName));
        return { fileName, createdAt, size: stats.size };
      })
      .sort((a: SyncBackupInfo, b: SyncBackupInfo) => b.createdAt - a.createdAt);
  }

  // === Cloud sync ===

  private buildCloudService(): CloudStorageService {
    const resolved = this.deps.config.getResolvedCloudSyncConfig();
    if (!resolved) {
      throw new Error("sync.error.cloudNotConfigured");
    }
    return new CloudStorageService(resolved);
  }

  private normalizeCloudError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("sync.error.")) {
      return message;
    }
    return message || "sync.error.cloudOperationFailed";
  }

  public async testCloudConnection(): Promise<CloudSyncResult> {
    try {
      const service = this.buildCloudService();
      await service.testConnection();
      return { success: true, message: "sync.success.cloudConnected" };
    } catch (error) {
      console.error("Cloud connection test failed:", error);
      return { success: false, message: this.normalizeCloudError(error) };
    }
  }

  public async uploadLatestBackupToCloud(): Promise<CloudSyncResult> {
    try {
      const service = this.buildCloudService();
      const backups = (await this.listBackups()).filter(({ fileName }) => BACKUP_FILE_NAME_REGEX.test(fileName));
      if (backups.length === 0) {
        return { success: false, message: "sync.error.noLocalBackup" };
      }
      const { path: syncFolderPath } = await this.checkSyncFolder();
      const backupsDir = this.getBackupsDirectory(syncFolderPath);

      for (const backup of backups) {
        const localPath = path.join(backupsDir, backup.fileName);
        if (!this.deps.fs.existsSync(localPath)) {
          continue;
        }
        await service.uploadBackup(localPath, backup.fileName);
        return { success: true, message: "sync.success.cloudUploaded", fileName: backup.fileName };
      }

      return { success: false, message: "sync.error.noLocalBackup" };
    } catch (error) {
      console.error("Cloud upload failed:", error);
      return { success: false, message: this.normalizeCloudError(error) };
    }
  }

  public async pullLatestBackupFromCloud(): Promise<CloudSyncResult> {
    try {
      const service = this.buildCloudService();
      const { path: syncFolderPath } = await this.checkSyncFolder();
      const backupsDir = this.getBackupsDirectory(syncFolderPath);
      const fileName = await service.downloadLatest(backupsDir);
      if (!fileName) {
        return { success: false, message: "sync.error.cloudNoBackup" };
      }
      return { success: true, message: "sync.success.cloudDownloaded", fileName };
    } catch (error) {
      console.error("Cloud pull failed:", error);
      return { success: false, message: this.normalizeCloudError(error) };
    }
  }

  // === Local backup ===

  public async startBackup(): Promise<SyncBackupInfo | null> {
    if (this.isBackingUp) {
      return null;
    }

    if (!this.deps.config.getSyncEnabled()) {
      throw new Error("sync.error.notEnabled");
    }

    try {
      return await this.performBackup();
    } catch (error) {
      console.error("Backup failed:", error);
      this.deps.events.publish("sync.backupError", (error as Error).message || "sync.error.unknown");
      throw error;
    }
  }

  public async cancelBackup(): Promise<void> {
    if (this.backupTimer) {
      clearTimeout(this.backupTimer);
      this.backupTimer = null;
    }
    this.isBackingUp = false;
  }

  private async performBackup(): Promise<SyncBackupInfo> {
    this.isBackingUp = true;
    this.emitBackupStatus("preparing");
    this.deps.events.publish("sync.backupStarted");

    const syncFolderPath = this.deps.config.getSyncFolderPath();
    if (!this.deps.fs.existsSync(syncFolderPath)) {
      this.deps.fs.mkdirSync(syncFolderPath, { recursive: true });
    }
    const backupsDir = this.getBackupsDirectory(syncFolderPath);
    this.deps.fs.mkdirSync(backupsDir, { recursive: true });

    const timestamp = Date.now();
    const backupFileName = `${BACKUP_PREFIX}${timestamp}${BACKUP_EXTENSION}`;
    const tempZipPath = path.join(backupsDir, `${backupFileName}.tmp`);
    const finalZipPath = path.join(backupsDir, backupFileName);

    let completedTimestamp: number | null = null;
    let encounteredError = false;

    try {
      this.emitBackupStatus("collecting");

      // Collect files for backup
      const files: Record<string, Uint8Array> = {};
      const dbPath = this.deps.config.getDatabasePath?.() || "";
      if (dbPath && this.deps.fs.existsSync(dbPath)) {
        files[ZIP_PATHS.agentDb] = new Uint8Array(this.deps.fs.readFileSync(dbPath));
      }

      const appSettingsPath = this.deps.config.getAppSettingsPath?.() || "";
      if (appSettingsPath && this.deps.fs.existsSync(appSettingsPath)) {
        files[ZIP_PATHS.appSettings] = new Uint8Array(this.deps.fs.readFileSync(appSettingsPath));
      }

      const manifest = {
        version: CURRENT_SYNC_BACKUP_VERSION,
        createdAt: timestamp,
        configStorage: "json",
        files: Object.keys(files),
      };
      files[ZIP_PATHS.manifest] = new Uint8Array(Buffer.from(JSON.stringify(manifest, null, 2), "utf-8"));

      this.emitBackupStatus("compressing");
      const zipData = zipSync(files, { level: 6 });
      this.deps.fs.writeFileSync(tempZipPath, Buffer.from(zipData));

      if (this.deps.fs.existsSync(finalZipPath)) {
        this.deps.fs.unlinkSync(finalZipPath);
      }
      this.emitBackupStatus("finalizing");
      this.deps.fs.renameSync(tempZipPath, finalZipPath);

      const backupStats = this.deps.fs.statSync(finalZipPath);
      this.deps.config.setLastSyncTime(timestamp);
      this.deps.events.publish("sync.backupCompleted", timestamp);
      completedTimestamp = timestamp;

      return { fileName: backupFileName, createdAt: timestamp, size: backupStats.size };
    } catch (error) {
      if (this.deps.fs.existsSync(tempZipPath)) {
        this.deps.fs.unlinkSync(tempZipPath);
      }
      encounteredError = true;
      this.emitBackupStatus("error", {
        message: (error as Error)?.message || "sync.error.unknown",
      });
      throw error;
    } finally {
      this.isBackingUp = false;
      const extra: Record<string, unknown> = {};
      if (completedTimestamp) {
        extra.lastSuccessfulBackupTime = completedTimestamp;
      }
      if (encounteredError) {
        extra.failed = true;
      }
      this.emitBackupStatus("idle", extra);
    }
  }

  private listenForChanges(): void {
    const scheduleBackup = () => {
      if (!this.deps.config.getSyncEnabled()) {
        return;
      }
      if (this.backupTimer) {
        clearTimeout(this.backupTimer);
      }
      this.backupTimer = setTimeout(async () => {
        if (!this.isBackingUp) {
          try {
            await this.performBackup();
          } catch (error) {
            console.error("auto backup failed:", error);
          }
        }
      }, BACKUP_DELAY);
    };

    this.deps.events.subscribe("sync.dataChanged", scheduleBackup);
  }

  private getBackupsDirectory(syncFolderPath: string): string {
    return syncFolderPath;
  }

  private emitBackupStatus(status: BackupStatus, extra: Record<string, unknown> = {}): void {
    this.deps.events.publish("sync.backupStatusChanged", {
      status,
      previousStatus: this.currentBackupStatus,
      ...extra,
    });
    this.currentBackupStatus = status;
  }
}
