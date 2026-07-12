import { useMemo, useRef } from "react";
import { formatTemplate } from "./ReactTemplate";

interface ReactArtifactProps {
  block: { artifact: { type: string; title: string }; content: string };
  className?: string;
}

export function ReactArtifact({ block, className }: ReactArtifactProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const htmlContent = useMemo(() => formatTemplate(block.artifact.title, block.content), [block]);

  return (
    <div className={`flex h-full min-h-0 w-full overflow-hidden ${className ?? ""}`} data-testid="react-artifact-root">
      <iframe
        ref={iframeRef}
        srcDoc={htmlContent}
        className="html-iframe-wrapper h-full min-h-0 w-full"
        sandbox="allow-scripts"
        data-testid="react-artifact-iframe"
      />
    </div>
  );
}
