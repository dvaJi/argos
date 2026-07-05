import fs from "node:fs";
import path from "node:path";
import { zipSync, unzipSync } from "fflate";
import type { IEventPublisher } from "@argos/backend-core";

export interface BackupInfo {
  name: string;
  timestamp: number;
  size: number;
}

/**
 * Daemon sync runtime. Backs up / restores the daemon's JSON-backed data dir
 * (config + MCP/ACP stores). The desktop's sync is coupled to its SQLite agent
 * DB; the daemon's data model is simpler JSON files, so this is a purpose-built
 * implementation rather than a shared port.
 *
 * v1: local backup/restore only. Cloud upload/download/test are stubbed.
 */
export class DaemonSyncRuntime {
  private readonly backupDir: string;

  constructor(deps: { dataDir: string; configDir: string; eventPublisher: IEventPublisher }) {
    this.backupDir = path.join(deps.configDir, "backups");
    if (!fs.existsSync(this.backupDir)) fs.mkdirSync(this.backupDir, { recursive: true });
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
    const timestamp = Date.now();
    const name = `daemon-backup-${timestamp}.zip`;
    const target = path.join(this.backupDir, name);
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
    const target = path.join(this.backupDir, name);
    if (!fs.existsSync(target)) throw new Error(`Backup not found: ${name}`);
    const raw = fs.readFileSync(target);
    const extracted = unzipSync(new Uint8Array(raw));
    for (const [file, data] of Object.entries(extracted)) {
      const dest = path.join(this.configDirRoot(), file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, data as Uint8Array);
    }
  }

  // ---- cloud (v1 stubs) ----
  async getCloudConfig(): Promise<{ configured: boolean }> {
    return { configured: false };
  }
  async setCloudConfig(): Promise<{ saved: boolean }> {
    return { saved: false };
  }
  async uploadToCloud(): Promise<{ ok: boolean; error: string | null }> {
    return { ok: false, error: "Cloud sync not configured in daemon mode" };
  }
  async pullFromCloud(): Promise<{ ok: boolean; error: string | null }> {
    return { ok: false, error: "Cloud sync not configured in daemon mode" };
  }
  async testCloud(): Promise<{ ok: boolean; error: string | null }> {
    return { ok: false, error: "Cloud sync not configured in daemon mode" };
  }

  private listBackupsSync(): BackupInfo[] {
    try {
      return fs
        .readdirSync(this.backupDir)
        .filter((f) => f.endsWith(".zip"))
        .map((f) => {
          const stat = fs.statSync(path.join(this.backupDir, f));
          return { name: f, timestamp: stat.mtimeMs, size: stat.size };
        })
        .sort((a, b) => b.timestamp - a.timestamp);
    } catch {
      return [];
    }
  }

  private configDirRoot(): string {
    return path.dirname(this.backupDir);
  }

  private configFiles(): string[] {
    return ["config.json", "mcp-settings.json", "acp_agents.json"];
  }
}
