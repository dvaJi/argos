import { useMemo } from "react";
import { File } from "@pierre/diffs/react";
import { useDiffsBaseOptions } from "./diffsOptions";

export type DiffsCodeSource = {
  id: string;
  content: string;
  name?: string;
  language?: string | null;
};

interface DiffsCodePaneProps {
  source: DiffsCodeSource;
  className?: string;
}

/**
 * Read-only code surface backed by `@pierre/diffs` `<File>` (Shiki highlight).
 * Replaces the read-only Monaco viewer so code, diffs, and the Diffs tab share
 * one rendering pipeline and theme.
 *
 * `disableWorkerPool` runs Shiki on the main thread, avoiding Vite worker-URL
 * plumbing for the sidepanel's typical file sizes.
 */
export function DiffsCodePane({ source, className }: DiffsCodePaneProps) {
  const base = useDiffsBaseOptions();

  const file = useMemo(
    () => ({
      name: source.name ?? source.id,
      contents: source.content ?? "",
    }),
    [source.name, source.id, source.content],
  );

  const options = useMemo(
    () => ({
      ...base,
      disableLineNumbers: false,
      overflow: "wrap" as const,
      stickyHeader: false,
    }),
    [base],
  );

  return (
    <div
      className={`diffs-code-pane-host h-full min-h-0 w-full overflow-auto bg-background ${className ?? ""}`}
      data-testid="diffs-code-pane"
    >
      <File file={file} options={options} disableWorkerPool style={{ minHeight: "100%" }} />
    </div>
  );
}
