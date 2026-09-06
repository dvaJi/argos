import { type FC, useState } from "react";
import { Icon } from "@iconify/react";
import type { DisplayAssistantMessageBlock } from "#/components/chat/messageListItems";
import { MessageBlockContent } from "./MessageBlockContent";

// ---------------------------------------------------------------------------
// Fold content row — narrative blocks are collapsible: a preview line with a
// chevron, expanding to the full rendered content.
// ---------------------------------------------------------------------------

interface FoldContentRowProps {
  block: DisplayAssistantMessageBlock;
  messageId: string;
  threadId: string;
}
const previewText = (block: DisplayAssistantMessageBlock): string => {
  const text = typeof block.content === "string" ? block.content.trim() : "";
  if (!text) return "";
  const firstLine = text.split("\n")[0] ?? "";
  const compact = firstLine.replace(/\s+/g, " ").trim();
  return compact.length > 120 ? `${compact.slice(0, 119).trimEnd()}…` : compact;
};
export const FoldContentRow: FC<FoldContentRowProps> = ({ block, messageId, threadId }) => {
  // const [isExpanded, setIsExpanded] = useState(false);
  const preview = previewText(block);

  // Empty/non-text content renders as plain content, no collapse affordance.
  if (!preview) {
    return <MessageBlockContent block={block} messageId={messageId} threadId={threadId} />;
  }

  return (
    <div className="flex w-full min-w-0 flex-col my-1">
      <MessageBlockContent block={block} messageId={messageId} threadId={threadId} />
    </div>
  );
  // return (
  //   <div className="flex w-full min-w-0 flex-col">
  //     <button
  //       type="button"
  //       aria-expanded={isExpanded}
  //       onClick={() => setIsExpanded((prev) => !prev)}
  //       className="flex w-full min-w-0 max-w-full items-center gap-2 rounded px-1 py-0.5 text-left text-[12px] select-none leading-5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
  //     >
  //       <Icon
  //         icon="hugeicons:arrow-right-01"
  //         className={`h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform duration-(--dc-motion-fast) ease-(--dc-ease-out-soft) motion-reduce:transition-none ${isExpanded ? "rotate-90" : "rotate-0"}`}
  //       />
  //       <span className="min-w-0 truncate font-medium text-foreground/82">{preview}</span>
  //     </button>
  //     {isExpanded && <MessageBlockContent block={block} messageId={messageId} threadId={threadId} />}
  //   </div>
  // );
};
