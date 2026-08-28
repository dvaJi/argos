import { type FC, type KeyboardEvent, useMemo } from "react";
import { Icon } from "@iconify/react";
import type { MessageFile } from "@argos/shared/types/agent-interface";
import { getMimeTypeIcon } from "#/lib/utils";

interface ChatAttachmentItemProps {
  file: MessageFile;
  removable?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
}

const ChatAttachmentItem: FC<ChatAttachmentItemProps> = ({ file, removable = false, onClick, onRemove }) => {
  const mimeType = useMemo(() => file.mimeType || "application/octet-stream", [file.mimeType]);
  const thumbnail = useMemo(() => file.thumbnail || "", [file.thumbnail]);
  const fileIcon = useMemo(() => getMimeTypeIcon(mimeType), [mimeType]);

  return (
    <div
      className="group inline-flex max-w-full items-center gap-2 rounded-full border bg-background/70 px-2.5 py-1 text-xs text-foreground shadow-sm transition-colors hover:bg-accent"
      {...(onClick
        ? {
            role: "button" as const,
            tabIndex: 0,
            onClick,
            onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            },
          }
        : {})}
    >
      {thumbnail ? (
        <img src={thumbnail} className="h-5 w-5 shrink-0 rounded-full border object-cover" alt="attachment" />
      ) : (
        <Icon icon={fileIcon} className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <span className="max-w-[180px] truncate">{file.name}</span>
      {removable && (
        <button
          type="button"
          className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label={`Remove ${file.name}`}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onRemove?.();
          }}
        >
          <Icon icon="lucide:x" className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};

export default ChatAttachmentItem;
