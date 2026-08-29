import React from "react";
import { Icon } from "@iconify/react";
import type { DisplayAssistantMessageBlock } from "#/components/chat/messageListItems";
interface MessageBlockVideoProps {
  block: DisplayAssistantMessageBlock;
  messageId?: string;
  threadId?: string;
}
type LegacyVideoBlockContent = {
  data?: string;
  mimeType?: string;
};
const parseVideoDataUri = (
  value: string,
): {
  data: string;
  mimeType: string;
} | null => {
  const match = value.match(/^data:([^;]+);base64,(.*)$/);
  if (!match?.[1] || !match?.[2]) return null;
  if (!match[1].startsWith("video/")) return null;
  return {
    data: match[2],
    mimeType: match[1],
  };
};
const normalizeVideoData = (rawData: string, mimeType?: string) => {
  const trimmed = rawData.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("imgcache://") || trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return {
      data: trimmed,
      mimeType: mimeType?.trim() || "video/mp4",
    };
  }
  const parsed = parseVideoDataUri(trimmed);
  if (parsed) return parsed;
  return {
    data: trimmed,
    mimeType: mimeType?.trim() || "video/mp4",
  };
};
export const MessageBlockVideo: React.FC<MessageBlockVideoProps> = ({ block }) => {
  const [videoError, setVideoError] = React.useState(false);
  const resolvedVideoData = (() => {
    if (block.image_data?.data) {
      return normalizeVideoData(block.image_data.data, block.image_data.mimeType);
    }
    const content = block.content;
    if (content && typeof content === "object" && "data" in (content as LegacyVideoBlockContent)) {
      const legacyContent = content as LegacyVideoBlockContent;
      if (legacyContent.data) {
        return normalizeVideoData(legacyContent.data, legacyContent.mimeType);
      }
    }
    if (typeof content === "string" && content.length > 0) {
      return normalizeVideoData(content);
    }
    return null;
  })();
  const videoSrc = (() => {
    if (!resolvedVideoData) return "";
    const raw = resolvedVideoData.data;
    if (raw.startsWith("imgcache://") || raw.startsWith("http://") || raw.startsWith("https://")) {
      return raw;
    }
    return `data:${resolvedVideoData.mimeType};base64,${raw}`;
  })();
  return (
    <div className="my-1">
      <div className="rounded-lg border bg-card text-card-foreground p-4 w-fit max-w-full">
        <div className="flex flex-col space-y-2 min-w-[320px] max-w-130">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Icon icon="lucide:clapperboard" className="h-4 w-4" />
            <span>Video</span>
          </div>

          {resolvedVideoData ? (
            <>
              <div className="rounded-xl border bg-muted/30 p-2">
                <video
                  src={videoSrc}
                  controls
                  playsInline
                  className="max-h-105 w-full rounded-lg bg-black"
                  onError={() => setVideoError(true)}
                />
              </div>
              <div className="text-[11px] text-muted-foreground break-all">{resolvedVideoData.mimeType}</div>
              {videoError && <div className="text-xs text-red-500">Request failed</div>}
            </>
          ) : (
            <div className="flex items-center justify-center h-40 w-full">
              <Icon icon="lucide:loader-2" className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
