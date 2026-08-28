import { useState, useEffect } from "react";
import { Icon } from "@iconify/react";
import { useSkillsStore, getSkillFolderTree } from "#/stores/skillsStore";
import type { SkillFolderNode } from "@argos/shared/types/skill";
import SkillFolderTreeNode from "./SkillFolderTreeNode";

interface SkillFolderTreeProps {
  skillName: string;
}

export default function SkillFolderTree({ skillName }: SkillFolderTreeProps) {
  const skillsStore = useSkillsStore();
  const [nodes, setNodes] = useState<SkillFolderNode[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!skillName) return;
    let cancelled = false;
    void Promise.resolve()
      .then(() => {
        setLoading(true);
        return getSkillFolderTree(skillName);
      })
      .then((result) => {
        if (!cancelled) setNodes(result);
      })
      .catch((error) => {
        console.error("Failed to load folder tree:", error);
        if (!cancelled) setNodes([]);
      })
      .then(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [skillName]);
  void skillsStore;

  return (
    <div className="text-sm">
      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Icon icon="lucide:loader-2" className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      ) : nodes.length === 0 ? (
        <div className="text-muted-foreground text-center py-4">No files found</div>
      ) : (
        <div className="space-y-0.5">
          {nodes.map((node) => (
            <SkillFolderTreeNode key={node.path} node={node} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}
