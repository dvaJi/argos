import fs from "node:fs";
import path from "node:path";
import { S3Client } from "bun";

export interface DaemonResolvedCloudSyncConfig {
  endpoint: string;
  bucket: string;
  region: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export interface CloudBackupInfo {
  fileName: string;
  createdAt: number;
  size: number;
}

const BACKUP_FILE_NAME_REGEX = /^backup-\d+\.zip$/;

export class BunS3CloudStorageService {
  private readonly client: S3Client;
  private readonly prefix: string;

  constructor(config: DaemonResolvedCloudSyncConfig) {
    this.prefix = config.prefix.replace(/^\/+|\/+$/g, "");
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region || "auto",
      bucket: config.bucket,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    });
  }

  private buildKey(fileName: string): string {
    return this.prefix ? `${this.prefix}/${fileName}` : fileName;
  }

  async testConnection(): Promise<void> {
    await this.client.list({
      prefix: this.prefix ? `${this.prefix}/` : undefined,
      maxKeys: 1,
    });
  }

  async listBackups(): Promise<CloudBackupInfo[]> {
    const result = await this.client.list({
      prefix: this.prefix ? `${this.prefix}/` : undefined,
      maxKeys: 1000,
    });
    return (result.contents || [])
      .flatMap((object) => {
        if (!object.key) {
          return [];
        }
        const fileName = path.basename(object.key);
        if (!BACKUP_FILE_NAME_REGEX.test(fileName)) {
          return [];
        }
        const match = fileName.match(/backup-(\d+)\.zip$/);
        return [
          {
            fileName,
            createdAt: match ? Number(match[1]) : 0,
            size: object.size || 0,
          },
        ];
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async uploadBackup(localPath: string, fileName: string): Promise<void> {
    await this.client.write(this.buildKey(fileName), fs.readFileSync(localPath));
  }

  async downloadLatest(targetDir: string): Promise<string | null> {
    const backups = await this.listBackups();
    if (backups.length === 0) {
      return null;
    }

    const latest = backups[0];
    const bytes = await this.client.file(this.buildKey(latest.fileName)).bytes();
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, latest.fileName), bytes);
    return latest.fileName;
  }
}
