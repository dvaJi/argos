import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, type _Object } from "@aws-sdk/client-s3";
import type { SyncBackupInfo } from "@argos/shared/presenter";

export interface ResolvedCloudSyncConfig {
  endpoint: string;
  bucket: string;
  region: string;
  prefix: string;
  accessKeyId: string;
  secretAccessKey: string;
}

const BACKUP_FILE_NAME_REGEX = /^backup-\d+\.zip$/;

export class CloudStorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(config: ResolvedCloudSyncConfig) {
    this.bucket = config.bucket;
    this.prefix = config.prefix.replace(/^\/+|\/+$/g, "");
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region || "auto",
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  private buildKey(fileName: string): string {
    return this.prefix ? `${this.prefix}/${fileName}` : fileName;
  }

  public async testConnection(): Promise<void> {
    await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: this.prefix ? `${this.prefix}/` : undefined,
        MaxKeys: 1,
      }),
    );
  }

  public async listBackups(): Promise<SyncBackupInfo[]> {
    const result = await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: this.prefix ? `${this.prefix}/` : undefined,
      }),
    );

    const objects = result.Contents || [];
    return objects
      .filter((obj: _Object) => obj.Key && BACKUP_FILE_NAME_REGEX.test(path.basename(obj.Key)))
      .map((obj: _Object) => {
        const fileName = path.basename(obj.Key!);
        const match = fileName.match(/backup-(\d+)\.zip$/);
        return {
          fileName,
          createdAt: match ? Number(match[1]) : 0,
          size: obj.Size || 0,
        };
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  public async uploadBackup(localPath: string, fileName: string): Promise<void> {
    const fileContent = fs.readFileSync(localPath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.buildKey(fileName),
        Body: fileContent,
      }),
    );
  }

  public async downloadLatest(targetDir: string): Promise<string | null> {
    const backups = await this.listBackups();
    if (backups.length === 0) {
      return null;
    }

    const latest = backups[0];
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.buildKey(latest.fileName),
      }),
    );

    const body = result.Body;
    if (!body) {
      return null;
    }

    const readable = body as Readable;
    const outputPath = path.join(targetDir, latest.fileName);
    fs.mkdirSync(targetDir, { recursive: true });
    await pipeline(readable, fs.createWriteStream(outputPath));

    return latest.fileName;
  }
}
