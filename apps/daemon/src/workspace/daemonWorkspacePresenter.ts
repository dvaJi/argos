import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { watch, type FSWatcher } from "chokidar";
import type { IEventPublisher } from "@argos/backend-core";
import { workspaceInvalidatedEvent } from "@argos/shared-contracts/events";
import type {
  ResolveMarkdownLinkedFileInput,
  WorkspaceFileMetadata,
  WorkspaceFileNode,
  WorkspaceFilePreview,
  WorkspaceFilePreviewKind,
  WorkspaceGitChangeType,
  WorkspaceGitDiff,
  WorkspaceGitFileChange,
  WorkspaceGitState,
  WorkspaceInvalidationEvent,
  WorkspaceInvalidationKind,
  WorkspaceInvalidationSource,
  WorkspaceLinkedFileResolution,
} from "@argos/shared/presenter";

const execFileAsync = promisify(execFile);

const execGit = async (workspacePath: string, args: string[]): Promise<string | null> => {
  try {
    const result = await execFileAsync("git", args, {
      cwd: workspacePath,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    });
    return result.stdout.trimEnd();
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
};

const WATCH_IGNORED_DIRS = [
  "node_modules",
  "dist",
  "build",
  "__pycache__",
  ".venv",
  "venv",
  ".idea",
  ".vscode",
  ".cache",
  "coverage",
  ".next",
  ".nuxt",
  "out",
  ".turbo",
] as const;

const WATCH_DEBOUNCE_MS = 120;
const WATCH_STABILITY_THRESHOLD_MS = 250;
const WATCH_POLL_INTERVAL_MS = 100;
const READ_TEXT_MAX_BYTES = 2 * 1024 * 1024;
const BINARY_SNIFF_BYTES = 8192;
const SEARCH_MAX_RESULTS = 200;
/** Cap untracked files synthesized into the full-workspace diff (perf guard). */
const UNTRACKED_FULL_DIFF_MAX_FILES = 100;

const MIME_BY_EXTENSION: Record<string, string> = {
  md: "text/markdown",
  markdown: "text/markdown",
  mdx: "text/markdown",
  html: "text/html",
  htm: "text/html",
  pdf: "application/pdf",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  ico: "image/x-icon",
  bmp: "image/bmp",
  json: "application/json",
  ts: "application/typescript",
  tsx: "application/typescript",
  js: "application/javascript",
  jsx: "application/javascript",
  css: "text/css",
  xml: "application/xml",
  yaml: "application/yaml",
  yml: "application/yaml",
  py: "text/x-python",
  rb: "text/x-ruby",
  rs: "text/x-rust",
  go: "text/x-go",
  sh: "application/x-sh",
  txt: "text/plain",
};

const getInvalidationPriority = (kind: WorkspaceInvalidationKind): number => {
  switch (kind) {
    case "full":
      return 3;
    case "fs":
      return 2;
    case "git":
      return 1;
    default:
      return 0;
  }
};

type WorkspaceWatchRuntime = {
  workspacePath: string;
  refCount: number;
  contentWatcher: FSWatcher;
  gitWatcher: FSWatcher | null;
  gitWatchKey: string | null;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  pendingKind: WorkspaceInvalidationKind | null;
  pendingSource: WorkspaceInvalidationSource | null;
  disposed: boolean;
};

/**
 * Daemon-side workspace presenter. A Bun port of the desktop `WorkspacePresenter`:
 * file-tree reads, file preview (HTTP preview URLs instead of an Electron custom
 * protocol), git status/diff, file editing, and chokidar watchers that publish
 * `workspace.invalidated` over the daemon event publisher. `revealFileInFolder`
 * and `openFile` are desktop-only (Electron `shell`) and throw here.
 */
export class DaemonWorkspacePresenter {
  private readonly allowedPaths = new Set<string>();
  private readonly allowedExactPaths = new Set<string>();
  private readonly eventPublisher: IEventPublisher;
  private baseUrl: string;
  private readonly watchRuntimes = new Map<string, WorkspaceWatchRuntime>();

  constructor(eventPublisher: IEventPublisher, baseUrl: string) {
    this.eventPublisher = eventPublisher;
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  /** Update the HTTP origin used to build preview URLs (after the server bound its port). */
  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  // ---- registration / security boundary ----

  async registerWorkspace(workspacePath: string): Promise<void> {
    this.allowedPaths.add(path.resolve(workspacePath));
  }

  async registerWorkdir(workdir: string): Promise<void> {
    await this.registerWorkspace(workdir);
  }

  async unregisterWorkspace(workspacePath: string): Promise<void> {
    this.allowedPaths.delete(path.resolve(workspacePath));
  }

  async unregisterWorkdir(workdir: string): Promise<void> {
    await this.unregisterWorkspace(workdir);
  }

  /** Public for the HTTP preview endpoint. Authorizes reads/previews only. */
  isPathAllowed(targetPath: string): boolean {
    return (
      this.isPathWithinRegisteredWorkspace(targetPath) ||
      this.allowedExactPaths.has(this.normalizePathForAccess(targetPath))
    );
  }

  /**
   * Stricter check for mutations (write/delete/rename/create): the target must
   * live inside a *registered workspace*. Exact-file authorization (granted to
   * external files resolved from chat links, for read/preview only) intentionally
   * does NOT grant mutation access — otherwise a resolved external file could be
   * overwritten/deleted.
   */
  private isPathWithinRegisteredWorkspace(targetPath: string): boolean {
    const normalizedTarget = this.normalizePathForAccess(targetPath);
    const targetWithSep = normalizedTarget.endsWith(path.sep) ? normalizedTarget : `${normalizedTarget}${path.sep}`;
    for (const workspace of this.allowedPaths) {
      const normalizedWorkspace = this.normalizePathForAccess(workspace);
      const workspaceWithSep = normalizedWorkspace.endsWith(path.sep)
        ? normalizedWorkspace
        : `${normalizedWorkspace}${path.sep}`;
      if (normalizedTarget === normalizedWorkspace || targetWithSep.startsWith(workspaceWithSep)) {
        return true;
      }
    }
    return false;
  }

  private authorizeExactFile(filePath: string): string {
    const normalized = this.normalizePathForAccess(filePath);
    this.allowedExactPaths.add(normalized);
    return normalized;
  }

  private normalizePathForAccess(targetPath: string): string {
    try {
      return path.normalize(fs.realpathSync(targetPath));
    } catch {
      return path.normalize(path.resolve(targetPath));
    }
  }

  private getWorkspaceRootForPath(targetPath: string): string | null {
    const normalizedTarget = this.normalizePathForAccess(targetPath);
    for (const workspace of this.allowedPaths) {
      const normalizedWorkspace = this.normalizePathForAccess(workspace);
      const relativePath = path.relative(normalizedWorkspace, normalizedTarget);
      if (
        normalizedTarget === normalizedWorkspace ||
        (relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath))
      ) {
        return normalizedWorkspace;
      }
    }
    return null;
  }

  private toRelativeWorkspacePath(workspaceRoot: string, targetPath: string): string {
    const relativePath = path.relative(workspaceRoot, path.resolve(targetPath));
    return relativePath.split(path.sep).join("/");
  }

  destroy(): void {
    const runtimes = Array.from(this.watchRuntimes.values());
    this.watchRuntimes.clear();
    for (const runtime of runtimes) void this.disposeRuntime(runtime);
  }

  // ---- watchers ----

  async watchWorkspace(workspacePath: string): Promise<void> {
    const normalized = path.resolve(workspacePath);
    if (!this.isPathAllowed(normalized)) return;

    const existing = this.watchRuntimes.get(normalized);
    if (existing) {
      existing.refCount += 1;
      return;
    }

    const runtime: WorkspaceWatchRuntime = {
      workspacePath: normalized,
      refCount: 1,
      contentWatcher: this.createContentWatcher(normalized),
      gitWatcher: null,
      gitWatchKey: null,
      debounceTimer: null,
      pendingKind: null,
      pendingSource: null,
      disposed: false,
    };
    this.watchRuntimes.set(normalized, runtime);
    await this.refreshGitWatcher(runtime);
  }

  async unwatchWorkspace(workspacePath: string): Promise<void> {
    const normalized = path.resolve(workspacePath);
    const runtime = this.watchRuntimes.get(normalized);
    if (!runtime) return;
    runtime.refCount -= 1;
    if (runtime.refCount > 0) return;
    this.watchRuntimes.delete(normalized);
    await this.disposeRuntime(runtime);
  }

  private createContentWatcher(workspacePath: string): FSWatcher {
    const watcher = watch(workspacePath, {
      ignoreInitial: true,
      atomic: true,
      followSymlinks: false,
      ignored: (watchPath: string) => this.shouldIgnoreContentWatchPath(watchPath),
      awaitWriteFinish: {
        stabilityThreshold: WATCH_STABILITY_THRESHOLD_MS,
        pollInterval: WATCH_POLL_INTERVAL_MS,
      },
    });

    watcher.on("all", (_eventName, targetPath: string) => {
      const runtime = this.watchRuntimes.get(workspacePath);
      if (!runtime || runtime.disposed) return;
      if (path.basename(path.normalize(targetPath)) === ".git") {
        void this.refreshGitWatcher(runtime);
        this.scheduleInvalidation(runtime, "full", "watcher");
        return;
      }
      this.scheduleInvalidation(runtime, "fs", "watcher");
    });

    watcher.on("error", (error: unknown) => {
      console.error(`[DaemonWorkspace] Content watcher error for ${workspacePath}:`, error);
    });

    return watcher;
  }

  private shouldIgnoreContentWatchPath(watchPath: string): boolean {
    const normalizedPath = path.normalize(watchPath);
    if (normalizedPath.includes(`${path.sep}.git${path.sep}`)) return true;
    const baseName = path.basename(normalizedPath);
    if (WATCH_IGNORED_DIRS.includes(baseName as (typeof WATCH_IGNORED_DIRS)[number])) return true;
    return WATCH_IGNORED_DIRS.some((segment) => normalizedPath.includes(`${path.sep}${segment}${path.sep}`));
  }

  private scheduleInvalidation(
    runtime: WorkspaceWatchRuntime,
    kind: WorkspaceInvalidationKind,
    source: WorkspaceInvalidationSource,
  ): void {
    if (runtime.disposed) return;
    if (!runtime.pendingKind || getInvalidationPriority(kind) >= getInvalidationPriority(runtime.pendingKind)) {
      runtime.pendingKind = kind;
      runtime.pendingSource = source;
    }
    if (runtime.debounceTimer) clearTimeout(runtime.debounceTimer);
    runtime.debounceTimer = setTimeout(() => {
      runtime.debounceTimer = null;
      const current = this.watchRuntimes.get(runtime.workspacePath);
      if (!current || current !== runtime || runtime.disposed) return;
      const payload: WorkspaceInvalidationEvent = {
        workspacePath: runtime.workspacePath,
        kind: runtime.pendingKind ?? kind,
        source: runtime.pendingSource ?? source,
      };
      runtime.pendingKind = null;
      runtime.pendingSource = null;
      this.eventPublisher.publish(workspaceInvalidatedEvent.name, { ...payload, version: Date.now() });
    }, WATCH_DEBOUNCE_MS);
  }

  private async refreshGitWatcher(runtime: WorkspaceWatchRuntime): Promise<void> {
    const metadata = await this.resolveGitWatchMetadata(runtime.workspacePath);
    if (runtime.disposed || this.watchRuntimes.get(runtime.workspacePath) !== runtime) return;
    const nextWatchKey = metadata ? metadata.paths.join("\0") : null;
    if (runtime.gitWatchKey === nextWatchKey) return;
    const previous = runtime.gitWatcher;
    runtime.gitWatcher = null;
    runtime.gitWatchKey = nextWatchKey;
    if (previous) await previous.close();
    if (!metadata) return;
    const gitWatcher = watch(metadata.paths, {
      ignoreInitial: true,
      atomic: true,
      followSymlinks: false,
      awaitWriteFinish: { stabilityThreshold: WATCH_STABILITY_THRESHOLD_MS, pollInterval: WATCH_POLL_INTERVAL_MS },
    });
    gitWatcher.on("all", () => {
      const current = this.watchRuntimes.get(runtime.workspacePath);
      if (!current || current !== runtime || runtime.disposed) return;
      this.scheduleInvalidation(runtime, "git", "watcher");
    });
    gitWatcher.on("error", (error: unknown) => {
      console.error(`[DaemonWorkspace] Git watcher error for ${runtime.workspacePath}:`, error);
    });
    if (runtime.disposed || this.watchRuntimes.get(runtime.workspacePath) !== runtime) {
      await gitWatcher.close();
      return;
    }
    runtime.gitWatcher = gitWatcher;
  }

  private async resolveGitWatchMetadata(workspacePath: string): Promise<{ repoRoot: string; paths: string[] } | null> {
    const repoRoot = await this.resolveGitWorkspace(workspacePath);
    if (!repoRoot) return null;
    const [headPath, indexPath, packedRefsPath, refsPath] = await Promise.all([
      this.resolveGitPath(workspacePath, "HEAD"),
      this.resolveGitPath(workspacePath, "index"),
      this.resolveGitPath(workspacePath, "packed-refs"),
      this.resolveGitPath(workspacePath, "refs"),
    ]);
    const paths = Array.from(
      new Set(
        [headPath, indexPath, packedRefsPath, refsPath].filter((value): value is string => typeof value === "string"),
      ),
    );
    if (paths.length === 0) return null;
    return { repoRoot, paths };
  }

  private async resolveGitPath(workspacePath: string, key: string): Promise<string | null> {
    try {
      const value = await execGit(workspacePath, ["rev-parse", "--git-path", key]);
      const resolved = value?.split(/\r?\n/)[0]?.trim();
      if (!resolved) return null;
      return path.isAbsolute(resolved)
        ? path.normalize(resolved)
        : path.normalize(path.resolve(workspacePath, resolved));
    } catch {
      return null;
    }
  }

  private async disposeRuntime(runtime: WorkspaceWatchRuntime): Promise<void> {
    runtime.disposed = true;
    if (runtime.debounceTimer) {
      clearTimeout(runtime.debounceTimer);
      runtime.debounceTimer = null;
    }
    const closures: Array<Promise<void>> = [runtime.contentWatcher.close()];
    if (runtime.gitWatcher) {
      closures.push(runtime.gitWatcher.close());
      runtime.gitWatcher = null;
    }
    await Promise.allSettled(closures);
  }

  // ---- directory reads ----

  async readDirectory(dirPath: string): Promise<WorkspaceFileNode[]> {
    if (!this.isPathAllowed(dirPath)) return [];
    return readDirectoryShallow(dirPath);
  }

  async expandDirectory(dirPath: string): Promise<WorkspaceFileNode[]> {
    if (!this.isPathAllowed(dirPath)) return [];
    return readDirectoryShallow(dirPath);
  }

  // ---- file preview ----

  async readFilePreview(filePath: string): Promise<WorkspaceFilePreview | null> {
    if (!this.isPathAllowed(filePath)) return null;
    let stats: fs.Stats;
    try {
      stats = fs.statSync(filePath);
      if (!stats.isFile()) return null;
    } catch {
      return null;
    }

    const normalizedPath = this.normalizePathForAccess(filePath);
    const workspaceRoot = this.getWorkspaceRootForPath(normalizedPath);
    const extension = path.extname(normalizedPath).toLowerCase();
    const mimeType = inferMimeType(normalizedPath);

    // Extension decides only the special preview kinds (markdown/html/pdf/svg/image).
    // For everything else (source, config, unknown), sniff the content: a NUL byte
    // in the leading bytes means binary; otherwise treat as text — default to text,
    // detect binary by content rather than an extension allowlist.
    const extensionKind = previewKindFromExtension(extension);
    let kind: WorkspaceFilePreviewKind;
    let content = "";
    let thumbnail: string | undefined;

    if (extensionKind === undefined) {
      const isBinary = await sniffFileBinary(filePath);
      kind = isBinary ? "binary" : "text";
      if (kind === "text") {
        try {
          content = await Bun.file(filePath).text();
        } catch {
          content = "";
        }
      }
    } else {
      kind = extensionKind;
      if (kind === "markdown") {
        try {
          content = await Bun.file(filePath).text();
        } catch {
          content = "";
        }
      } else if (kind === "image") {
        try {
          content = Buffer.from(await Bun.file(filePath).bytes()).toString("base64");
          thumbnail = content;
        } catch {
          content = "";
        }
      }
    }

    const metadata: WorkspaceFileMetadata = {
      fileName: path.basename(normalizedPath),
      fileSize: stats.size,
      fileCreated: stats.birthtime,
      fileModified: stats.mtime,
    };

    return {
      path: normalizedPath,
      relativePath: workspaceRoot ? this.toRelativeWorkspacePath(workspaceRoot, normalizedPath) : normalizedPath,
      name: path.basename(normalizedPath),
      mimeType,
      kind,
      content,
      previewUrl: this.resolvePreviewUrl(normalizedPath, kind, workspaceRoot),
      thumbnail,
      language: inferLanguage(normalizedPath, kind),
      metadata,
    };
  }

  private resolvePreviewUrl(
    normalizedPath: string,
    kind: WorkspaceFilePreviewKind,
    _workspaceRoot: string | null,
  ): string | undefined {
    if (kind !== "html" && kind !== "pdf" && kind !== "svg") return undefined;
    return `${this.baseUrl}/api/v1/workspace/preview?path=${encodeURIComponent(normalizedPath)}`;
  }

  async resolveMarkdownLinkedFile(
    input: ResolveMarkdownLinkedFileInput,
  ): Promise<WorkspaceLinkedFileResolution | null> {
    const resolvedPath = this.resolveMarkdownLinkedPath(input);
    if (!resolvedPath) return null;
    let stat: fs.Stats;
    try {
      stat = fs.statSync(resolvedPath);
    } catch {
      return null;
    }
    if (!stat.isFile()) return null;
    // Authorize the resolved file for subsequent preview/open reads, even when it
    // lives outside a registered workspace (e.g. a chat link to another project).
    const normalizedPath = this.authorizeExactFile(resolvedPath);
    const workspaceRoot = this.getWorkspaceRootForPath(normalizedPath);
    return {
      path: normalizedPath,
      name: path.basename(normalizedPath),
      relativePath: workspaceRoot ? this.toRelativeWorkspacePath(workspaceRoot, normalizedPath) : normalizedPath,
      workspaceRoot,
    };
  }

  private resolveMarkdownLinkedPath(input: ResolveMarkdownLinkedFileInput): string | null {
    const rawHref = stripMarkdownLinkDecorators(input.href);
    if (!rawHref) return null;
    if (rawHref.startsWith("file://")) {
      try {
        return this.normalizePathForAccess(fileURLToPath(rawHref));
      } catch {
        return null;
      }
    }
    if (rawHref.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(rawHref)) {
      return this.normalizePathForAccess(rawHref);
    }
    const sourceFilePath = input.sourceFilePath?.trim() || null;
    const workspacePath = input.workspacePath?.trim() || null;
    const baseDir = sourceFilePath ? path.dirname(sourceFilePath) : workspacePath ? workspacePath : null;
    if (!baseDir) return null;
    return this.normalizePathForAccess(path.resolve(baseDir, rawHref));
  }

  // ---- file editing ----

  async readFileText(filePath: string): Promise<{ content: string | null; exists: boolean }> {
    if (!this.isPathAllowed(filePath)) return { content: null, exists: false };
    let stats: fs.Stats;
    try {
      stats = fs.statSync(filePath);
    } catch {
      return { content: null, exists: false };
    }
    if (!stats.isFile()) return { content: null, exists: true };
    if (stats.size > READ_TEXT_MAX_BYTES) return { content: null, exists: true };
    try {
      const bytes = await Bun.file(filePath).bytes();
      if (looksBinary(bytes)) return { content: null, exists: true };
      return { content: Buffer.from(bytes).toString("utf8"), exists: true };
    } catch (error) {
      console.error(`[DaemonWorkspace] Failed to read file text: ${filePath}`, error);
      return { content: null, exists: true };
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    if (!this.isPathWithinRegisteredWorkspace(filePath)) {
      throw new Error(`[DaemonWorkspace] Unauthorized write: ${filePath}`);
    }
    const normalizedPath = path.resolve(filePath);
    await fsp.mkdir(path.dirname(normalizedPath), { recursive: true });
    await Bun.write(normalizedPath, content);
  }

  async createEntry(parentDir: string, name: string, isDirectory: boolean): Promise<string> {
    if (!isSafeEntryName(name)) throw new Error(`[DaemonWorkspace] Invalid entry name: ${name}`);
    if (!this.isPathWithinRegisteredWorkspace(parentDir)) {
      throw new Error(`[DaemonWorkspace] Unauthorized parent: ${parentDir}`);
    }
    const targetPath = path.join(path.resolve(parentDir), name);
    if (!this.isPathWithinRegisteredWorkspace(targetPath)) {
      throw new Error(`[DaemonWorkspace] Unauthorized entry path: ${targetPath}`);
    }
    if (isDirectory) await fsp.mkdir(targetPath, { recursive: false });
    else await Bun.write(targetPath, "");
    return targetPath;
  }

  async deletePath(targetPath: string): Promise<void> {
    if (!this.isPathWithinRegisteredWorkspace(targetPath)) {
      throw new Error(`[DaemonWorkspace] Unauthorized path: ${targetPath}`);
    }
    await fsp.rm(path.resolve(targetPath), { recursive: true, force: false });
  }

  async renameOrMovePath(fromPath: string, toPath: string): Promise<string> {
    if (!this.isPathWithinRegisteredWorkspace(fromPath)) {
      throw new Error(`[DaemonWorkspace] Unauthorized source: ${fromPath}`);
    }
    if (!this.isPathWithinRegisteredWorkspace(toPath)) {
      throw new Error(`[DaemonWorkspace] Unauthorized target: ${toPath}`);
    }
    const resolvedTo = path.resolve(toPath);
    await fsp.mkdir(path.dirname(resolvedTo), { recursive: true });
    await fsp.rename(path.resolve(fromPath), resolvedTo);
    return resolvedTo;
  }

  // ---- git ----

  async getGitStatus(workspacePath: string): Promise<WorkspaceGitState | null> {
    if (!this.isPathAllowed(workspacePath)) return null;
    const repoRoot = await this.resolveGitWorkspace(workspacePath);
    if (!repoRoot) return null;
    try {
      const output = await execGit(workspacePath, ["status", "--porcelain=v1", "--branch"]);
      if (output == null) return null;
      const lines = output.split(/\r?\n/).filter(Boolean);
      const branchLine = lines.find((line) => line.startsWith("##"));
      const branchSummary = parseBranchSummary(branchLine ?? "");
      const changes: WorkspaceGitFileChange[] = lines
        .filter((line) => !line.startsWith("##"))
        .map((line) => {
          const stagedStatus = line[0] && line[0] !== " " ? line[0] : null;
          const unstagedStatus = line[1] && line[1] !== " " ? line[1] : null;
          const rawPath = line.slice(3);
          const [previousPathPart, currentPathPart] = rawPath.includes(" -> ")
            ? rawPath.split(" -> ")
            : [null, rawPath];
          const currentRelativePath = normalizeGitPath(currentPathPart ?? rawPath);
          const previousPath = previousPathPart ? normalizeGitPath(previousPathPart) : null;
          return {
            path: path.resolve(repoRoot, currentRelativePath),
            relativePath: currentRelativePath,
            previousPath,
            stagedStatus,
            unstagedStatus,
            type: resolveGitChangeType(stagedStatus, unstagedStatus),
          };
        });
      return {
        workspacePath: repoRoot,
        branch: branchSummary.branch,
        ahead: branchSummary.ahead,
        behind: branchSummary.behind,
        changes,
      };
    } catch (error) {
      console.warn(`[DaemonWorkspace] Failed git status for ${workspacePath}`, error);
      return null;
    }
  }

  async getGitDiff(workspacePath: string, filePath?: string): Promise<WorkspaceGitDiff | null> {
    if (!this.isPathAllowed(workspacePath)) return null;
    if (filePath && !this.isPathAllowed(filePath)) return null;
    const repoRoot = await this.resolveGitWorkspace(workspacePath);
    if (!repoRoot) return null;
    const relativePath = filePath ? this.toRelativeWorkspacePath(repoRoot, filePath) : null;
    const fileArgs = relativePath ? ["--", relativePath] : [];
    try {
      const [staged, unstaged] = await Promise.all([
        execGit(workspacePath, ["diff", "--cached", "--find-renames", ...fileArgs]),
        execGit(workspacePath, ["diff", "--find-renames", ...fileArgs]),
      ]);
      let resolvedUnstaged = unstaged ?? "";
      if (relativePath && !staged && !resolvedUnstaged) {
        const untracked = await execGit(workspacePath, [
          "ls-files",
          "--others",
          "--exclude-standard",
          "--",
          relativePath,
        ]);
        if (untracked && untracked.trim()) {
          resolvedUnstaged = await this.runGitDiffNoIndex(workspacePath, relativePath);
        }
      } else if (!relativePath) {
        // Full-workspace diff: `git diff` omits untracked files, so synthesize
        // "added" diffs for them so new files show up alongside modified/deleted.
        resolvedUnstaged = await this.appendUntrackedDiffs(workspacePath, resolvedUnstaged);
      }
      return {
        workspacePath: repoRoot,
        filePath: filePath ? path.resolve(filePath) : null,
        relativePath,
        staged: staged ?? "",
        unstaged: resolvedUnstaged,
      };
    } catch (error) {
      console.warn(`[DaemonWorkspace] Failed git diff for ${workspacePath}`, error);
      return null;
    }
  }

  private async appendUntrackedDiffs(workspacePath: string, unstagedPatch: string): Promise<string> {
    try {
      const listing = await execGit(workspacePath, ["ls-files", "--others", "--exclude-standard"]);
      const untrackedFiles = (listing ?? "")
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, UNTRACKED_FULL_DIFF_MAX_FILES);
      if (untrackedFiles.length === 0) return unstagedPatch;
      const diffs = await Promise.all(untrackedFiles.map((file) => this.runGitDiffNoIndex(workspacePath, file)));
      const combined = diffs.filter(Boolean).join("\n");
      if (!combined) return unstagedPatch;
      return unstagedPatch ? `${unstagedPatch}\n${combined}` : combined;
    } catch (error) {
      console.warn(`[DaemonWorkspace] Failed to enumerate untracked files for ${workspacePath}`, error);
      return unstagedPatch;
    }
  }

  private async runGitDiffNoIndex(workspacePath: string, relativePath: string): Promise<string> {
    const normalize = (raw: string): string => {
      let output = raw.trimEnd();
      // `git diff --no-index` does not emit a "new file mode" marker (it compares
      // two arbitrary paths, not a repo add). Inject one so diff renderers classify
      // the untracked file as added (and show the new-file icon / all-add coloring).
      if (output.startsWith("diff --git") && !/^[^\n]*\nnew file mode/m.test(output)) {
        output = output.replace(/^(diff --git [^\n]*)/, "$1\nnew file mode 100644");
      }
      return output;
    };
    try {
      const result = await execFileAsync("git", ["diff", "--no-index", "--", "/dev/null", relativePath], {
        cwd: workspacePath,
        windowsHide: true,
        maxBuffer: 8 * 1024 * 1024,
      });
      return normalize(result.stdout);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        (error as { code?: number }).code === 1 &&
        "stdout" in error &&
        typeof (error as { stdout?: unknown }).stdout === "string"
      ) {
        return normalize((error as { stdout: string }).stdout);
      }
      return "";
    }
  }

  private async resolveGitWorkspace(workspacePath: string): Promise<string | null> {
    try {
      const repoRoot = await execGit(workspacePath, ["rev-parse", "--show-toplevel"]);
      return repoRoot?.split(/\r?\n/)[0]?.trim() || null;
    } catch {
      return null;
    }
  }

  // ---- search ----

  async searchFiles(workspacePath: string, query: string): Promise<WorkspaceFileNode[]> {
    if (!this.isPathWithinRegisteredWorkspace(workspacePath) || !query.trim()) return [];
    const results: WorkspaceFileNode[] = [];
    const needle = query.toLowerCase();
    const visited = new Set<string>();
    await this.collectSearchMatches(path.resolve(workspacePath), needle, "", results, SEARCH_MAX_RESULTS, visited);
    return results;
  }

  private async collectSearchMatches(
    dirPath: string,
    needle: string,
    relativePrefix: string,
    results: WorkspaceFileNode[],
    limit: number,
    visited: Set<string>,
  ): Promise<void> {
    if (results.length >= limit) return;
    // Cycle guard: track visited real paths so a symlink loop can't exhaust CPU/IO.
    let resolvedDir: string;
    try {
      resolvedDir = this.normalizePathForAccess(dirPath);
    } catch {
      return;
    }
    const key = `${resolvedDir}\0`;
    if (visited.has(key)) return;
    visited.add(key);

    let names: string[];
    try {
      names = (await fsp.readdir(dirPath)) as string[];
    } catch {
      return;
    }
    for (const name of names) {
      if (results.length >= limit) return;
      if (name.startsWith(".") || WATCH_IGNORED_DIRS.includes(name as (typeof WATCH_IGNORED_DIRS)[number])) {
        continue;
      }
      const childPath = path.join(dirPath, name);
      // Use lstat to detect symlinks: don't follow them (avoids escaping the
      // workspace via a symlinked directory or traversing external/ancestor dirs).
      let lstat: fs.Stats;
      try {
        lstat = await fsp.lstat(childPath);
      } catch {
        continue;
      }
      if (lstat.isSymbolicLink()) continue;
      const isDirectory = lstat.isDirectory();
      const relativePath = relativePrefix ? `${relativePrefix}/${name}` : name;
      if (name.toLowerCase().includes(needle)) {
        results.push({ name, path: childPath, isDirectory });
      }
      if (isDirectory) {
        await this.collectSearchMatches(childPath, needle, relativePath, results, limit, visited);
      }
    }
  }

  // ---- desktop-only (not supported on the daemon) ----

  async revealFileInFolder(): Promise<void> {
    throw new Error("workspace.revealFileInFolder is desktop-only");
  }

  async openFile(): Promise<void> {
    throw new Error("workspace.openFile is desktop-only");
  }
}

// ---- pure helpers (ported from the desktop presenter) ----

const IGNORED_PATTERNS = [
  "node_modules",
  ".git",
  ".DS_Store",
  "dist",
  "build",
  "__pycache__",
  ".venv",
  "venv",
  ".idea",
  ".vscode",
  ".cache",
  "coverage",
  ".next",
  ".nuxt",
  "out",
  ".turbo",
];

async function readDirectoryShallow(dirPath: string): Promise<WorkspaceFileNode[]> {
  try {
    // Plain readdir + stat per entry. Bun's `readdir({ withFileTypes })` /
    // Dirent helpers are less reliable than Node's, so mirror the daemon's
    // existing browseDirectory pattern instead.
    const names = (await fsp.readdir(dirPath)) as string[];
    const nodes: WorkspaceFileNode[] = [];
    for (const name of names) {
      if (IGNORED_PATTERNS.includes(name) || name.startsWith(".")) continue;
      const childPath = path.join(dirPath, name);
      let isDirectory = false;
      try {
        isDirectory = (await fsp.stat(childPath)).isDirectory();
      } catch {
        continue;
      }
      nodes.push({ name, path: childPath, isDirectory });
    }
    return nodes.sort((a, b) =>
      a.isDirectory !== b.isDirectory ? (a.isDirectory ? -1 : 1) : a.name.localeCompare(b.name),
    );
  } catch (error) {
    console.error(`[DaemonWorkspace] Failed to read directory ${dirPath}`, error);
    return [];
  }
}

function inferMimeType(filePath: string): string {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".bmp", ".avif"]);

/**
 * Resolve the special preview kinds purely from extension (bespoke rendering:
 * markdown, html iframe, pdf, svg, image). Returns `undefined` for everything
 * else — text-vs-binary is decided by content sniffing (see sniffFileBinary).
 */
function previewKindFromExtension(extension: string): WorkspaceFilePreviewKind | undefined {
  if (extension === ".md" || extension === ".markdown" || extension === ".mdx") return "markdown";
  if (extension === ".html" || extension === ".htm") return "html";
  if (extension === ".pdf") return "pdf";
  if (extension === ".svg") return "svg";
  if (IMAGE_EXTENSIONS.has(extension)) return "image";
  return undefined;
}

/**
 * Detect a binary file by scanning its leading bytes for a NUL byte. Reads only
 * the first chunk so large binaries stay cheap.
 */
async function sniffFileBinary(filePath: string): Promise<boolean> {
  try {
    const prefix = await Bun.file(filePath).slice(0, BINARY_SNIFF_BYTES).bytes();
    return looksBinary(prefix);
  } catch {
    return true;
  }
}

function inferLanguage(filePath: string, kind: WorkspaceFilePreviewKind): string | null {
  if (kind === "markdown") return "markdown";
  if (kind === "html") return "html";
  if (kind === "svg") return "svg";
  if (kind !== "text") return null;
  return path.extname(filePath).slice(1).toLowerCase() || null;
}

function looksBinary(buffer: Uint8Array): boolean {
  const scanLength = Math.min(buffer.length, BINARY_SNIFF_BYTES);
  for (let index = 0; index < scanLength; index += 1) {
    if (buffer[index] === 0) return true;
  }
  return false;
}

function isSafeEntryName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || trimmed === "." || trimmed === "..") return false;
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes(path.sep) || trimmed.includes("\0"))
    return false;
  return true;
}

function stripMarkdownLinkDecorators(href: string): string {
  const trimmed = href.trim();
  const queryIndex = trimmed.indexOf("?");
  const hashIndex = trimmed.indexOf("#");
  const firstDecoratorIndex = [queryIndex, hashIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  if (firstDecoratorIndex == null) return trimmed;
  return trimmed.slice(0, firstDecoratorIndex);
}

function normalizeGitPath(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function resolveGitChangeType(stagedStatus: string | null, unstagedStatus: string | null): WorkspaceGitChangeType {
  const status = stagedStatus || unstagedStatus || "?";
  switch (status) {
    case "A":
      return "added";
    case "D":
      return "deleted";
    case "R":
      return "renamed";
    case "C":
      return "copied";
    case "?":
      return "untracked";
    case "!":
      return "ignored";
    case "U":
      return "unmerged";
    default:
      return "modified";
  }
}

function parseBranchSummary(summary: string): { branch: string | null; ahead: number; behind: number } {
  const trimmed = summary.replace(/^##\s*/, "").trim();
  if (!trimmed) return { branch: null, ahead: 0, behind: 0 };
  const branchToken = trimmed.split(" ")[0] || "";
  const branchName = branchToken.split("...")[0];
  const aheadMatch = trimmed.match(/ahead (\d+)/);
  const behindMatch = trimmed.match(/behind (\d+)/);
  return {
    branch: branchName === "HEAD" || branchName === "(no" ? null : branchName,
    ahead: aheadMatch ? Number(aheadMatch[1]) : 0,
    behind: behindMatch ? Number(behindMatch[1]) : 0,
  };
}
