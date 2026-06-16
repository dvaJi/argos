import type { FC } from "react";

interface MessageItemPlaceholderProps {
  messageId: string;
  height?: number;
}

export const MessageItemPlaceholder: FC<MessageItemPlaceholderProps> = ({ messageId, height }) => {
  return (
    <div data-message-id={messageId} className="px-4 py-3" style={height ? { height: `${height}px` } : undefined}>
      <div className="flex items-center gap-2 mb-2">
        <div className="h-4 w-4 rounded-sm bg-muted/60 animate-pulse" />
        <div className="h-3 w-24 rounded bg-muted/40 animate-pulse" />
      </div>
      <div className="space-y-2">
        <div className="h-3 w-full rounded bg-muted/40 animate-pulse" />
        <div className="h-3 w-5/6 rounded bg-muted/40 animate-pulse" />
      </div>
    </div>
  );
};
