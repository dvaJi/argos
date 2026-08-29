import { useMemo } from "react";
import { Icon } from "@iconify/react";
import { useArtifactStore } from "#/stores/artifact";
import { useSidepanelStore } from "#/stores/ui/sidepanel";

interface ArtifactPreviewProps {
  block: {
    artifact: { identifier: string; type: string; title: string; language?: string };
    content: string;
  };
  messageId: string;
  threadId: string;
  loading?: boolean;
}

const getArtifactIcon = (type: string | undefined) => {
  if (!type) return "lucide:file";
  switch (type) {
    case "application/vnd.ant.code":
      return "lucide:square-code";
    case "text/markdown":
      return "vscode-icons:file-type-markdown";
    case "text/html":
      return "vscode-icons:file-type-html";
    case "image/svg+xml":
      return "vscode-icons:file-type-svg";
    case "application/vnd.ant.mermaid":
      return "vscode-icons:file-type-mermaid";
    case "application/vnd.ant.react":
      return "vscode-icons:file-type-reactts";
    default:
      return "lucide:file";
  }
};

export function ArtifactPreview({ block, messageId, threadId, loading }: ArtifactPreviewProps) {
  const artifactStore = useArtifactStore();
  const sidepanelStore = useSidepanelStore();

  const displayTitle = useMemo(() => {
    const { type, title } = block.artifact;
    const content = block.content;

    if (type === "application/vnd.ant.mermaid") {
      const lines = content.trim().split("\n");
      const firstLine = lines[0].toLowerCase();
      let chartType = "";
      let chartTitle = "";

      if (firstLine.includes("flowchart") || firstLine.includes("graph")) chartType = "flowchart";
      else if (firstLine.includes("sequencediagram")) chartType = "sequence";
      else if (firstLine.includes("classdiagram")) chartType = "class";
      else if (firstLine.includes("statediagram")) chartType = "state";
      else if (firstLine.includes("erdiagram")) chartType = "er";
      else if (firstLine.includes("gantt")) chartType = "gantt";
      else if (firstLine.includes("pie")) chartType = "pie";

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (
          !trimmedLine ||
          trimmedLine
            .toLowerCase()
            .match(/^(graph|flowchart|sequencediagram|classdiagram|statediagram|erdiagram|gantt|pie)\b/i)
        )
          continue;
        if (chartType === "flowchart") {
          const patterns = [
            /([A-Za-z0-9]+)\["([^"]+)"\]/,
            /([A-Za-z0-9]+)\("([^"]+)"\)/,
            /([A-Za-z0-9]+)\['([^']+)'\]/,
            /([A-Za-z0-9]+)\('([^']+)'\)/,
            /([A-Za-z0-9]+)\[([^\]]+)\]/,
            /([A-Za-z0-9]+)\(([^)]+)\)/,
          ];
          for (const pattern of patterns) {
            const match = trimmedLine.match(pattern);
            if (match) {
              chartTitle = match[2];
              break;
            }
          }
          if (chartTitle) break;
        }
      }

      const typeNames: Record<string, string> = {
        flowchart: "Flowchart",
        sequence: "Sequence Diagram",
        class: "Class Diagram",
        state: "State Diagram",
        er: "ER Diagram",
        gantt: "Gantt Chart",
        pie: "Pie Chart",
      };

      if (chartTitle) return chartTitle;
      return typeNames[chartType] || "Mermaid Diagram";
    }

    switch (type) {
      case "application/vnd.ant.code": {
        let codeTitle = title || "Code Snippet";
        const codeLines = content.split("\n");
        let foundTitle = false;
        for (const line of codeLines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (
            trimmed.startsWith("//") ||
            trimmed.startsWith("#") ||
            trimmed.startsWith("/*") ||
            trimmed.startsWith('"""') ||
            trimmed.startsWith("'''")
          ) {
            const commentContent = trimmed.replace(/^[/#*\s"']+/, "").trim();
            if (commentContent && commentContent.length > 1) {
              codeTitle = commentContent;
              foundTitle = true;
              break;
            }
          } else {
            break;
          }
        }
        if (!foundTitle) {
          const funcMatch = content.match(/(?:function|def|func)\s+([a-zA-Z_]\w*)\s*\([^)]*\)/);
          if (funcMatch) {
            codeTitle = funcMatch[1].replace(/_/g, " ").replace(/[A-Z]/g, " $&").trim() + " Function";
          } else {
            const classMatch = content.match(/(?:class)\s+([a-zA-Z_]\w*)/);
            if (classMatch) codeTitle = classMatch[1].replace(/_/g, " ").replace(/[A-Z]/g, " $&").trim() + " Class";
            else if (content.includes("root.render(<App />);")) codeTitle = "React Component";
            else if (content.includes("import") && content.includes("from")) codeTitle = "Module Import";
            else {
              const varMatch = content.match(/(?:const|let|var)\s+([a-zA-Z_]\w*)\s*=/);
              if (varMatch) codeTitle = `Variable: ${varMatch[1]}`;
            }
          }
        }
        return codeTitle;
      }
      case "text/markdown": {
        const headingMatch = content.match(/^#\s+(.+)$/m);
        return headingMatch ? headingMatch[1] : "Markdown Document";
      }
      case "text/html": {
        const htmlTitleMatch =
          content.match(/<title>(.+?)<\/title>/i) || content.match(/<h[1-6][^>]*>(.+?)<\/h[1-6]>/i);
        return htmlTitleMatch ? htmlTitleMatch[1] : "HTML Document";
      }
      case "image/svg+xml":
        return "SVG Image";
      case "application/vnd.ant.react":
        return "React Component";
      default:
        return title || "Unknown Document";
    }
  }, [block]);

  const artifactDesc = useMemo(() => {
    switch (block.artifact.type) {
      case "application/vnd.ant.code":
        return "code";
      case "text/markdown":
        return "markdown";
      case "text/html":
        return "html";
      case "image/svg+xml":
        return "svg";
      case "application/vnd.ant.mermaid":
        return "mermaid";
      case "application/vnd.ant.react":
        return "react";
      default:
        return "unknown";
    }
  }, [block]);

  const handleClick = () => {
    if (
      artifactStore.isOpen() &&
      artifactStore.currentArtifact?.type === block.artifact.type &&
      artifactStore.currentArtifact?.title === displayTitle &&
      artifactStore.currentArtifact?.content === block.content
    ) {
      artifactStore.hideArtifact();
      sidepanelStore.closePanel();
    } else {
      artifactStore.showArtifact(
        {
          id: block.artifact.identifier,
          type: block.artifact.type,
          language: block.artifact.language,
          title: block.artifact.title || displayTitle,
          content: block.content,
          status: "loaded",
        },
        messageId,
        threadId,
        { force: true },
      );
    }
  };

  return (
    <div>
      <div
        className="flex w-96 max-w-full break-all shadow-sm my-2 items-center gap-2 rounded-lg border bg-card text-card-foreground hover:bg-accent/50 cursor-pointer"
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        <div className="shrink-0 w-14 h-14 rounded-lg rounded-r-none inline-flex flex-row justify-center items-center bg-muted border-r">
          <Icon icon={getArtifactIcon(block.artifact?.type)} className="w-5 h-5 text-muted-foreground" />
        </div>
        <div className="grow w-0">
          <h3 className="text-sm font-medium leading-none tracking-tight truncate">
            {block.artifact.title || displayTitle}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">{artifactDesc}</p>
        </div>
        <div className="shrink-0 px-3 h-14 rounded-lg rounded-l-none flex justify-center items-center">
          {loading ? (
            <Icon icon="lucide:loader-2" className="w-5 h-5 animate-spin text-muted-foreground" />
          ) : (
            <Icon icon="lucide:chevron-right" className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
      </div>
    </div>
  );
}
