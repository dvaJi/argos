import { type FC } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
interface McpJsonViewerProps {
  content: string;
  loading?: boolean;
  title?: string;
  readonly?: boolean;
  onCopy?: () => void;
  onFormat?: () => void;
}
const McpJsonViewer: FC<McpJsonViewerProps> = ({
  content,
  loading = false,
  title,
  readonly = false,
  onCopy,
  onFormat,
}) => {
  const isJsonContent = (() => {
    if (!content) return false;
    try {
      JSON.parse(content);
      return true;
    } catch {
      return false;
    }
  })();
  const jsonParts = (() => {
    if (!isJsonContent || !content) return [];
    try {
      const formattedJson = JSON.stringify(JSON.parse(content), null, 2);
      const parts: Array<{
        type: string;
        content: string;
      }> = [];
      const regex = /"([^"]+)":|"([^"]+)"|-?\d+\.?\d*|true|false|null|[[\]{}:,]/g;
      let match;
      let lastIndex = 0;
      while ((match = regex.exec(formattedJson)) !== null) {
        if (match.index > lastIndex) {
          parts.push({
            type: "whitespace",
            content: formattedJson.substring(lastIndex, match.index),
          });
        }
        const value = match[0];
        if (value.endsWith(":")) {
          parts.push({
            type: "key",
            content: value,
          });
        } else if (value.startsWith('"')) {
          parts.push({
            type: "string",
            content: value,
          });
        } else if (/^-?\d+\.?\d*$/.test(value)) {
          parts.push({
            type: "number",
            content: value,
          });
        } else if (value === "true" || value === "false") {
          parts.push({
            type: "boolean",
            content: value,
          });
        } else if (value === "null") {
          parts.push({
            type: "null",
            content: value,
          });
        } else if (/^[[\]{}:,]$/.test(value)) {
          parts.push({
            type: "bracket",
            content: value,
          });
        } else {
          parts.push({
            type: "other",
            content: value,
          });
        }
        lastIndex = regex.lastIndex;
      }
      if (lastIndex < formattedJson.length) {
        parts.push({
          type: "whitespace",
          content: formattedJson.substring(lastIndex),
        });
      }
      return parts;
    } catch {
      return [
        {
          type: "text",
          content,
        },
      ];
    }
  })();
  const getJsonPartClass = (type: string): string => {
    switch (type) {
      case "key":
        return "json-key";
      case "string":
        return "json-string";
      case "number":
        return "json-number";
      case "boolean":
        return "json-boolean";
      case "null":
        return "json-null";
      case "bracket":
        return "json-bracket";
      default:
        return "";
    }
  };
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(content);
      onCopy?.();
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };
  return (
    <div className="w-full">
      {(title || !readonly) && (
        <div className="flex items-center justify-between mb-3">
          {title && <h4 className="text-sm font-medium text-foreground">{title}</h4>}
          {!readonly && (
            <div className="flex space-x-2">
              {isJsonContent && (
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onFormat}>
                  <Icon icon="lucide:align-left" className="mr-1 h-3 w-3" />
                  Format
                </Button>
              )}
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={copyToClipboard}>
                <Icon icon="lucide:copy" className="mr-1 h-3 w-3" />
                Copy
              </Button>
            </div>
          )}
        </div>
      )}

      <div className="relative border border-border/50 rounded-lg overflow-hidden bg-muted/20">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Icon icon="lucide:loader" className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && !content && (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <div className="text-center">
              <Icon icon="lucide:file-text" className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No content</p>
            </div>
          </div>
        )}

        {!loading && content && (
          <div className="max-h-96 overflow-auto">
            {isJsonContent && (
              <div
                className="json-viewer p-4"
                style={{
                  fontFamily: "var(--dc-code-font-family)",
                  lineHeight: 1.6,
                  fontSize: "13px",
                  whiteSpace: "pre",
                  background: "transparent",
                }}
              >
                {jsonParts.map((part, index) => (
                  <span key={index} className={getJsonPartClass(part.type)}>
                    {part.content}
                  </span>
                ))}
              </div>
            )}

            {!isJsonContent && (
              <pre
                className="text-content p-4 whitespace-pre-wrap break-words text-sm font-mono"
                style={{
                  fontFamily: "var(--dc-code-font-family)",
                  lineHeight: 1.6,
                  color: "var(--foreground)",
                  background: "transparent",
                }}
              >
                {content}
              </pre>
            )}
          </div>
        )}
      </div>

      <style>{`
        .json-key { color: hsl(var(--primary)); font-weight: 600; }
        .json-string { color: hsl(142, 76%, 36%); }
        .json-number { color: hsl(39, 100%, 50%); }
        .json-boolean { color: hsl(221, 83%, 53%); font-weight: 600; }
        .json-null { color: hsl(var(--destructive)); font-style: italic; font-weight: 600; }
        .json-bracket { color: var(--foreground); font-weight: 600; }
        :global(.dark) .json-string { color: hsl(142, 52%, 52%); }
        :global(.dark) .json-number { color: hsl(39, 80%, 60%); }
        :global(.dark) .json-boolean { color: hsl(221, 68%, 68%); }
      `}</style>
    </div>
  );
};
export default McpJsonViewer;
