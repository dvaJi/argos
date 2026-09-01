import { useEffect, useRef, useState } from "react";
import { FileTree, useFileTree } from "@pierre/trees/react";
import { prepareFileTreeInput } from "@pierre/trees";
import { Icon } from "@iconify/react";
import { createWorkspaceClient } from "#api/WorkspaceClient";
import { useSidepanelStore } from "#/stores/ui/sidepanel";
import type { WorkspaceGitChangeType, WorkspaceFileNode } from "@argos/shared/presenter";

/** Trees status vocabulary. */
type TreesGitStatus = "added" | "deleted" | "ignored" | "modified" | "renamed" | "untracked";
type TreesGitStatusEntry = {
  path: string;
  status: TreesGitStatus;
};
type TreesContextItem = {
  kind: "directory" | "file";
  name: string;
  path: string;
};
type TreesContextOpenContext = {
  anchorRect: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  close: () => void;
};

/** Eager-load safety caps so huge repos do not block the sidepanel. */
const MAX_TREE_DEPTH = 6;
const MAX_TREE_NODES = 8000;
const mapGitStatus = (type: WorkspaceGitChangeType): TreesGitStatus => {
  switch (type) {
    case "added":
      return "added";
    case "deleted":
      return "deleted";
    case "renamed":
      return "renamed";
    case "untracked":
      return "untracked";
    case "ignored":
      return "ignored";
    case "copied":
    case "unmerged":
    case "modified":
    default:
      return "modified";
  }
};
const trimTrailingSep = (value: string) => value.replace(/[\\/]+$/, "");

/** Absolute OS path -> forward-slash path relative to the workspace root. */
const toRelativePath = (workspacePath: string, absolutePath: string): string => {
  const root = trimTrailingSep(workspacePath);
  let rel = absolutePath;
  if (rel.toLowerCase().startsWith(root.toLowerCase())) {
    rel = rel.slice(root.length);
  }
  return rel
    .replace(/^[\\/]+/, "")
    .split(/[\\/]+/)
    .filter(Boolean)
    .join("/");
};

/** Forward-slash relative path -> absolute OS path (trailing slash stripped). */
const toAbsolutePath = (workspacePath: string, relativePath: string): string =>
  `${trimTrailingSep(workspacePath)}${"/"}${relativePath.replace(/[\\/]+$/, "")}`;
const getBasename = (relativePath: string) => {
  const segments = relativePath.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? relativePath;
};
const getParentRelative = (relativePath: string): string => {
  const segments = relativePath.split("/").filter(Boolean);
  segments.pop();
  return segments.join("/");
};
interface TreesFileTreeProps {
  workspacePath: string;
  sessionId: string;
  onInsertFileReference?: (filePath: string) => void;
}

/**
 * File-tree surface backed by `@pierre/trees`. Replaces the hand-rolled
 * `WorkspaceFileNode` renderer. Trees owns selection/focus/search/rename/dnd;
 * this adapter feeds it paths + git status from the workspace presenter and
 * persists mutations (rename/move/create/delete) back through the typed client.
 *
 * Paths are exchanged with Trees as forward-slash relative strings (stable
 * cross-platform identity) and converted to absolute paths at the client boundary.
 */
// Process-wide singleton; module scope keeps effect dependencies stable.
const workspaceClient = createWorkspaceClient();

export function TreesFileTree({ workspacePath, sessionId, onInsertFileReference }: TreesFileTreeProps) {
  const sidepanelStore = useSidepanelStore();
  const [paths, setPaths] = useState<string[]>([]);
  const [gitStatus, setGitStatus] = useState<TreesGitStatusEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reloadTokenRef = useRef(0);
  const collectPaths = async function collectPaths(dirPath: string, depth: number, acc: string[]): Promise<void> {
    if (depth > MAX_TREE_DEPTH || acc.length > MAX_TREE_NODES) return;
    let nodes: WorkspaceFileNode[];
    try {
      nodes = (await workspaceClient.expandDirectory(dirPath)) as WorkspaceFileNode[];
    } catch {
      return;
    }
    for (const node of nodes) {
      if (acc.length > MAX_TREE_NODES) break;
      const relativePath = toRelativePath(workspacePath, node.path);
      // Trees infers "directory" from a trailing slash (canonical dir path), so
      // mark dirs explicitly — otherwise empty folders render as files.
      acc.push(node.isDirectory ? `${relativePath}/` : relativePath);
      if (node.isDirectory) {
        await collectPaths(node.path, depth + 1, acc);
      }
    }
  };
  const loadGitStatus = async (): Promise<TreesGitStatusEntry[]> => {
    const state = await workspaceClient.getGitStatus(workspacePath);
    if (!state) return [];
    return state.changes.map((change) => ({
      path: change.relativePath,
      status: mapGitStatus(change.type),
    }));
  };
  const reload = async () => {
    const token = ++reloadTokenRef.current;
    setLoading(true);
    setError(null);
    try {
      const collected: string[] = [];
      await collectPaths(workspacePath, 0, collected);
      const status = await loadGitStatus();
      if (token !== reloadTokenRef.current) return;
      setPaths(collected);
      setGitStatus(status);
    } catch (err) {
      console.error("[TreesFileTree] reload failed", err);
      if (token === reloadTokenRef.current) setError("Failed to load workspace");
    }
    if (token === reloadTokenRef.current) setLoading(false);
  };
  const handleSelectionChange = (selected: readonly string[]) => {
    const first = selected[0];
    if (!first) return;
    // Trees marks directories with a trailing slash; opening a directory in the
    // file viewer would only fail (no file preview), so ignore dir selections.
    if (first.endsWith("/")) return;
    sidepanelStore.selectFile(sessionId, toAbsolutePath(workspacePath, first), {
      open: false,
    });
  };
  const persistMove = async (sourcePath: string, destinationPath: string) => {
    try {
      await workspaceClient.renameOrMovePath(
        toAbsolutePath(workspacePath, sourcePath),
        toAbsolutePath(workspacePath, destinationPath),
      );
    } catch (err) {
      console.error("[TreesFileTree] move/rename failed", err);
    }
  };
  const handleRename = (event: { sourcePath: string; destinationPath: string }) => {
    void persistMove(event.sourcePath, event.destinationPath);
  };
  const handleDropComplete = (event: {
    draggedPaths: readonly string[];
    target: {
      directoryPath: string | null;
    };
  }) => {
    const targetDir = event.target.directoryPath
      ? toAbsolutePath(workspacePath, event.target.directoryPath)
      : workspacePath;
    for (const dragged of event.draggedPaths) {
      const fromAbs = toAbsolutePath(workspacePath, dragged);
      const toAbs = `${trimTrailingSep(targetDir)}/${getBasename(dragged)}`;
      if (fromAbs === toAbs) continue;
      void persistMove(dragged, toRelativePath(workspacePath, toAbs));
    }
  };
  const handleCreate = async (parentRelative: string | null, name: string, isDirectory: boolean) => {
    const parentAbs = parentRelative ? toAbsolutePath(workspacePath, parentRelative) : workspacePath;
    try {
      await workspaceClient.createEntry(parentAbs, name, isDirectory);
    } catch (err) {
      console.error("[TreesFileTree] create failed", err);
    }
  };
  const handleDelete = async (relativePath: string) => {
    try {
      await workspaceClient.deletePath(toAbsolutePath(workspacePath, relativePath));
    } catch (err) {
      console.error("[TreesFileTree] delete failed", err);
    }
  };
  const { model } = useFileTree({
    preparedInput: prepareFileTreeInput([]),
    gitStatus: [],
    search: true,
    fileTreeSearchMode: "hide-non-matches",
    onSelectionChange: handleSelectionChange,
    renaming: {
      canRename: () => true,
      onError: (message) => console.warn("[TreesFileTree] rename error", message),
      onRename: handleRename,
    },
    dragAndDrop: {
      canDrag: () => true,
      canDrop: () => true,
      onDropComplete: handleDropComplete,
      onDropError: (message) => console.warn("[TreesFileTree] drop error", message),
    },
    initialExpansion: "closed",
  });

  // `useFileTree` reads options once; push path/git updates through the model.
  // Use preparedInput (not raw `paths`) so Trees resolves directory/file kinds
  // up front — raw paths can throw "Path collides with an existing file" when a
  // node is a parent of a later path.
  useEffect(() => {
    try {
      model.resetPaths({
        preparedInput: prepareFileTreeInput(paths),
      });
    } catch (error) {
      console.error("[TreesFileTree] resetPaths failed", error);
    }
  }, [model, paths]);
  useEffect(() => {
    model.setGitStatus(gitStatus);
  }, [model, gitStatus]);

  // Register + watch before the first read so the daemon allow-list is populated
  // (avoids an empty-tree race when this mounts before the panel-level sync registers).
  useEffect(() => {
    let cancelled = false;
    let off: (() => void) | undefined;
    void (async () => {
      try {
        await workspaceClient.registerWorkspace(workspacePath);
        await workspaceClient.watchWorkspace(workspacePath);
      } catch (error) {
        console.error("[TreesFileTree] register/watch failed", error);
      }
      if (cancelled) {
        void workspaceClient.unwatchWorkspace(workspacePath);
        return;
      }
      off = workspaceClient.onInvalidated((payload) => {
        if (payload.workspacePath !== workspacePath) return;
        void reload();
      });
      void reload();
    })();
    return () => {
      cancelled = true;
      off?.();
      void workspaceClient.unwatchWorkspace(workspacePath);
    };
  }, [workspacePath, reload]);
  const renderContextMenu = (item: TreesContextItem, context: TreesContextOpenContext) => {
    const isDir = item.kind === "directory";
    const parentRelative = isDir ? item.path : getParentRelative(item.path);
    const style = {
      left: context.anchorRect.left,
      top: context.anchorRect.bottom,
    };
    const close = () => context.close();
    return (
      <div
        className="file-tree-context-menu fixed z-50 min-w-[170px] rounded-md border bg-popover py-1 text-xs text-popover-foreground shadow-lg"
        style={style}
      >
        {isDir && (
          <>
            <MenuButton
              label="New File"
              icon="lucide:file-plus"
              onClick={() => {
                const name = window.prompt("New file name");
                if (name) void handleCreate(item.path, name, false);
                close();
              }}
            />
            <MenuButton
              label="New Folder"
              icon="lucide:folder-plus"
              onClick={() => {
                const name = window.prompt("New folder name");
                if (name) void handleCreate(item.path, name, true);
                close();
              }}
            />
            <MenuDivider />
          </>
        )}
        {!isDir && onInsertFileReference && (
          <MenuButton
            label="Insert reference"
            icon="lucide:at-sign"
            onClick={() => {
              onInsertFileReference(toAbsolutePath(workspacePath, item.path));
              close();
            }}
          />
        )}
        <MenuButton
          label="Reveal in folder"
          icon="lucide:external-link"
          onClick={() => {
            void workspaceClient.revealFileInFolder(toAbsolutePath(workspacePath, item.path));
            close();
          }}
        />
        <MenuDivider />
        <MenuButton
          label="Delete"
          icon="lucide:trash-2"
          destructive
          onClick={() => {
            if (window.confirm(`Delete ${item.name}?`)) void handleDelete(item.path);
            close();
          }}
        />
        {!isDir && (
          <MenuButton
            label="New File here"
            icon="lucide:file-plus"
            onClick={() => {
              const name = window.prompt("New file name");
              if (name) void handleCreate(parentRelative, name, false);
              close();
            }}
          />
        )}
      </div>
    );
  };
  if (loading && paths.length === 0) {
    return <div className="p-3 text-xs text-muted-foreground">Loading files...</div>;
  }
  if (error) {
    return <div className="p-3 text-xs text-muted-foreground">{error}</div>;
  }
  if (paths.length === 0) {
    return <div className="p-3 text-xs text-muted-foreground">Empty workspace</div>;
  }
  return (
    <div
      className="trees-file-tree-host min-h-0 w-full flex-1 overflow-hidden"
      data-testid="trees-file-tree"
      title="File tree"
    >
      <FileTree model={model} className="h-full w-full text-xs" renderContextMenu={renderContextMenu} />
    </div>
  );
}
interface MenuButtonProps {
  label: string;
  icon: string;
  destructive?: boolean;
  onClick: () => void;
}
function MenuButton({ label, icon, destructive, onClick }: MenuButtonProps) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-accent ${destructive ? "text-red-600 dark:text-red-400" : ""}`}
      onClick={onClick}
    >
      <Icon icon={icon} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      {label}
    </button>
  );
}
function MenuDivider() {
  return <div className="my-1 h-px bg-border" />;
}
