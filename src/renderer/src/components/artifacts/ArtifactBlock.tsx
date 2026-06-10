import { Icon } from "@iconify/react";
import { createDeviceClient } from "@api/DeviceClient";
import { CodeArtifact } from "./CodeArtifact";
import { MarkdownArtifact } from "./MarkdownArtifact";
import { HTMLArtifact } from "./HTMLArtifact";
import { SvgArtifact } from "./SvgArtifact";
import { MermaidArtifact } from "./MermaidArtifact";
import { ReactArtifact } from "./ReactArtifact";

interface ArtifactBlockProps {
  block: {
    artifact: { type: string; title: string };
    content: string;
  };
}

const deviceClient = createDeviceClient();

const getArtifactClass = (type: string): string => {
  switch (type) {
    case "application/vnd.ant.code":
    case "text/markdown":
      return "prose dark:prose-invert max-w-none";
    default:
      return "";
  }
};

export function ArtifactBlock({ block }: ArtifactBlockProps) {
  const handleCopy = () => {
    if (block.content) deviceClient.copyText(block.content);
  };

  const renderArtifact = () => {
    if (!block.artifact) return null;
    const cls = `mt-4 ${getArtifactClass(block.artifact.type)}`;
    switch (block.artifact.type) {
      case "application/vnd.ant.code":
        return <CodeArtifact block={block} className={cls} />;
      case "text/markdown":
        return <MarkdownArtifact block={block} className={cls} />;
      case "text/html":
        return <HTMLArtifact block={block} isPreview={false} className={cls} />;
      case "image/svg+xml":
        return <SvgArtifact block={block} className={cls} />;
      case "application/vnd.ant.mermaid":
        return <MermaidArtifact block={block} isPreview={false} className={cls} />;
      case "application/vnd.ant.react":
        return <ReactArtifact block={block} className={cls} />;
      default:
        return null;
    }
  };

  return (
    <div className="w-full rounded-lg border shadow-sm">
      <div className="flex flex-col space-y-1.5 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold leading-none tracking-tight">{block.artifact?.title}</h3>
          <div className="flex items-center gap-2">
            <button className="p-1 rounded hover:bg-muted" onClick={handleCopy}>
              <Icon icon="lucide:copy" className="h-4 w-4" />
            </button>
          </div>
        </div>
        {renderArtifact()}
      </div>
    </div>
  );
}
