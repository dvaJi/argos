/**
 * Derives the turn-level "changed files" summary from the raw ACP tool-call
 * content recorded on completed tool_call blocks.
 *
 * ACP v1 diffs carry `{ type: "diff", path, oldText?, newText }`; ACP v2 diffs
 * carry structured `changes` plus an optional `patch.text` (git_patch). We
 * prefer the v2 patch text for accurate +/- counts and fall back to counting
 * changed lines between oldText/newText (v1) or to `changes` entries with
 * null counts when no text is available.
 */

export interface FileChangeSummary {
  files: Array<{
    path: string;
    additions: number | null;
    deletions: number | null;
  }>;
}

interface DiffContentItem {
  type: "diff";
  path?: unknown;
  oldText?: unknown;
  newText?: unknown;
  changes?: Array<Record<string, unknown>>;
  patch?: { text?: unknown } | null;
}

interface DiffStat {
  additions: number;
  deletions: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const isDiffContentItem = (value: unknown): value is DiffContentItem => isRecord(value) && value.type === "diff";

const firstString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

/** ACP paths may be absolute (v1) or workspace-relative; normalize to relative. */
const toWorkspaceRelativePath = (rawPath: string, workdir: string | undefined): string => {
  if (!workdir) return rawPath;
  const normalizedWorkdir = workdir.replaceAll("\\", "/").replace(/\/+$/, "");
  const normalizedPath = rawPath.replaceAll("\\", "/");
  const prefix = `${normalizedWorkdir}/`;
  if (normalizedPath.startsWith(prefix)) {
    return normalizedPath.slice(prefix.length);
  }
  if (normalizedPath.startsWith("file://")) {
    const filePath = normalizedPath.slice("file://".length);
    if (filePath.startsWith(prefix)) return filePath.slice(prefix.length);
  }
  return normalizedPath;
};

/**
 * Approximate line diff between two texts (additions/deletions only) using
 * LCS; large inputs degrade to a set-based count to avoid O(n*m) blowups.
 */
const countTextDiff = (oldText: string, newText: string): DiffStat => {
  const oldLines = oldText === "" ? [] : oldText.replace(/\r\n/g, "\n").split("\n");
  const newLines = newText === "" ? [] : newText.replace(/\r\n/g, "\n").split("\n");

  if (oldLines.length * newLines.length > 4_000_000) {
    const common = new Set(oldLines);
    return {
      additions: newLines.filter((line) => !common.has(line)).length,
      deletions: oldLines.filter((line) => !common.has(line)).length,
    };
  }

  const rows = oldLines.length + 1;
  const cols = newLines.length + 1;
  const dp: number[] = Array.from({ length: rows * cols }, () => 0);
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      dp[i * cols + j] =
        oldLines[i - 1] === newLines[j - 1]
          ? dp[(i - 1) * cols + (j - 1)] + 1
          : Math.max(dp[(i - 1) * cols + j], dp[i * cols + (j - 1)]);
    }
  }
  const common = dp[rows * cols - 1] ?? 0;
  return { additions: newLines.length - common, deletions: oldLines.length - common };
};

/** Parses a multi-file git patch into per-file +/- counts. */
const countGitPatchPerFile = (patchText: string): Map<string, DiffStat> => {
  const result = new Map<string, DiffStat>();
  let currentPath: string | null = null;
  let current: DiffStat | null = null;

  for (const line of patchText.split("\n")) {
    if (line.startsWith("diff --git ")) {
      if (currentPath && current) {
        result.set(currentPath, current);
      }
      const match = /diff --git a\/(.*?) b\//.exec(line);
      currentPath = match?.[1] ?? null;
      current = currentPath ? { additions: 0, deletions: 0 } : null;
      continue;
    }
    if (!current) continue;
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) current.additions += 1;
    else if (line.startsWith("-")) current.deletions += 1;
  }
  if (currentPath && current) {
    result.set(currentPath, current);
  }
  return result;
};

const mergeFile = (files: Map<string, DiffStat>, path: string, stat: DiffStat | null): void => {
  const existing = files.get(path);
  if (stat) {
    files.set(path, {
      additions: (existing?.additions ?? 0) + stat.additions,
      deletions: (existing?.deletions ?? 0) + stat.deletions,
    });
  } else if (!existing) {
    files.set(path, { additions: 0, deletions: 0 });
  }
};

const summarizeDiffItems = (items: unknown, workdir: string | undefined, files: Map<string, DiffStat>): void => {
  if (!Array.isArray(items)) return;

  for (const item of items) {
    if (!isDiffContentItem(item)) continue;

    // v2: structured changes plus optional git patch text.
    if (Array.isArray(item.changes) && item.changes.length > 0) {
      const patchText = firstString(item.patch?.text);
      const patchStats = patchText ? countGitPatchPerFile(patchText) : null;
      for (const change of item.changes) {
        if (!isRecord(change)) continue;
        const rawPath = firstString(change.path);
        if (!rawPath) continue;
        const relativePath = toWorkspaceRelativePath(rawPath, workdir);
        const stat = patchStats?.get(relativePath) ?? patchStats?.get(rawPath) ?? null;
        mergeFile(files, relativePath, stat);
      }
      continue;
    }

    // v1: path + oldText/newText line counts.
    const rawPath = firstString(item.path);
    if (!rawPath) continue;
    const oldText = typeof item.oldText === "string" ? item.oldText : "";
    const newText = typeof item.newText === "string" ? item.newText : "";
    const relativePath = toWorkspaceRelativePath(rawPath, workdir);
    if (oldText === "" && newText === "") {
      mergeFile(files, relativePath, null);
    } else {
      mergeFile(files, relativePath, countTextDiff(oldText, newText));
    }
  }
};

/**
 * Scans finalized assistant blocks for completed tool calls and extracts the
 * set of files they changed (per ACP diff content), relative to `workdir`.
 */
export const summarizeFileChangesFromBlocks = (
  blocks: Array<Record<string, unknown>>,
  workdir: string | undefined,
): FileChangeSummary => {
  const files = new Map<string, DiffStat>();

  for (const block of blocks) {
    if (block.type !== "tool_call") continue;
    if (block.status !== "success" && block.status !== "completed") continue;
    summarizeDiffItems(block.raw_contents, workdir, files);
  }

  return {
    files: Array.from(files.entries())
      .map(([path, stat]) => {
        const hasStat = stat.additions !== 0 || stat.deletions !== 0;
        return {
          path,
          additions: hasStat ? stat.additions : null,
          deletions: hasStat ? stat.deletions : null,
        };
      })
      .sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true })),
  };
};
