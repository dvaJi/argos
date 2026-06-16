import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { createDeviceClient } from "@api/DeviceClient";

interface SvgArtifactProps {
  block: { artifact: { type: string; title: string }; content: string };
  className?: string;
}

export function SvgArtifact({ block, className }: SvgArtifactProps) {
  const deviceClient = createDeviceClient();
  const [sanitizedContent, setSanitizedContent] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const sanitizeSvgContent = async (content: string) => {
    if (!content) {
      setSanitizedContent("");
      return;
    }
    setIsLoading(true);
    setHasError(false);
    try {
      const result = await deviceClient.sanitizeSvgContent(content);
      setSanitizedContent(result || "");
      if (!result) {
        setHasError(true);
        console.warn("SVG content was rejected by sanitizer");
      }
    } catch (error) {
      console.error("SVG sanitization failed:", error);
      setSanitizedContent("");
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    sanitizeSvgContent(block.content);
  }, [block.content]);

  return (
    <div
      className={`artifact-dialog-content flex h-full min-h-0 w-full items-stretch justify-center overflow-auto p-4 ${className ?? ""}`}
      data-testid="svg-artifact-root"
    >
      {isLoading && (
        <div className="flex min-h-full w-full flex-1 flex-col items-center justify-center p-8 text-center">
          <Icon icon="lucide:loader-2" className="w-6 h-6 animate-spin text-blue-500" />
          <p className="text-sm text-muted-foreground mt-2">Sanitizing SVG...</p>
        </div>
      )}
      {!isLoading && hasError && (
        <div className="flex min-h-full w-full flex-1 flex-col items-center justify-center p-8 text-center">
          <Icon icon="lucide:alert-triangle" className="w-6 h-6 text-yellow-500" />
          <p className="text-sm text-muted-foreground mt-2">SVG sanitization failed</p>
        </div>
      )}
      {!isLoading && !hasError && sanitizedContent && (
        <div
          className="flex min-h-full w-full flex-1 items-center justify-center [&_svg]:max-h-full [&_svg]:max-w-full [&_svg]:h-auto [&_svg]:w-auto"
          data-testid="svg-artifact-content"
          dangerouslySetInnerHTML={{ __html: sanitizedContent }}
        />
      )}
      {!isLoading && !hasError && !sanitizedContent && (
        <div className="flex min-h-full w-full flex-1 flex-col items-center justify-center p-8 text-center">
          <Icon icon="lucide:image" className="w-6 h-6 text-gray-400" />
          <p className="text-sm text-muted-foreground mt-2">No SVG content</p>
        </div>
      )}
    </div>
  );
}
