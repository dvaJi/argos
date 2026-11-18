import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ElectronApplication, Page } from "@playwright/test";

/**
 * Screen recorder for the demo (Windows, ffmpeg `gdigrab`).
 *
 * Playwright's own `recordVideo` leaves Electron windows blank, so instead we
 * pin every demo window to the same on-screen rectangle (always on top) and
 * record that rectangle of the desktop. One continuous file, no stitching.
 */

export type Stage = {
  /** Window content bounds in DIPs. */
  dip: { x: number; y: number; width: number; height: number };
  /** Same rectangle in physical screen pixels (what gdigrab captures). */
  px: { x: number; y: number; width: number; height: number };
};

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Pick a stage rectangle on the primary display, clamped to its work area. */
export async function computeStage(
  electronApp: ElectronApplication,
  desired: { width: number; height: number },
): Promise<Stage> {
  return electronApp.evaluate(({ screen }, desired) => {
    const display = screen.getPrimaryDisplay();
    const area = display.workArea;
    const ratio = desired.width / desired.height;
    let width = Math.min(desired.width, area.width - 40);
    let height = Math.round(width / ratio);
    if (height > area.height - 40) {
      height = area.height - 40;
      width = Math.round(height * ratio);
    }
    const dip = {
      x: area.x + Math.round((area.width - width) / 2),
      y: area.y + Math.round((area.height - height) / 2),
      width,
      height,
    };
    const px =
      process.platform === "win32"
        ? screen.dipToScreenRect(null, dip)
        : {
            x: dip.x * display.scaleFactor,
            y: dip.y * display.scaleFactor,
            width: dip.width * display.scaleFactor,
            height: dip.height * display.scaleFactor,
          };
    return { dip, px };
  }, desired);
}

/** Move the window showing `page` onto the stage and keep it above everything. */
export async function pinToStage(electronApp: ElectronApplication, page: Page, stage: Stage): Promise<void> {
  const marker = `__demo_${Math.random().toString(36).slice(2)}`;
  await page.evaluate((m) => ((window as unknown as Record<string, string>).__demoMarker = m), marker);
  await electronApp.evaluate(
    async ({ BrowserWindow }, { marker, dip }) => {
      for (const win of BrowserWindow.getAllWindows()) {
        const hit = await win.webContents.executeJavaScript("window.__demoMarker", false).catch(() => undefined);
        if (hit !== marker) continue;
        if (win.isMaximized()) win.unmaximize();
        if (win.isFullScreen()) win.setFullScreen(false);
        win.setContentBounds(dip, false);
        win.setAlwaysOnTop(true, "screen-saver");
        win.show();
        win.focus();
        return;
      }
    },
    { marker, dip: stage.dip },
  );
  await page.waitForTimeout(600);
}

export class ScreenRecorder {
  private proc: ChildProcess | undefined;
  private startedAt = 0;

  constructor(
    private readonly file: string,
    private readonly stage: Stage,
  ) {}

  /** Seconds since the first captured frame (approximately). */
  now(): number {
    return (Date.now() - this.startedAt) / 1000;
  }

  async start(): Promise<void> {
    if (process.platform !== "win32") {
      throw new Error("The demo recorder uses ffmpeg gdigrab and only runs on Windows.");
    }
    mkdirSync(dirname(this.file), { recursive: true });
    const { x, y, width, height } = this.stage.px;
    const proc = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "gdigrab",
        "-framerate",
        "30",
        "-draw_mouse",
        "0",
        "-offset_x",
        String(Math.round(x)),
        "-offset_y",
        String(Math.round(y)),
        "-video_size",
        `${even(width)}x${even(height)}`,
        "-i",
        "desktop",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-crf",
        "10",
        "-pix_fmt",
        "yuv420p",
        this.file,
      ],
      { stdio: ["pipe", "ignore", "pipe"] },
    );
    let stderr = "";
    proc.stderr?.on("data", (chunk) => (stderr += String(chunk)));
    this.proc = proc;

    // Give gdigrab a moment to grab its first frame; fail fast on bad args.
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, 1200);
      proc.once("exit", (code) => {
        clearTimeout(timer);
        reject(new Error(`ffmpeg exited early (${code}): ${stderr.trim()}`));
      });
      proc.once("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    this.startedAt = Date.now() - 1000;
  }

  async stop(): Promise<void> {
    const proc = this.proc;
    if (!proc || proc.exitCode !== null) return;
    this.proc = undefined;
    const exited = new Promise<void>((resolve) => proc.once("exit", () => resolve()));
    proc.stdin?.write("q");
    proc.stdin?.end();
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 10_000));
    await Promise.race([exited, timeout]);
    if (proc.exitCode === null) proc.kill();
  }
}
