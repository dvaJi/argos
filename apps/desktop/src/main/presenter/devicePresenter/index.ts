import { IDevicePresenter, DeviceInfo, MemoryInfo, DiskInfo } from "@argos/shared/presenter";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { app, dialog } from "electron";
import { nanoid } from "nanoid";
import axios from "axios";
import { is } from "@electron-toolkit/utils";
import { eventBus, SendTarget } from "../../eventbus";
import { NOTIFICATION_EVENTS } from "../../events";
import { invokeDaemonRoute } from "#/routes/daemonRouteProxy";
import { svgSanitizer } from "@argos/backend-core";
import { createLogger } from "@argos/shared/logger";

const log = createLogger("Device");

// Lazy-loaded to avoid a circular dependency: this module is imported by
// baseProvider, which the #/presenter barrel re-exports. Eagerly importing the
// barrel here makes BaseLLMProvider undefined at provider class-definition time.
const getPresenter = async () => (await import("../index")).presenter;
const execAsync = promisify(exec);

function toMimeType(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.find((item): item is string => typeof item === "string") ?? "";
  }

  return "";
}

function getImageExtensionFromMimeType(value: unknown): string {
  const mimeType = toMimeType(value).toLowerCase();

  if (mimeType.includes("png")) {
    return "png";
  }
  if (mimeType.includes("gif")) {
    return "gif";
  }
  if (mimeType.includes("webp")) {
    return "webp";
  }
  if (mimeType.includes("svg")) {
    return "svg";
  }

  return "jpg";
}

export class DevicePresenter implements IDevicePresenter {
  static getDefaultHeaders(): Record<string, string> {
    const version = app.getVersion();
    return {
      "HTTP-Referer": "https://argos.aipurrjects.xyz",
      "X-Title": "Argos",
      "User-Agent": `Argos/${version}`,
    };
  }
  async getAppVersion(): Promise<string> {
    return app.getVersion();
  }

  async getDeviceInfo(): Promise<DeviceInfo> {
    const platform = process.platform;
    const osVersion = os.release();

    // Build version metadata based on current platform
    let osVersionMetadata: Array<{ name: string; build: number }> = [];

    if (platform === "win32") {
      osVersionMetadata = [
        { name: "Windows 11", build: 22000 },
        { name: "Windows 10", build: 10240 },
        { name: "Windows 8.1", build: 9600 },
        { name: "Windows 8", build: 9200 },
      ];
    } else if (platform === "darwin") {
      osVersionMetadata = [
        { name: "macOS Tahoe", build: 25 },
        { name: "macOS Sequoia", build: 24 },
        { name: "macOS Sonoma", build: 23 },
        { name: "macOS Ventura", build: 22 },
        { name: "macOS Monterey", build: 21 },
        { name: "macOS Big Sur", build: 20 },
      ];
    }

    return {
      platform,
      arch: process.arch,
      cpuModel: os.cpus()[0].model,
      totalMemory: os.totalmem(),
      osVersion,
      osVersionMetadata,
    };
  }

  async getCPUUsage(): Promise<number> {
    const startMeasure = os.cpus().map((cpu) => cpu.times);

    // Wait for 100ms to get a meaningful CPU usage measurement
    await new Promise((resolve) => setTimeout(resolve, 100));

    const endMeasure = os.cpus().map((cpu) => cpu.times);

    const idleDifferences = endMeasure.map((end, i) => {
      const start = startMeasure[i];
      const idle = end.idle - start.idle;
      const total =
        end.user - start.user + (end.nice - start.nice) + (end.sys - start.sys) + (end.irq - start.irq) + idle;
      return 1 - idle / total;
    });

    // Return average CPU usage across all cores
    return (idleDifferences.reduce((sum, idle) => sum + idle, 0) / idleDifferences.length) * 100;
  }

  async getMemoryUsage(): Promise<MemoryInfo> {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;

    return {
      total,
      free,
      used,
    };
  }

  async getDiskSpace(): Promise<DiskInfo> {
    if (process.platform === "win32") {
      // Windows implementation
      const { stdout } = await execAsync("wmic logicaldisk get size,freespace");
      const lines = stdout.trim().split("\n").slice(1);
      let total = 0;
      let free = 0;

      lines.forEach((line) => {
        const [freeSpace, size] = line.trim().split(/\s+/).map(Number);
        if (!isNaN(freeSpace) && !isNaN(size)) {
          free += freeSpace;
          total += size;
        }
      });

      return {
        total,
        free,
        used: total - free,
      };
    } else {
      // Unix-like systems implementation
      const { stdout } = await execAsync("df -k /");
      const [, line] = stdout.trim().split("\n");
      const [, total, , used, free] = line.split(/\s+/);

      return {
        total: parseInt(total) * 1024,
        free: parseInt(free) * 1024,
        used: parseInt(used) * 1024,
      };
    }
  }

  /**
   * Cache image to local file system
   * @param imageData Image data, can be URL or Base64 encoded
   * @returns Returns imgcache:// protocol image URL or original URL (on download failure)
   */
  async cacheImage(imageData: string): Promise<string> {
    // Return directly if already using imgcache protocol
    if (imageData.startsWith("imgcache://")) {
      return imageData;
    }

    // Create cache directory
    const cacheDir = path.join(app.getPath("userData"), "images");
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    // Generate unique filename
    const timestamp = Date.now();
    const uniqueId = nanoid(8);
    const fileName = `img_${timestamp}_${uniqueId}`;

    // Determine image type
    if (imageData.startsWith("http://") || imageData.startsWith("https://")) {
      // Handle URL image
      return this.cacheImageFromUrl(imageData, cacheDir, fileName);
    } else if (imageData.startsWith("data:image/")) {
      // Handle Base64 image
      return this.cacheImageFromBase64(imageData, cacheDir, fileName);
    } else {
      log.warn("Unsupported image format");
      return imageData; // Return original data
    }
  }

  /**
   * Download and cache image from URL
   * @param url Image URL
   * @param cacheDir Cache directory
   * @param fileName Filename (without extension)
   * @returns Returns imgcache protocol URL or original URL (on download failure)
   */
  private async cacheImageFromUrl(url: string, cacheDir: string, fileName: string): Promise<string> {
    try {
      // Download image using axios
      const response = await axios({
        method: "get",
        url: url,
        responseType: "arraybuffer",
        timeout: 10000, // 10s timeout
      });

      // Handle string or string[] content-type headers consistently.
      const extension = getImageExtensionFromMimeType(response.headers["content-type"]);

      const saveFileName = `${fileName}.${extension}`;
      const fullPath = path.join(cacheDir, saveFileName);

      // Write downloaded data to file
      await fs.promises.writeFile(fullPath, Buffer.from(response.data));

      // Return imgcache protocol URL
      return `imgcache://${saveFileName}`;
    } catch (error) {
      log.error("Failed to download image:", error);
      // Return original URL on download failure
      return url;
    }
  }

  /**
   * Cache image from Base64 data
   * @param base64Data Base64-encoded image data
   * @param cacheDir Cache directory
   * @param fileName Filename (without extension)
   * @returns Returns imgcache protocol URL or original data (on processing failure)
   */
  private async cacheImageFromBase64(base64Data: string, cacheDir: string, fileName: string): Promise<string> {
    try {
      // Parse MIME type and actual Base64 data
      const matches = base64Data.match(/^data:([^;]+);base64,(.*)$/);
      if (!matches || matches.length !== 3) {
        log.warn("Invalid Base64 image data");
        return base64Data;
      }

      const mimeType = matches[1];
      const base64Content = matches[2];

      // Determine file extension from MIME type
      const extension = getImageExtensionFromMimeType(mimeType);

      const saveFileName = `${fileName}.${extension}`;
      const fullPath = path.join(cacheDir, saveFileName);

      // Convert Base64 data to Buffer and save as image file
      const imageBuffer = Buffer.from(base64Content, "base64");
      await fs.promises.writeFile(fullPath, imageBuffer);

      // Return imgcache protocol URL
      return `imgcache://${saveFileName}`;
    } catch (error) {
      log.error("Failed to save Base64 image:", error);
      return base64Data; // Return original data on error
    }
  }

  async resetData(): Promise<void> {
    return new Promise((resolve, reject) => {
      const response = dialog.showMessageBoxSync({
        type: "warning",
        buttons: ["OK", "Cancel"],
        defaultId: 0,
        message: "Clear all local data",
        detail: "This will permanently delete local records. Are you sure?",
      });
      if (response === 0) {
        try {
          const dbPath = path.join(app.getPath("userData"), "app_db");
          const removeDirectory = (dirPath: string): void => {
            if (fs.existsSync(dirPath)) {
              fs.readdirSync(dirPath).forEach((file) => {
                const currentPath = path.join(dirPath, file);
                if (fs.lstatSync(currentPath).isDirectory()) {
                  removeDirectory(currentPath);
                } else {
                  fs.unlinkSync(currentPath);
                }
              });
              fs.rmdirSync(dirPath);
            }
          };
          removeDirectory(dbPath);

          app.relaunch();
          app.exit();
          resolve();
        } catch (err) {
          log.error("softReset failed");
          reject(err);
          return;
        }
      }
    });
  }

  /**
   * Reset data by type
   * @param resetType Reset type: 'chat' | 'knowledge' | 'config' | 'all'
   */
  async resetDataByType(resetType: "chat" | "knowledge" | "config" | "all"): Promise<void> {
    try {
      const userDataPath = app.getPath("userData");

      const removeDirectory = (dirPath: string): void => {
        if (fs.existsSync(dirPath)) {
          fs.readdirSync(dirPath).forEach((file) => {
            const currentPath = path.join(dirPath, file);
            if (fs.lstatSync(currentPath).isDirectory()) {
              removeDirectory(currentPath);
            } else {
              fs.unlinkSync(currentPath);
            }
          });
          fs.rmdirSync(dirPath);
        }
      };

      const removeFile = (filePath: string): void => {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      };

      switch (resetType) {
        case "chat": {
          // Delete chat data
          log.info("Resetting chat data...");
          try {
            const presenter = await getPresenter();
            if (presenter.sqlitePresenter) {
              presenter.sqlitePresenter.close();
              log.info("SQLite database connection closed");
            }
            await new Promise((resolve) => setTimeout(resolve, 500));
          } catch (closeError) {
            log.warn("Error closing SQLite connection:", closeError);
          }
          const appDbPath = path.join(userDataPath, "app_db");
          const mainDbFile = path.join(appDbPath, "agent.db");
          try {
            removeFile(mainDbFile);
            log.info("Removed chat database file");
          } catch (error) {
            log.warn("Failed to remove chat database file:", error);
          }
          const auxiliaryFiles = ["agent.db-wal", "agent.db-shm"];
          auxiliaryFiles.forEach((fileName) => {
            const filePath = path.join(appDbPath, fileName);
            if (fs.existsSync(filePath)) {
              try {
                removeFile(filePath);
                log.info("Cleaned up auxiliary file:", fileName);
              } catch (error) {
                log.warn("Failed to clean auxiliary file:", fileName, error);
              }
            }
          });
          break;
        }

        case "knowledge": {
          // Delete knowledge base data. The engine (DuckDB stores) is
          // daemon-owned: reset through the daemon route so stores are closed
          // before their files are removed. See docs/architecture/daemon-knowledge-runtime.
          log.info("Resetting knowledge base data...");
          try {
            await invokeDaemonRoute("mcp.stopServer", { serverName: "builtinKnowledge" });
            await invokeDaemonRoute("knowledge.reset", {});
          } catch (resetError) {
            log.warn("Error resetting daemon knowledge data:", resetError);
            // Fallback for a daemon that predates the knowledge.reset route:
            // attempt a local removal of the (shared) storage directory.
            const knowledgeDbPath = path.join(userDataPath, "app_db", "KnowledgeBase");
            removeDirectory(knowledgeDbPath);
          }
          break;
        }

        case "config": {
          // Delete configuration files
          log.info("Resetting configuration files");
          const configFiles = [
            path.join(userDataPath, "app-settings.json"),
            path.join(userDataPath, "mcp-settings.json"),
            path.join(userDataPath, "model-config.json"),
            path.join(userDataPath, "custom_prompts.json"),
          ];

          configFiles.forEach((filePath) => {
            try {
              removeFile(filePath);
              log.info("Removed config file:", filePath);
            } catch (error) {
              log.warn("Failed to remove config file:", filePath, error);
            }
          });

          try {
            removeDirectory(path.join(userDataPath, "provider_models"));
            log.info("Removed provider_models directory");
          } catch (error) {
            log.warn("Failed to remove provider_models directory:", error);
          }
          break;
        }

        case "all": {
          // Delete entire user data directory
          log.info("Performing complete reset of user data...");
          try {
            const presenter = await getPresenter();
            if (presenter.sqlitePresenter) {
              presenter.sqlitePresenter.close();
              log.info("SQLite database connection closed");
            }
            await invokeDaemonRoute("mcp.stopServer", { serverName: "builtinKnowledge" }).catch(() => {});
            await new Promise((resolve) => setTimeout(resolve, 1000));
          } catch (closeError) {
            log.warn("Error closing database connections:", closeError);
          }
          log.info("Removing user data directory:", userDataPath);
          removeDirectory(userDataPath);
          break;
        }

        default:
          throw new Error(`Unknown reset type: ${resetType}`);
      }

      this.restartAppWithDelay();
    } catch (error) {
      log.error("resetDataByType failed:", error);
      throw error;
    }
  }

  private restartAppWithDelay(): void {
    try {
      if (is.dev) {
        log.info("Data reset complete in dev mode, sending notification to renderer");
        eventBus.sendToRenderer(NOTIFICATION_EVENTS.DATA_RESET_COMPLETE_DEV, SendTarget.ALL_WINDOWS);
        return;
      }

      setTimeout(() => {
        app.relaunch();
        app.exit();
      }, 1000);
    } catch (error) {
      log.error("Restart failed:", error);
      throw error;
    }
  }

  /**
   * Select directory
   * @returns Returns selected directory path, or null if user cancels
   */
  async selectDirectory(): Promise<{ canceled: boolean; filePaths: string[] }> {
    return dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"],
    });
  }

  /**
   * Select files
   * @param options File selection options
   * @returns Returns selected file paths, or empty array if user cancels
   */
  async selectFiles(options?: {
    filters?: { name: string; extensions: string[] }[];
    multiple?: boolean;
  }): Promise<{ canceled: boolean; filePaths: string[] }> {
    const properties: ("openFile" | "multiSelections")[] = ["openFile"];
    if (options?.multiple) {
      properties.push("multiSelections");
    }
    return dialog.showOpenDialog({
      properties,
      filters: options?.filters,
    });
  }

  /**
   * Restart the application
   */
  restartApp(): Promise<void> {
    log.info("restartApp");
    app.relaunch();
    app.exit();
    return Promise.resolve();
  }

  /**
   * Safely sanitize SVG content
   * @param svgContent Raw SVG content
   * @returns Sanitized SVG content, or null if sanitization fails
   */
  async sanitizeSvgContent(svgContent: string): Promise<string | null> {
    try {
      log.info("Sanitizing SVG content, length:", svgContent.length);
      // Debug: Show first 100 characters of SVG
      log.info("SVG preview:", svgContent.substring(0, 100) + "...");

      // Process content with SVG sanitizer
      const sanitizedContent = svgSanitizer.sanitize(svgContent);

      if (sanitizedContent) {
        log.info("SVG content sanitized successfully, output length:", sanitizedContent.length);
        log.info("Comments preserved:", /<!--/.test(sanitizedContent));
        return sanitizedContent;
      } else {
        log.warn("SVG content was rejected by sanitizer");
        // Debug: Check which specific step failed
        log.info("Debug: SVG starts with <svg:", svgContent.trim().startsWith("<svg"));
        log.info("Debug: SVG contains dangerous content:", svgContent.includes("<script"));
        return null;
      }
    } catch (error) {
      log.error("Error sanitizing SVG content:", error);
      return null;
    }
  }
}
