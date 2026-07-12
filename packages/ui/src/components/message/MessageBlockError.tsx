import { type FC, useState } from "react";
import { Icon } from "@iconify/react";
import type { DisplayAssistantMessageBlock } from "#/components/chat/messageListItems";

interface MessageBlockErrorProps {
  block: DisplayAssistantMessageBlock;
}

export const MessageBlockError: FC<MessageBlockErrorProps> = ({ block }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const errorExplanation = (() => {
    const content = block.content || "";
    if (content.includes("400")) return "Bad request (400)";
    if (content.includes("401")) return "Unauthorized (401)";
    if (content.includes("403")) return "Forbidden (403)";
    if (content.includes("404")) return "Not found (404)";
    if (content.includes("429")) return "Rate limited (429)";
    if (content.includes("500")) return "Server error (500)";
    if (content.includes("502")) return "Bad gateway (502)";
    if (content.includes("503")) return "Service unavailable (503)";
    if (content.includes("504")) return "Gateway timeout (504)";
    return "";
  })();

  if (block.status === "cancel") {
    return (
      <div className="text-muted-foreground text-sm flex flex-row gap-2 items-center py-2">
        <Icon icon="lucide:refresh-cw-off" />
        <span>{block.content || ""}</span>
      </div>
    );
  }

  return (
    <div className="cursor-default select-none">
      <div className="text-xs text-red-500 flex flex-row items-center group" onClick={() => setIsExpanded(!isExpanded)}>
        Request failed
        <Icon
          className={`hidden group-hover:block ml-2 transition-all${isExpanded ? " rotate-90" : ""}`}
          icon="lucide:chevron-right"
        />
      </div>
      {isExpanded && (
        <div className="text-xs max-w-full break-all whitespace-pre-wrap leading-7 text-red-400">
          {block.content || ""}
        </div>
      )}
      {errorExplanation && <div className="mt-2 text-red-400 font-medium">Cause of error: {errorExplanation}</div>}
    </div>
  );
};
