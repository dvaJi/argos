import React from 'react'

interface MessageTextContentProps {
  content: string
}

export const MessageTextContent: React.FC<MessageTextContentProps> = ({ content }) => {
  return <div className="text-sm whitespace-pre-wrap break-all">{content}</div>
}
