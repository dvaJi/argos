import { useMemo } from "react";
import type { DisplayAssistantMessageBlock } from "#/components/chat/messageListItems";

export interface ProcessedPart {
  type: "text" | "thinking" | "artifact" | "tool_call";
  content: string;
  loading?: boolean;
  artifact?: {
    identifier: string;
    title: string;
    type:
      | "application/vnd.ant.code"
      | "text/markdown"
      | "text/html"
      | "image/svg+xml"
      | "application/vnd.ant.mermaid"
      | "application/vnd.ant.react";
    language?: string;
  };
  tool_call?: {
    status: "calling" | "response" | "end" | "error";
    name?: string;
    error?: string;
  };
}

export interface ParsedArtifactPart {
  identifier: string;
  title: string;
  type:
    | "application/vnd.ant.code"
    | "text/markdown"
    | "text/html"
    | "image/svg+xml"
    | "application/vnd.ant.mermaid"
    | "application/vnd.ant.react";
  language?: string;
  content: string;
  loading: boolean;
}

type ArtifactType =
  | "application/vnd.ant.code"
  | "text/markdown"
  | "text/html"
  | "image/svg+xml"
  | "application/vnd.ant.mermaid"
  | "application/vnd.ant.react";
type ArtifactSourceBlock = Pick<DisplayAssistantMessageBlock, "content" | "status">;

export const useBlockContent = (props: { block: ArtifactSourceBlock }) => {
  const processedContent = useMemo<ProcessedPart[]>(() => {
    const bc = typeof props.block.content === "string" ? props.block.content : "";
    return bc ? generatePart(bc, props.block.status) : [{ type: "text", content: "" }];
  }, [props.block.content, props.block.status]);

  return {
    processedContent,
  };
};

export function extractArtifactsFromContent(
  content: string,
  status: DisplayAssistantMessageBlock["status"],
): ParsedArtifactPart[] {
  return generatePart(content, status)
    .filter(
      (
        part,
      ): part is ProcessedPart & {
        type: "artifact";
        artifact: NonNullable<ProcessedPart["artifact"]>;
      } => {
        return part.type === "artifact" && Boolean(part.artifact);
      },
    )
    .map((part) => ({
      identifier: part.artifact.identifier,
      title: part.artifact.title,
      type: part.artifact.type,
      language: part.artifact.language,
      content: part.content,
      loading: Boolean(part.loading),
    }));
}

function parseAttributes(attributesStr?: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  if (!attributesStr) return attributes;

  const attributeRegex = /(\w+)="([^"]*)"/g;
  let attrMatch: RegExpExecArray | null;
  while ((attrMatch = attributeRegex.exec(attributesStr)) !== null) {
    const [, name, value] = attrMatch;
    attributes[name] = value;
  }
  return attributes;
}

function generatePart(content: string, status: DisplayAssistantMessageBlock["status"]): ProcessedPart[] {
  const parts: ProcessedPart[] = [];

  const tagPatterns = [
    {
      name: "thinking",
      regex: /<antThinking>(.*?)<\/antThinking>/s,
      process: (match: RegExpExecArray) => ({
        type: "thinking" as const,
        content: match[1].trim(),
        loading: false,
      }),
    },
    {
      name: "thinking-unclosed",
      regex: /<antThinking>([^<]*)/s,
      process: (match: RegExpExecArray) => ({
        type: "thinking" as const,
        content: match[1].trim(),
        loading: false,
      }),
    },
    {
      name: "artifact",
      regex: /<antArtifact\s+([^>]*)>([\s\S]*?)<\/antArtifact>/s,
      process: (match: RegExpExecArray) => {
        const attributesStr = match[1];
        const content = match[2].trim();
        const attributes = parseAttributes(attributesStr);

        return {
          type: "artifact" as const,
          content,
          loading: false,
          artifact: {
            identifier: attributes.identifier || "",
            title: attributes.title || "",
            type: (attributes.type || "text/markdown") as ArtifactType,
            language: attributes.language,
          },
        };
      },
    },
    {
      name: "artifact-unclosed",
      regex:
        /<antArtifact\s+(?=.*\btype="([^"]+)")(?=.*\bidentifier="([^"]+)")(?=.*\btitle="([^"]+)")(?:\s+language="([^"]+)")?\s*(?:[^>]*?)>([\s\S]*)/s,
      process: (match: RegExpExecArray) => {
        const openingTag = match[0].substring(0, match[0].indexOf(">") + 1);
        const typeMatch = openingTag.match(/type="([^"]+)"/);
        const identifierMatch = openingTag.match(/identifier="([^"]+)"/);
        const titleMatch = openingTag.match(/title="([^"]+)"/);
        const languageMatch = openingTag.match(/language="([^"]+)"/);

        const content = match[5] ? match[5].trim() : "";

        return {
          type: "artifact" as const,
          content,
          loading: true,
          artifact: {
            identifier: identifierMatch ? identifierMatch[1] : "",
            title: titleMatch ? titleMatch[1] : "",
            type: typeMatch ? (typeMatch[1] as ArtifactType) : "text/markdown",
            language: languageMatch ? languageMatch[1] : undefined,
          },
        };
      },
    },
    {
      name: "tool_call",
      regex: /<tool_call(?:\s+([^>]*))?>/,
      process: (match: RegExpExecArray) => {
        const attributes = parseAttributes(match[1]);
        return {
          type: "tool_call" as const,
          content: "",
          loading: true,
          tool_call: {
            status: "calling" as const,
            name: attributes?.name,
            error: attributes?.error,
          },
        };
      },
    },
    {
      name: "tool_response",
      regex: /<tool_response(?:\s+([^>]*))?>/,
      process: null,
    },
    {
      name: "tool_call_end",
      regex: /<tool_call_end(?:\s+([^>]*))?>/,
      process: null,
    },
    {
      name: "tool_call_error",
      regex: /<tool_call_error(?:\s+([^>]*))?>/,
      process: null,
    },
    {
      name: "maximum_tool_calls_reached",
      regex: /<maximum_tool_calls_reached(?:\s+([^>]*))?>/,
      process: null,
    },
  ];
  const toolRelatedPatterns = [
    "tool_response",
    "tool_call_end",
    "tool_call_error",
    "tool_call",
    "maximum_tool_calls_reached",
  ];

  let currentPosition = 0;
  let currentToolCallIndex = -1;

  while (currentPosition < content.length) {
    let earliestMatch: {
      index: number;
      pattern: (typeof tagPatterns)[0];
      match: RegExpExecArray;
    } | null = null;

    for (const pattern of tagPatterns) {
      if (
        status === "loading" &&
        ["tool_call", "tool_response", "tool_call_end", "tool_call_error", "maximum_tool_calls_reached"].includes(
          pattern.name,
        )
      ) {
        continue;
      }

      const regex = new RegExp(pattern.regex);
      const match = regex.exec(content.substring(currentPosition));

      if (match) {
        const index = match.index + currentPosition;

        if (!earliestMatch || index < earliestMatch.index) {
          earliestMatch = { index, pattern, match };
        }
      }
    }

    if (earliestMatch) {
      if (earliestMatch.index > currentPosition) {
        const text = content.substring(currentPosition, earliestMatch.index).trim();
        if (text) {
          parts.push({
            type: "text",
            content: text,
          });
        }
      }

      const { pattern, match } = earliestMatch;

      if (pattern.name === "tool_call") {
        const tagEndIndex = content.indexOf(">", earliestMatch.index) + 1;

        let nextToolTagIndex = content.length;

        for (const tagName of toolRelatedPatterns) {
          const nextTagRegex = new RegExp(`<${tagName}(?:\\s+([^>]*))?>`);
          const nextMatch = nextTagRegex.exec(content.substring(tagEndIndex));

          if (nextMatch) {
            const index = nextMatch.index + tagEndIndex;
            if (index < nextToolTagIndex) {
              nextToolTagIndex = index;
            }
          }
        }

        const toolCallContent = content.substring(tagEndIndex, nextToolTagIndex).trim();

        const attributes = parseAttributes(match[1]);
        parts.push({
          type: "tool_call",
          content: toolCallContent,
          loading: true,
          tool_call: {
            status: "calling",
            name: attributes?.name,
            error: attributes?.error,
          },
        });

        currentToolCallIndex = parts.length - 1;
        currentPosition = nextToolTagIndex;
      } else if (pattern.name === "tool_response") {
        if (currentToolCallIndex !== -1 && parts[currentToolCallIndex].type === "tool_call") {
          const tagEndIndex = content.indexOf(">", earliestMatch.index) + 1;

          let nextToolTagIndex = content.length;

          for (const tagName of toolRelatedPatterns) {
            const nextTagRegex = new RegExp(`<${tagName}(?:\\s+([^>]*))?>`);
            const nextMatch = nextTagRegex.exec(content.substring(tagEndIndex));

            if (nextMatch) {
              const index = nextMatch.index + tagEndIndex;
              if (index < nextToolTagIndex) {
                nextToolTagIndex = index;
              }
            }
          }

          const responseContent = content.substring(tagEndIndex, nextToolTagIndex).trim();

          parts[currentToolCallIndex].content += "\n" + responseContent;
          parts[currentToolCallIndex].tool_call!.status = "response";

          const attributes = parseAttributes(match[1]);
          if (attributes) {
            if (attributes.name) {
              parts[currentToolCallIndex].tool_call!.name = attributes.name;
            }
            if (attributes.error) {
              parts[currentToolCallIndex].tool_call!.error = attributes.error;
            }
          }

          currentPosition = nextToolTagIndex;
        } else {
          currentPosition = content.indexOf(">", earliestMatch.index) + 1;
        }
      } else if (pattern.name === "tool_call_end") {
        if (
          currentToolCallIndex !== -1 &&
          parts[currentToolCallIndex].type === "tool_call" &&
          parts[currentToolCallIndex].tool_call!.status !== "end"
        ) {
          parts[currentToolCallIndex].loading = false;
          parts[currentToolCallIndex].tool_call!.status = "end";

          const attributes = parseAttributes(match[1]);
          if (attributes) {
            if (attributes.name) {
              parts[currentToolCallIndex].tool_call!.name = attributes.name;
            }
            if (attributes.error) {
              parts[currentToolCallIndex].tool_call!.error = attributes.error;
            }
          }
        } else {
          const attributes = parseAttributes(match[1]);
          parts.push({
            type: "tool_call",
            content: "",
            loading: false,
            tool_call: {
              status: "end",
              name: attributes?.name,
              error: attributes?.error,
            },
          });
          currentToolCallIndex = parts.length - 1;
        }

        currentPosition = content.indexOf(">", earliestMatch.index) + 1;
      } else if (pattern.name === "tool_call_error") {
        if (
          currentToolCallIndex !== -1 &&
          parts[currentToolCallIndex].type === "tool_call" &&
          parts[currentToolCallIndex].tool_call!.status !== "end"
        ) {
          parts[currentToolCallIndex].loading = false;
          parts[currentToolCallIndex].tool_call!.status = "error";

          const attributes = parseAttributes(match[1]);
          if (attributes) {
            if (attributes.name) {
              parts[currentToolCallIndex].tool_call!.name = attributes.name;
            }
            if (attributes.error) {
              parts[currentToolCallIndex].tool_call!.error = attributes.error;
            }
          }
        } else {
          const attributes = parseAttributes(match[1]);
          parts.push({
            type: "tool_call",
            content: "",
            loading: false,
            tool_call: {
              status: "error",
              name: attributes?.name,
              error: attributes?.error,
            },
          });
          currentToolCallIndex = parts.length - 1;
        }

        currentPosition = content.indexOf(">", earliestMatch.index) + 1;
      } else if (pattern.name === "maximum_tool_calls_reached") {
        parts.push({
          type: "text",
          content: "Maximum tool calls reached",
        });
        currentPosition = content.indexOf(">", earliestMatch.index) + 1;
      } else if (pattern.process) {
        parts.push(pattern.process(match));

        if (pattern.name.includes("unclosed")) {
          if (pattern.name === "artifact-unclosed") {
            currentPosition = content.length;
          } else {
            currentPosition = earliestMatch.index + match[0].length;
          }
        } else {
          const fullTagLength =
            pattern.name === "thinking"
              ? match[0].length
              : content
                  .substring(earliestMatch.index)
                  .indexOf("</ant" + pattern.name.charAt(0).toUpperCase() + pattern.name.slice(1) + ">") +
                ("</ant" + pattern.name.charAt(0).toUpperCase() + pattern.name.slice(1) + ">").length;

          currentPosition = earliestMatch.index + fullTagLength;
        }
      } else {
        currentPosition = earliestMatch.index + 1;
      }
    } else {
      const remainingText = content.substring(currentPosition).trim();
      if (remainingText) {
        parts.push({
          type: "text",
          content: remainingText,
        });
      }
      break;
    }
  }

  if (parts.length === 0) {
    return [
      {
        type: "text",
        content: content,
      },
    ];
  }

  return parts;
}
