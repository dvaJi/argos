import { useMemo } from "react";
import { Icon } from "@iconify/react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@shadcn/components/ui/tooltip";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@shadcn/components/ui/context-menu";
import { createWorkspaceClient } from "@api/WorkspaceClient";
import { setChatInputWorkspaceItemDragData } from "@/lib/chatInputWorkspaceReference";
import type { WorkspaceFileNode as WorkspaceFileNodeType } from "@shared/presenter";

interface WorkspaceFileNodeProps {
  node: WorkspaceFileNodeType;
  depth: number;
  onToggle?: (node: WorkspaceFileNodeType) => void;
  onAppendPath?: (filePath: string) => void;
  onInsertPath?: (filePath: string) => void;
}

const EXTENSION_ICON_MAP: Record<string, string> = {
  pdf: "lucide:file-text",
  md: "lucide:file-text",
  markdown: "lucide:file-text",
  txt: "lucide:file-text",
  js: "lucide:file-code",
  ts: "lucide:file-code",
  tsx: "lucide:file-code",
  jsx: "lucide:file-code",
  vue: "lucide:file-code",
  json: "lucide:file-json",
  yml: "lucide:file-cog",
  yaml: "lucide:file-cog",
  png: "lucide:image",
  jpg: "lucide:image",
  jpeg: "lucide:image",
  gif: "lucide:image",
  svg: "lucide:image",
  mp4: "lucide:file-video",
  mov: "lucide:file-video",
  mp3: "lucide:music",
  wav: "lucide:music",
  zip: "lucide:archive",
  tar: "lucide:archive",
  gz: "lucide:archive",
};

export default function WorkspaceFileNode({
  node,
  depth,
  onToggle,
  onAppendPath,
  onInsertPath,
}: WorkspaceFileNodeProps) {
  const workspaceClient = createWorkspaceClient();

  const iconName = useMemo(() => {
    if (node.isDirectory) {
      return node.expanded ? "lucide:folder-open" : "lucide:folder-closed";
    }
    const ext = node.name.split(".").pop()?.toLowerCase();
    if (ext && EXTENSION_ICON_MAP[ext]) {
      return EXTENSION_ICON_MAP[ext];
    }
    return "lucide:file";
  }, [node]);

  const handleClick = () => {
    if (node.isDirectory) {
      onToggle?.(node);
      return;
    }
    onAppendPath?.(node.path);
  };

  const handleOpenFile = async () => {
    if (node.isDirectory) return;
    try {
      await workspaceClient.openFile(node.path);
    } catch (error) {
      console.error(`[Workspace] Failed to open file: ${node.path}`, error);
    }
  };

  const handleRevealInFolder = async () => {
    try {
      await workspaceClient.revealFileInFolder(node.path);
    } catch (error) {
      console.error(`[Workspace] Failed to reveal path: ${node.path}`, error);
    }
  };

  const handleDragStart = (event: React.DragEvent) => {
    setChatInputWorkspaceItemDragData(event.dataTransfer, {
      path: node.path,
      isDirectory: node.isDirectory,
    });
  };

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            className="flex w-full cursor-grab items-center gap-1.5 px-4 py-1 text-left text-xs transition hover:bg-muted/40 active:cursor-grabbing"
            style={{ paddingLeft: `${16 + depth * 12}px` }}
            type="button"
            draggable
            onClick={handleClick}
            onDragStart={handleDragStart}
          >
            {node.isDirectory ? (
              <Icon
                icon={node.expanded ? "lucide:chevron-down" : "lucide:chevron-right"}
                className="h-3 w-3 shrink-0 text-muted-foreground"
              />
            ) : (
              <span className="w-3" />
            )}
            <Icon icon={iconName} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-foreground/90 dark:text-white/80">{node.name}</span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          {!node.isDirectory && (
            <ContextMenuItem onSelect={handleOpenFile}>
              <Icon icon="lucide:external-link" className="h-4 w-4" />
              Open File
            </ContextMenuItem>
          )}
          <ContextMenuItem onSelect={handleRevealInFolder}>
            <Icon icon="lucide:folder-open-dot" className="h-4 w-4" />
            Reveal in Folder
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => onInsertPath?.(node.path)}>
            <Icon icon="lucide:arrow-down-left" className="h-4 w-4" />
            Insert Path
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {node.isDirectory &&
        node.expanded &&
        node.children &&
        node.children.map((child) => (
          <WorkspaceFileNode
            key={child.path}
            node={child}
            depth={depth + 1}
            onToggle={onToggle}
            onAppendPath={onAppendPath}
            onInsertPath={onInsertPath}
          />
        ))}
    </div>
  );
}
