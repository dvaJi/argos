import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it, mock, vi } from "bun:test";

const cloudMocks = {
  testConnection: vi.fn(),
  uploadBackup: vi.fn(),
  downloadLatest: vi.fn(),
  constructor: vi.fn(),
};

mock.module("@argos/backend-core", () => ({}));

mock.module("../src/host/bunS3CloudStorageService", () => ({
  BunS3CloudStorageService: class {
    constructor(config: unknown) {
      cloudMocks.constructor(config);
    }

    testConnection = cloudMocks.testConnection;
    uploadBackup = cloudMocks.uploadBackup;
    downloadLatest = cloudMocks.downloadLatest;
  },
}));

const { DaemonSyncRuntime } = await import("../src/host/daemonSyncRuntime");

// bun:test has no vi.stubEnv/vi.unstubAllEnvs — stub manually and restore in afterEach.
let stubbedEnv: Record<string, string | undefined> = {};

function stubEnv(key: string, value: string): void {
  if (!(key in stubbedEnv)) stubbedEnv[key] = process.env[key];
  process.env[key] = value;
}

describe("DaemonSyncRuntime cloud sync", () => {
  let tempDir: string;
  let configDir: string;
  let syncFolderPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "argos-daemon-sync-"));
    configDir = path.join(tempDir, "config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "config.json"), JSON.stringify({ provider: "test" }));
    syncFolderPath = "";
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(stubbedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    stubbedEnv = {};
  });

  function createRuntime(): InstanceType<typeof DaemonSyncRuntime> {
    return new DaemonSyncRuntime({
      configDir,
      configPresenter: {
        getSyncFolderPath: () => syncFolderPath,
      },
      eventPublisher: {
        publish: vi.fn(),
        subscribe: vi.fn(() => vi.fn()),
      },
    });
  }

  it("creates and lists local backups in the configured sync folder", async () => {
    syncFolderPath = path.join(tempDir, "selected-sync-folder");
    const runtime = createRuntime();

    const { timestamp } = await runtime.startBackup();
    const { backups } = await runtime.listBackups();

    expect(backups).toEqual([
      expect.objectContaining({
        fileName: `backup-${timestamp}.zip`,
        createdAt: timestamp,
      }),
    ]);
    expect(fs.existsSync(path.join(syncFolderPath, `backup-${timestamp}.zip`))).toBe(true);
    expect(fs.existsSync(path.join(configDir, "backups", `backup-${timestamp}.zip`))).toBe(false);
  });

  it("persists cloud config without exposing the secret in the config view", async () => {
    const runtime = createRuntime();

    const view = await runtime.setCloudConfig({
      enabled: true,
      endpoint: "http://127.0.0.1:9000",
      bucket: "argos",
      region: "auto",
      prefix: "daemon",
      accessKeyId: "access",
      secretAccessKey: "secret",
    });

    expect(view).toEqual({
      enabled: true,
      endpoint: "http://127.0.0.1:9000",
      bucket: "argos",
      region: "auto",
      prefix: "daemon",
      accessKeyId: "access",
      hasSecret: true,
      safeStorageAvailable: false,
    });
    expect(JSON.parse(fs.readFileSync(path.join(configDir, "cloud-sync.json"), "utf-8"))).toMatchObject({
      secretAccessKey: "secret",
    });

    const updated = await runtime.setCloudConfig({ bucket: "argos-next" });
    expect(updated.bucket).toBe("argos-next");
    expect(updated.hasSecret).toBe(true);
  });

  it("tests cloud credentials using environment overrides", async () => {
    stubEnv("ARGOS_SYNC_S3_ENDPOINT", "http://minio.local");
    stubEnv("ARGOS_SYNC_S3_BUCKET", "env-bucket");
    stubEnv("ARGOS_SYNC_S3_ACCESS_KEY_ID", "env-access");
    stubEnv("ARGOS_SYNC_S3_SECRET_ACCESS_KEY", "env-secret");
    const runtime = createRuntime();

    const result = await runtime.testCloud();

    expect(result).toEqual({ success: true, message: "sync.success.cloudConnected" });
    expect(cloudMocks.constructor).toHaveBeenCalledWith({
      endpoint: "http://minio.local",
      bucket: "env-bucket",
      region: "auto",
      prefix: "argos-backups",
      accessKeyId: "env-access",
      secretAccessKey: "env-secret",
    });
    expect(cloudMocks.testConnection).toHaveBeenCalledOnce();
  });

  it("creates a daemon backup and uploads it to cloud storage", async () => {
    const runtime = createRuntime();
    await runtime.setCloudConfig({
      endpoint: "http://127.0.0.1:9000",
      bucket: "argos",
      accessKeyId: "access",
      secretAccessKey: "secret",
    });

    const result = await runtime.uploadToCloud();

    expect(result.success).toBe(true);
    expect(result.fileName).toMatch(/^backup-\d+\.zip$/);
    expect(cloudMocks.uploadBackup).toHaveBeenCalledWith(expect.stringMatching(/backup-\d+\.zip$/), result.fileName);
    expect(fs.existsSync(path.join(configDir, "backups", result.fileName!))).toBe(true);
  });

  it("downloads the latest cloud backup and restores daemon config files", async () => {
    cloudMocks.downloadLatest.mockImplementation(async (targetDir: string) => {
      const fileName = "backup-123.zip";
      fs.mkdirSync(targetDir, { recursive: true });
      fs.writeFileSync(
        path.join(targetDir, fileName),
        Buffer.from(
          zipSync({
            "config.json": Buffer.from(JSON.stringify({ restored: true })),
          }),
        ),
      );
      return fileName;
    });
    const runtime = createRuntime();
    await runtime.setCloudConfig({
      endpoint: "http://127.0.0.1:9000",
      bucket: "argos",
      accessKeyId: "access",
      secretAccessKey: "secret",
    });

    const result = await runtime.pullFromCloud();

    expect(result).toEqual({
      success: true,
      message: "sync.success.cloudDownloaded",
      fileName: "backup-123.zip",
    });
    expect(JSON.parse(fs.readFileSync(path.join(configDir, "config.json"), "utf-8"))).toEqual({ restored: true });
  });

  it("surfaces backup directory read failures instead of hiding them", async () => {
    const runtime = createRuntime();
    const spy = vi.spyOn(fs, "readdirSync").mockImplementation(() => {
      throw new Error("boom");
    });

    await expect(runtime.listBackups()).rejects.toThrow("sync.error.backupListFailed");
    await expect(runtime.getBackupStatus()).rejects.toThrow("sync.error.backupListFailed");

    spy.mockRestore();
  });
});
