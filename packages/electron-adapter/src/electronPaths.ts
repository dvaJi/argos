import { app } from "electron";
import type { IPathResolver } from "@argos/backend-core";

export class ElectronPathResolver implements IPathResolver {
  getDataDir(): string {
    return app.getPath("userData");
  }

  getConfigDir(): string {
    return app.getPath("userData");
  }

  getCacheDir(): string {
    return app.getPath("cache");
  }

  getTempDir(): string {
    return app.getPath("temp");
  }

  getDatabasePath(): string {
    const { join } = require("node:path") as typeof import("node:path");
    return join(app.getPath("userData"), "deepchat.db");
  }

  getLogsDir(): string {
    return app.getPath("logs");
  }
}
