import { join } from "path";
import { homedir } from "os";
import type { IPathResolver } from "@argos/backend-core";

export class BunPathResolver implements IPathResolver {
  private dataDir: string;

  constructor(dataDir?: string) {
    this.dataDir = dataDir || join(homedir(), ".argos-daemon");
  }

  getDataDir(): string {
    return this.dataDir;
  }

  getConfigDir(): string {
    return join(this.dataDir, "config");
  }

  getCacheDir(): string {
    return join(this.dataDir, "cache");
  }

  getTempDir(): string {
    return join(this.dataDir, "tmp");
  }

  getDatabasePath(): string {
    return join(this.dataDir, "data", "argos.db");
  }

  getLogsDir(): string {
    return join(this.dataDir, "logs");
  }
}
