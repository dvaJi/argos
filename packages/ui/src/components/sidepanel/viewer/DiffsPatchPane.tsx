import { useMemo } from "react";
import { PatchDiff } from "@pierre/diffs/react";
import { useDiffsBaseOptions } from "./diffsOptions";

interface DiffsPatchPaneProps {
  /**
   * Unified diff patch text (e.g. `git diff` output). May contain any number of
   * file diffs — `<PatchDiff>` only accepts exactly one, so this splits the
   * patch on `diff --git` boundaries and renders one `<PatchDiff>` per file.
   */
  patch: string;
  diffStyle?: "split" | "unified";
  className?: string;
}

const splitIntoFilePatches = (patch: string): string[] => {
  const segments = patch
    .split(/(?=^diff --git )/m)
    .map((segment) => segment.trim())
    .filter(Boolean);
  // Skip segments with no hunks (e.g. "Binary files … differ") — PatchDiff
  // cannot render them.
  return segments.filter((segment) => segment.includes("@@"));
};

export function DiffsPatchPane({ patch, diffStyle = "unified", className }: DiffsPatchPaneProps) {
  const base = useDiffsBaseOptions();
  const filePatches = useMemo(() => splitIntoFilePatches(patch), [patch]);

  const options = useMemo(
    () => ({ ...base, diffStyle, disableLineNumbers: false, stickyHeader: true }),
    [base, diffStyle],
  );

  if (filePatches.length === 0) {
    return (
      <div className={`px-4 py-3 text-xs text-muted-foreground ${className ?? ""}`} data-testid="diffs-patch-pane">
        No changes
      </div>
    );
  }

  return (
    <div
      className={`diffs-patch-pane-host h-full min-h-0 w-full overflow-auto bg-background ${className ?? ""}`}
      data-testid="diffs-patch-pane"
    >
      {filePatches.map((filePatch, index) => (
        <PatchDiff key={index} patch={filePatch} options={options} disableWorkerPool />
      ))}
    </div>
  );
}
