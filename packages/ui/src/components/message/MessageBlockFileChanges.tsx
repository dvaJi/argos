import { useState } from "react";
import { Icon } from "@iconify/react";
import { cn } from "#shadcn/lib/utils";
import { Button } from "#shadcn/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "#shadcn/components/ui/tooltip";
import type { DisplayAssistantMessageBlock } from "#/components/chat/messageListItems";
import { setDiffsSelection, openDiffs } from "#/stores/ui/sidepanel";
export interface TurnFileChange {
  path: string;
  additions: number | null;
  deletions: number | null;
}
interface TurnDiffStat {
  additions: number;
  deletions: number;
}
interface TurnDiffTreeDirectoryNode {
  kind: "directory";
  name: string;
  path: string;
  stat: TurnDiffStat;
  children: TurnDiffTreeNode[];
}
interface TurnDiffTreeFileNode {
  kind: "file";
  name: string;
  path: string;
  stat: TurnDiffStat | null;
}
type TurnDiffTreeNode = TurnDiffTreeDirectoryNode | TurnDiffTreeFileNode;
interface MutableDirectoryNode {
  name: string;
  path: string;
  stat: TurnDiffStat;
  directories: Map<string, MutableDirectoryNode>;
  files: TurnDiffTreeFileNode[];
}
const SORT_LOCALE_OPTIONS: Intl.CollatorOptions = {
  numeric: true,
  sensitivity: "base",
};
const normalizePathSegments = (pathValue: string): string[] =>
  pathValue
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment.length > 0);
const compareByName = (
  a: {
    name: string;
  },
  b: {
    name: string;
  },
): number => a.name.localeCompare(b.name, undefined, SORT_LOCALE_OPTIONS);
const readStat = (file: TurnFileChange): TurnDiffStat | null => {
  if (typeof file.additions !== "number" || typeof file.deletions !== "number") {
    return null;
  }
  return {
    additions: file.additions,
    deletions: file.deletions,
  };
};
const summarizeTurnDiffStats = (files: TurnFileChange[]): TurnDiffStat =>
  files.reduce(
    (acc, file) => {
      const stat = readStat(file);
      if (!stat) return acc;
      return {
        additions: acc.additions + stat.additions,
        deletions: acc.deletions + stat.deletions,
      };
    },
    {
      additions: 0,
      deletions: 0,
    },
  );
const compactDirectoryNode = (node: TurnDiffTreeDirectoryNode): TurnDiffTreeDirectoryNode => {
  const compactedChildren = node.children.map((child) =>
    child.kind === "directory" ? compactDirectoryNode(child) : child,
  );
  let compactedNode: TurnDiffTreeDirectoryNode = {
    ...node,
    children: compactedChildren,
  };
  while (compactedNode.children.length === 1 && compactedNode.children[0]?.kind === "directory") {
    const onlyChild = compactedNode.children[0];
    compactedNode = {
      kind: "directory",
      name: `${compactedNode.name}/${onlyChild.name}`,
      path: onlyChild.path,
      stat: onlyChild.stat,
      children: onlyChild.children,
    };
  }
  return compactedNode;
};
const toTreeNodes = (directory: MutableDirectoryNode): TurnDiffTreeNode[] => {
  const subdirectories: TurnDiffTreeDirectoryNode[] = Array.from(directory.directories.values())
    .toSorted(compareByName)
    .map<TurnDiffTreeDirectoryNode>((subdirectory) =>
      compactDirectoryNode({
        kind: "directory",
        name: subdirectory.name,
        path: subdirectory.path,
        stat: {
          additions: subdirectory.stat.additions,
          deletions: subdirectory.stat.deletions,
        },
        children: toTreeNodes(subdirectory),
      }),
    );
  const files = directory.files.toSorted(compareByName);
  return [...subdirectories, ...files];
};
const buildTurnDiffTree = (files: TurnFileChange[]): TurnDiffTreeNode[] => {
  const root: MutableDirectoryNode = {
    name: "",
    path: "",
    stat: {
      additions: 0,
      deletions: 0,
    },
    directories: new Map(),
    files: [],
  };
  for (const file of files) {
    const segments = normalizePathSegments(file.path);
    if (segments.length === 0) {
      continue;
    }
    const filePath = segments.join("/");
    const fileName = segments.at(-1);
    if (!fileName) {
      continue;
    }
    const stat = readStat(file);
    const ancestors: MutableDirectoryNode[] = [root];
    let currentDirectory = root;
    for (const segment of segments.slice(0, -1)) {
      const nextPath = currentDirectory.path ? `${currentDirectory.path}/${segment}` : segment;
      const existing = currentDirectory.directories.get(segment);
      if (existing) {
        currentDirectory = existing;
      } else {
        const created: MutableDirectoryNode = {
          name: segment,
          path: nextPath,
          stat: {
            additions: 0,
            deletions: 0,
          },
          directories: new Map(),
          files: [],
        };
        currentDirectory.directories.set(segment, created);
        currentDirectory = created;
      }
      ancestors.push(currentDirectory);
    }
    currentDirectory.files.push({
      kind: "file",
      name: fileName,
      path: filePath,
      stat,
    });
    if (stat) {
      for (const ancestor of ancestors) {
        ancestor.stat.additions += stat.additions;
        ancestor.stat.deletions += stat.deletions;
      }
    }
  }
  return toTreeNodes(root);
};
const hasNonZeroStat = (stat: TurnDiffStat): boolean => stat.additions > 0 || stat.deletions > 0;
const formatCompactDiffCount = (value: number): string => {
  if (value < 1000) return String(value);
  if (value < 1_000_000) {
    const k = value / 1000;
    return `${k < 10 ? k.toFixed(1).replace(/\.0$/, "") : Math.round(k)}k`;
  }
  if (value < 1_000_000_000) {
    const m = value / 1_000_000;
    return `${m < 10 ? m.toFixed(1).replace(/\.0$/, "") : Math.round(m)}m`;
  }
  const b = value / 1_000_000_000;
  return `${b < 10 ? b.toFixed(1).replace(/\.0$/, "") : Math.round(b)}b`;
};
const DiffStatLabel = ({
  additions,
  deletions,
  inline = false,
}: {
  additions: number;
  deletions: number;
  inline?: boolean;
}) => (
  <>
    <span
      role="group"
      aria-label={`${additions} additions, ${deletions} deletions`}
      className={cn(
        inline ? "inline-flex items-center gap-1 tabular-nums align-middle" : "tabular-nums align-middle",
        inline ? "" : "inline-grid grid-cols-[4ch_4ch] gap-2 text-right",
      )}
    >
      <span aria-hidden="true" className="font-mono text-emerald-500">
        +{formatCompactDiffCount(additions)}
      </span>
      <span aria-hidden="true" className="font-mono text-red-500">
        -{formatCompactDiffCount(deletions)}
      </span>
    </span>
  </>
);
const fileIcon = (path: string): string => {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  const codeExtensions = new Set([
    "ts",
    "tsx",
    "js",
    "jsx",
    "rs",
    "py",
    "go",
    "rb",
    "java",
    "c",
    "cpp",
    "h",
    "hpp",
    "cs",
    "php",
    "swift",
    "kt",
    "css",
    "scss",
    "less",
    "html",
    "htm",
    "json",
    "yml",
    "yaml",
    "toml",
    "xml",
    "sh",
    "bash",
    "zsh",
  ]);
  if (codeExtensions.has(extension)) return "lucide:file-code-2";
  if (extension === "md" || extension === "mdx") return "lucide:file-text";
  return "lucide:file";
};

// Auto-expand small turns so the summary is immediately readable; larger
// change sets start collapsed and reveal on click (t3code behavior).
const AUTO_EXPAND_FILE_LIMIT = 5;
const AUTO_EXPAND_LINE_LIMIT = 200;
const shouldAutoExpand = (files: TurnFileChange[]): boolean => {
  if (files.length > AUTO_EXPAND_FILE_LIMIT) return false;
  const stat = summarizeTurnDiffStats(files);
  return stat.additions + stat.deletions <= AUTO_EXPAND_LINE_LIMIT;
};
const EMPTY_DIRECTORY_OVERRIDES: Record<string, boolean> = {};
interface MessageBlockFileChangesProps {
  block: DisplayAssistantMessageBlock;
  messageId: string;
  threadId: string;
}
export const MessageBlockFileChanges = function MessageBlockFileChanges({
  block,
  messageId,
  // `threadId` is accepted for future per-project workspace routing.
}: MessageBlockFileChangesProps) {
  const files = block.file_changes?.files ?? [];
  const summaryStat = summarizeTurnDiffStats(files);
  const [expanded, setExpanded] = useState(() => shouldAutoExpand(files));
  const [allDirectoriesExpanded, setAllDirectoriesExpanded] = useState(true);
  const handleOpenDiff = (path?: string) => {
    // The Diffs tab reads a workspace-relative path from the store; a full
    // null selection means "All changes".
    setDiffsSelection(path ?? null);
    openDiffs();
  };
  const handleToggleAllDirectories = () => {
    setAllDirectoriesExpanded((prev) => !prev);
  };
  if (files.length === 0) {
    return null;
  }
  return (
    <div
      className="mt-4 rounded-2xl border border-border/70 bg-secondary p-2 dark:border-transparent dark:bg-input/30"
      data-changed-files=""
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 rounded-xl px-1",
          expanded &&
            "sticky top-2 z-10 mb-2 bg-secondary dark:bg-[color-mix(in_srgb,var(--foreground)_2.5%,var(--background))]",
        )}
      >
        <button
          type="button"
          aria-expanded={expanded}
          className="group flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setExpanded((prev) => !prev)}
        >
          <Icon
            icon="lucide:chevron-right"
            aria-hidden="true"
            className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")}
          />
          <span className="flex min-w-0 items-center gap-1 whitespace-nowrap font-medium text-foreground text-xs leading-4">
            <span>
              {files.length} changed file{files.length === 1 ? "" : "s"}
            </span>
            {hasNonZeroStat(summaryStat) && (
              <DiffStatLabel additions={summaryStat.additions} deletions={summaryStat.deletions} inline />
            )}
          </span>
          <span className="ml-1 hidden truncate text-[11px] text-muted-foreground group-hover:text-foreground/80 sm:inline">
            {expanded ? "Hide files" : "Show files"}
          </span>
        </button>
        <div className="flex items-center gap-1.5">
          {expanded ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="outline"
                    className="!size-[22px]"
                    aria-label={allDirectoriesExpanded ? "Collapse all folders" : "Expand all folders"}
                    onClick={handleToggleAllDirectories}
                  />
                }
              >
                <Icon
                  icon={allDirectoriesExpanded ? "lucide:chevrons-down-up" : "lucide:chevrons-up-down"}
                  className="size-3"
                />
              </TooltipTrigger>
              <TooltipContent>{allDirectoriesExpanded ? "Collapse all folders" : "Expand all folders"}</TooltipContent>
            </Tooltip>
          ) : null}
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  aria-label="Open diff"
                  onClick={() => handleOpenDiff()}
                />
              }
            >
              <Icon icon="lucide:file-diff" className="size-3" />
              <span className="hidden sm:inline">Open diff</span>
            </TooltipTrigger>
            <TooltipContent>Open the full diff</TooltipContent>
          </Tooltip>
        </div>
      </div>
      {expanded ? (
        <ChangedFilesTree
          key={`changed-files-tree:${messageId}`}
          files={files}
          allDirectoriesExpanded={allDirectoriesExpanded}
          onOpenFileDiff={handleOpenDiff}
        />
      ) : null}
    </div>
  );
};
const ChangedFilesTree = function ChangedFilesTree({
  files,
  allDirectoriesExpanded,
  onOpenFileDiff,
}: {
  files: TurnFileChange[];
  allDirectoriesExpanded: boolean;
  onOpenFileDiff: (path?: string) => void;
}) {
  const treeNodes = buildTurnDiffTree(files);
  const directoryPathsKey = collectDirectoryPaths(treeNodes).join("\u0000");
  const hasDirectoryNodes = directoryPathsKey.length > 0;
  const expansionStateKey = `${allDirectoriesExpanded ? "expanded" : "collapsed"}\u0000${directoryPathsKey}`;
  const [directoryExpansionState, setDirectoryExpansionState] = useState<{
    key: string;
    overrides: Record<string, boolean>;
  }>(() => ({
    key: expansionStateKey,
    overrides: {},
  }));
  const expandedDirectories =
    directoryExpansionState.key === expansionStateKey ? directoryExpansionState.overrides : EMPTY_DIRECTORY_OVERRIDES;
  const toggleDirectory = (pathValue: string) => {
    setDirectoryExpansionState((current) => {
      const nextOverrides = current.key === expansionStateKey ? current.overrides : {};
      return {
        key: expansionStateKey,
        overrides: {
          ...nextOverrides,
          [pathValue]: !(nextOverrides[pathValue] ?? allDirectoriesExpanded),
        },
      };
    });
  };
  const renderTreeNode = (node: TurnDiffTreeNode, depth: number) => {
    const leftPadding = 8 + depth * 14;
    if (node.kind === "directory") {
      const isExpanded = expandedDirectories[node.path] ?? allDirectoriesExpanded;
      return (
        <div key={`dir:${node.path}`}>
          <button
            type="button"
            className="group flex w-full items-center gap-1.5 rounded-xl py-1 pr-3 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            style={{
              paddingLeft: `${leftPadding}px`,
            }}
            onClick={() => toggleDirectory(node.path)}
          >
            <Icon
              icon="lucide:chevron-right"
              aria-hidden="true"
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground/70 transition-transform group-hover:text-foreground/80",
                isExpanded && "rotate-90",
              )}
            />
            <Icon
              icon={isExpanded ? "lucide:folder-open" : "lucide:folder"}
              className="size-3.5 shrink-0 text-muted-foreground/75"
            />
            <span className="truncate font-mono text-[11px] text-muted-foreground/90 group-hover:text-foreground/90">
              {node.name}
            </span>
            {hasNonZeroStat(node.stat) && (
              <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums">
                <DiffStatLabel additions={node.stat.additions} deletions={node.stat.deletions} />
              </span>
            )}
          </button>
          {isExpanded && (
            <div className="space-y-0.5">{node.children.map((childNode) => renderTreeNode(childNode, depth + 1))}</div>
          )}
        </div>
      );
    }
    return (
      <button
        key={`file:${node.path}`}
        type="button"
        className="group flex w-full items-center gap-1.5 rounded-xl py-1 pr-3 text-left transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
        style={{
          paddingLeft: `${leftPadding}px`,
        }}
        onClick={() => onOpenFileDiff(node.path)}
      >
        {hasDirectoryNodes || depth > 0 ? <span aria-hidden="true" className="size-3.5 shrink-0" /> : null}
        <Icon icon={fileIcon(node.path)} className="size-3.5 shrink-0 text-muted-foreground/70" />
        <span className="truncate font-mono text-[11px] text-muted-foreground/80 group-hover:text-foreground/90">
          {node.name}
        </span>
        {node.stat && (
          <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums">
            <DiffStatLabel additions={node.stat.additions} deletions={node.stat.deletions} />
          </span>
        )}
      </button>
    );
  };
  return <div className="space-y-0.5">{treeNodes.map((node) => renderTreeNode(node, 0))}</div>;
};
const collectDirectoryPaths = (nodes: TurnDiffTreeNode[]): string[] => {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.kind !== "directory") continue;
    paths.push(node.path);
    paths.push(...collectDirectoryPaths(node.children));
  }
  return paths;
};
