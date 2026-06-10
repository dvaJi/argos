import { useState } from "react";
import { Icon } from "@iconify/react";
import type { SkillFolderNode } from "@shared/types/skill";

interface SkillFolderTreeNodeProps {
  node: SkillFolderNode;
  depth: number;
}

const getFileIcon = (filename: string): string => {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "md":
      return "lucide:file-text";
    case "js":
    case "ts":
      return "lucide:file-code";
    case "json":
      return "lucide:file-json";
    case "sh":
      return "lucide:terminal";
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
      return "lucide:image";
    default:
      return "lucide:file";
  }
};

export default function SkillFolderTreeNode({ node, depth }: SkillFolderTreeNodeProps) {
  const [expanded, setExpanded] = useState(depth === 0);

  const toggleExpand = () => setExpanded(!expanded);

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-0.5 px-1 rounded hover:bg-muted/50 cursor-default"
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={toggleExpand}
      >
        {node.type === "directory" ? (
          <>
            <Icon
              icon={expanded ? "lucide:chevron-down" : "lucide:chevron-right"}
              className="w-3 h-3 text-muted-foreground shrink-0"
            />
            <Icon icon="lucide:folder" className="w-4 h-4 text-yellow-500 shrink-0" />
          </>
        ) : (
          <>
            <span className="w-3" />
            <Icon icon={getFileIcon(node.name)} className="w-4 h-4 text-muted-foreground shrink-0" />
          </>
        )}
        <span className="truncate text-sm">{node.name}</span>
      </div>
      {node.type === "directory" && expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <SkillFolderTreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
