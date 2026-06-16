import { type FC, useMemo } from "react";

interface MessageInfoProps {
  name: string;
  timestamp: number;
}

export const MessageInfo: FC<MessageInfoProps> = ({ name, timestamp }) => {
  const formattedTime = useMemo(() => {
    if (!timestamp) return "";
    const date = new Date(timestamp);
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [timestamp]);

  return (
    <div className="flex flex-row items-center gap-2 h-4">
      <span className="text-xs font-bold text-foreground">{name}</span>
      <span className="text-xs text-text-secondary-foreground">{formattedTime}</span>
    </div>
  );
};
