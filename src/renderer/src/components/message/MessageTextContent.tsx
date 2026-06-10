import type { FC } from "react";

interface MessageTextContentProps {
  content: string;
}

export const MessageTextContent: FC<MessageTextContentProps> = ({ content }) => {
  return <div className="text-sm whitespace-pre-wrap break-all">{content}</div>;
};
