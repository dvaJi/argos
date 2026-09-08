import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { archiveFor, pinFor } from "./catalog";
import type { ToolchainArchive, ToolchainName } from "./types";

/**
 * Managed install pipeline: fetch -> verify sha256 -> extract to staging ->
 * atomic rename to tools/<tool>/<pin>. The previous tree is rotated to
 * `.prev` (never deleted while it may still be running — Windows locks it
 * with EBUSY/EPERM). A failed or cancelled install leaves the previous tree
 * active. Cancel is a cooperative flag checked between phases.
 */

export class ToolchainInstallError extends Error {
  readonly code: string;
  constructor(message: string, code = "install_failed") {
    super(message);
    this.name = "ToolchainInstallError";
    this.code = code;
  }
}

export interface InstallContext {
  dataDir: string;
  fetchImpl: typeof fetch;
  /** Cooperative cancel flag, checked between phases. */
  cancelled: () => boolean;
  /** Injectable extractor (defaults to `tar -xf`). */
  extract?: (archivePath: string, destinationDir: string) => Promise<void>;
  /** Injectable archive (tests); defaults to the catalog pin. */
  archive?: ToolchainArchive;
}

function ensureCancel(ctx: InstallContext, phase: string): void {
  if (ctx.cancelled()) {
    throw new ToolchainInstallError(`Install cancelled during ${phase}`, "cancelled");
  }
}

function classifyFsError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException)?.code ?? "";
  if (code === "EPERM" || code === "EBUSY") {
    return "disk";
  }
  return "install_failed";
}

async function defaultExtract(archivePath: string, destinationDir: string): Promise<void> {
  const proc = Bun.spawn(["tar", "-xf", archivePath, "-C", destinationDir], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    const stderr = await new Response(proc.stderr).text();
    throw new ToolchainInstallError(`Archive extraction failed (tar exit ${exitCode}): ${stderr.slice(0, 400)}`);
  }
}

/** Extract, then collapse a single top-level directory into `destinationDir`. */
async function extractAndFlatten(
  archivePath: string,
  destinationDir: string,
  extract: (archivePath: string, destinationDir: string) => Promise<void>,
): Promise<void> {
  const staging = `${destinationDir}.staging-${Date.now()}`;
  mkdirSync(staging, { recursive: true });
  try {
    await extract(archivePath, staging);
    const topLevel = readdirSync(staging).filter((entry) => !entry.startsWith("."));
    if (topLevel.length === 1 && statSync(path.join(staging, topLevel[0]!)).isDirectory()) {
      // node-v24.18.0-win-x64/... or uv-x86_64-pc-windows-msvc/...
      renameSync(path.join(staging, topLevel[0]!), destinationDir);
    } else {
      renameSync(staging, destinationDir);
    }
  } finally {
    // Remove the staging dir when the tree moved out of it; keep it (with its
    // partial contents) when extraction failed so the archive can be inspected.
    try {
      if (readdirSync(staging).length === 0) {
        rmSync(staging, { recursive: true, force: true });
      }
    } catch {
      // best-effort
    }
  }
}

export async function installToolchain(tool: "node" | "uv", ctx: InstallContext): Promise<void> {
  const archive = ctx.archive ?? archiveFor(tool);
  if (!archive) {
    throw new ToolchainInstallError(`No managed archive is catalogued for ${tool} on this platform`, "no_archive");
  }
  const pin = pinFor(tool);
  const baseDir = path.join(ctx.dataDir, "toolchains");
  const toolsDir = path.join(baseDir, "tools", tool);
  const versionDir = path.join(toolsDir, pin);
  const downloadsDir = path.join(baseDir, "downloads");

  mkdirSync(downloadsDir, { recursive: true });
  mkdirSync(toolsDir, { recursive: true });
  ensureCancel(ctx, "download");

  // Download + verify.
  const archivePath = path.join(downloadsDir, archive.filename);
  let response: Response;
  try {
    response = await ctx.fetchImpl(archive.url);
  } catch (error) {
    throw new ToolchainInstallError(
      `Download failed: ${error instanceof Error ? error.message : String(error)}`,
      "network",
    );
  }
  if (!response.ok) {
    throw new ToolchainInstallError(`Download failed: HTTP ${response.status} for ${archive.url}`, "network");
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  ensureCancel(ctx, "download");
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== archive.sha256) {
    throw new ToolchainInstallError(
      `Checksum mismatch for ${archive.filename}: expected ${archive.sha256}, got ${digest}`,
      "checksum_mismatch",
    );
  }
  await Bun.write(archivePath, bytes);
  ensureCancel(ctx, "extract");

  // Stage the new tree outside the active path.
  const stagingTarget = `${versionDir}.incoming`;
  if (existsSync(stagingTarget)) {
    renameSync(stagingTarget, `${stagingTarget}.old-${Date.now()}`);
  }
  try {
    await extractAndFlatten(archivePath, stagingTarget, ctx.extract ?? defaultExtract);
    ensureCancel(ctx, "activating");
  } catch (error) {
    if (error instanceof ToolchainInstallError && error.code === "cancelled") {
      throw error;
    }
    throw new ToolchainInstallError(
      error instanceof Error ? error.message : String(error),
      error instanceof ToolchainInstallError ? error.code : classifyFsError(error),
    );
  }

  // Activate atomically: rotate the previous tree, then rename staging in.
  if (existsSync(versionDir)) {
    const prevPath = `${versionDir}.prev`;
    if (existsSync(prevPath)) {
      try {
        rmSync(prevPath, { recursive: true, force: true });
      } catch {
        // Windows keeps the old tree busy; archive it instead of deleting.
        try {
          renameSync(prevPath, `${prevPath}-${Date.now()}`);
        } catch {
          // Leave it; the rename below will fail with a clear error if truly locked.
        }
      }
    }
    renameSync(versionDir, prevPath);
  }
  try {
    renameSync(stagingTarget, versionDir);
  } catch (error) {
    // Roll the previous tree back so the active install is never missing.
    const prevPath = `${versionDir}.prev`;
    if (existsSync(prevPath)) {
      renameSync(prevPath, versionDir);
    }
    throw new ToolchainInstallError(
      `Activation failed: ${error instanceof Error ? error.message : String(error)}`,
      classifyFsError(error),
    );
  }
  // Archive the partial download no longer needed.
  try {
    rmSync(archivePath, { force: true });
  } catch {
    // best-effort
  }
}

export { pinFor };
