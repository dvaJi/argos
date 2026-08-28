import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { createDeviceClient } from "#api/DeviceClient";

const deviceClient = createDeviceClient();

interface SvgArtifactProps {
  block: { artifact: { type: string; title: string }; content: string };
  className?: string;
}

export function SvgArtifact({ block, className }: SvgArtifactProps) {
  // Last completed sanitization, keyed by the content it was produced for.
  // Loading/error are derived so no synchronous setState is needed in the effect.
  const [sanitized, setSanitized] = useState<{ for: string; result: string; hasError: boolean } | null>(null);

  const isLoading = Boolean(block.content) && sanitized?.for !== block.content;
  const sanitizedContent = !isLoading && block.content ? (sanitized?.result ?? "") : "";
  const hasError = !isLoading && block.content ? (sanitized?.hasError ?? false) : false;

  useEffect(() => {
    let cancelled = false;
    const content = block.content;
    (async () => {
      if (!content) return;
      try {
        const result = await deviceClient.sanitizeSvgContent(content);
        if (cancelled) return;
        if (!result) {
          console.warn("SVG content was rejected by sanitizer");
        }
        setSanitized({ for: content, result: result || "", hasError: !result });
      } catch (error) {
        if (cancelled) return;
        console.error("SVG sanitization failed:", error);
        setSanitized({ for: content, result: "", hasError: true });
      }
    })();
    return () => {
      cancelled = true;
    };
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
