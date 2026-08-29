import { type FC } from "react";
import { Icon } from "@iconify/react";
import type {
  DisplayUserMessageCodeBlock,
  DisplayUserMessageMentionBlock,
  DisplayUserMessageTextBlock,
} from "#/components/chat/messageListItems";
import { useLanguageStore } from "#/stores/language";
const MENTION_ICON_MAP: Record<string, string> = {
  context: "lucide:quote",
  prompts: "lucide:message-square-quote",
  files: "lucide:file-text",
  tools: "lucide:wrench",
  skills: "lucide:sparkles",
  users: "lucide:user",
  channels: "lucide:hash",
  projects: "lucide:folder",
  documents: "lucide:file-text",
  resources: "lucide:database",
  default: "lucide:at-sign",
};
type ContentBlock = DisplayUserMessageTextBlock | DisplayUserMessageMentionBlock | DisplayUserMessageCodeBlock;
interface MessageContentProps {
  content: ContentBlock[];
  onMentionClick?: (block: DisplayUserMessageMentionBlock) => void;
}
const getMentionIcon = (category: string) => {
  return MENTION_ICON_MAP[category] || MENTION_ICON_MAP.default;
};
const getMentionLabel = (block: DisplayUserMessageMentionBlock) => {
  if (block.category === "prompts") return block.id || block.content;
  if (block.category === "context") return block.id || block.category;
  return block.content;
};
const getMentionTitle = (block: DisplayUserMessageMentionBlock) => {
  if (block.category === "context") return block.id || "";
  return block.content;
};
export const MessageContent: FC<MessageContentProps> = ({ content, onMentionClick }) => {
  const langState = useLanguageStore();
  const contentBlocks = content || [];
  return (
    <div className="text-sm whitespace-pre-wrap break-all" dir={langState.dir}>
      {contentBlocks.map((block, index) => {
        if (block.type === "text") {
          return <span key={index}>{block.content}</span>;
        }
        if (block.type === "mention") {
          return (
            <button
              type="button"
              key={index}
              className="cursor-pointer px-1.5 py-0.5 text-xs rounded-md bg-blue-200/80 dark:bg-secondary text-foreground inline-flex items-center gap-1 max-w-64 align-sub truncate"
              title={getMentionTitle(block)}
              onClick={() => onMentionClick?.(block)}
            >
              <Icon icon={getMentionIcon(block.category)} className="w-3 h-3 shrink-0" />
              <span className="truncate">{getMentionLabel(block)}</span>
            </button>
          );
        }
        if (block.type === "code") {
          return (
            <code key={index} className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
              {block.content}
            </code>
          );
        }
        return null;
      })}
    </div>
  );
};
