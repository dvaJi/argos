import { type FC, useEffect, useMemo, useRef, memo } from "react";
import { useBlockContent, type ProcessedPart } from "#/composables/useArtifacts";
import { completeArtifact, syncArtifact } from "#/stores/artifact";
import { ArtifactThinking } from "../artifacts/ArtifactThinking";
import { ArtifactPreview } from "../artifacts/ArtifactPreview";
import { ToolCallPreview } from "../artifacts/ToolCallPreview";
import { MarkdownRenderer } from "#/components/markdown/MarkdownRenderer";
import type { DisplayAssistantMessageBlock } from "#/components/chat/messageListItems";

interface MessageBlockContentProps {
  block: DisplayAssistantMessageBlock;
  messageId: string;
  threadId: string;
}

const MessageBlockContentBase: FC<MessageBlockContentProps> = ({ block, messageId, threadId }) => {
  const propsRef = useRef({ block, messageId, threadId });
  useEffect(() => {
    propsRef.current = { block, messageId, threadId };
  }, [block, messageId, threadId]);

  const { processedContent } = useBlockContent({ block });

  const shouldSmoothStream = useMemo(() => block.status === "pending" || block.status === "loading", [block.status]);

  const linkContext = useMemo(() => ({ source: "chat" as const, sessionId: threadId }), [threadId]);

  const lastArtifactSnapshot = useRef<string>("");

  const artifactSnapshot = useMemo(
    () =>
      processedContent
        .filter(
          (
            part,
          ): part is ProcessedPart & {
            type: "artifact";
            artifact: NonNullable<ProcessedPart["artifact"]>;
          } => part.type === "artifact" && Boolean(part.artifact),
        )
        .map((part) => {
          const artifact = part.artifact;
          return [
            artifact.identifier,
            artifact.title,
            artifact.type,
            artifact.language || "",
            part.loading ? "1" : "0",
            part.content,
          ].join("::");
        })
        .join("\n__artifact__\n"),
    [processedContent],
  );

  useEffect(() => {
    if (artifactSnapshot === lastArtifactSnapshot.current) return;
    lastArtifactSnapshot.current = artifactSnapshot;

    const currentProps = propsRef.current;

    for (const part of processedContent) {
      const artifact = part.type === "artifact" && part.artifact;
      if (!artifact) continue;
      const { title, type } = artifact;
      const { content, loading } = part;
      if (currentProps.block.status === "loading") {
        const status = loading ? "loading" : "loaded";
        const nextArtifact = {
          id: artifact.identifier,
          type,
          title,
          language: artifact.language,
          content,
          status,
        } as const;

        if (loading) {
          syncArtifact(nextArtifact, currentProps.messageId, currentProps.threadId);
        } else {
          completeArtifact(nextArtifact, currentProps.messageId, currentProps.threadId);
        }
      } else {
        completeArtifact(
          {
            id: artifact.identifier,
            type,
            title: artifact.title,
            language: artifact.language,
            content,
            status: "loaded",
          },
          currentProps.messageId,
          currentProps.threadId,
        );
      }
    }
  }, [artifactSnapshot, processedContent]);

  return (
    <>
      {processedContent.map((part, index) => {
        if (part.type === "text") {
          return (
            <MarkdownRenderer
              key={index}
              content={part.content}
              smoothStreaming={shouldSmoothStream}
              messageId={messageId}
              threadId={threadId}
              linkContext={linkContext}
            />
          );
        }

        if (part.type === "thinking" && part.loading) {
          return <ArtifactThinking key={index} />;
        }

        if (part.type === "artifact" && part.artifact) {
          return (
            <div key={index} className="my-1">
              <ArtifactPreview
                block={{ content: part.content, artifact: part.artifact }}
                messageId={messageId}
                threadId={threadId}
                loading={part.loading}
              />
            </div>
          );
        }

        if (part.type === "tool_call" && part.tool_call) {
          return (
            <div key={index} className="my-1">
              <ToolCallPreview block={part} blockStatus={block.status} />
            </div>
          );
        }

        return null;
      })}
    </>
  );
};

export const MessageBlockContent = memo(MessageBlockContentBase);
