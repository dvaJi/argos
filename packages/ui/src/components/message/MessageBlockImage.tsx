import { type FC, useState, useMemo } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "#shadcn/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "#shadcn/components/ui/tooltip";
import type { DisplayAssistantMessageBlock } from "#/components/chat/messageListItems";
import { ImageActionContextMenu } from "./ImageActionContextMenu";
import { useImageActions } from "#/composables/useImageActions";

interface MessageBlockImageProps {
  block: DisplayAssistantMessageBlock;
  messageId?: string;
  threadId?: string;
}

type LegacyImageBlockContent = {
  data?: string;
  mimeType?: string;
};

const inferMimeType = (data: string, mimeType?: string): string => {
  if (mimeType && mimeType.trim().length > 0) return mimeType;
  if (data.startsWith("imgcache://") || data.startsWith("http://") || data.startsWith("https://"))
    return "argos/image-url";
  if (data.startsWith("data:image/")) {
    const match = data.match(/^data:([^;]+);base64,(.*)$/);
    if (match?.[1]) return match[1];
  }
  return "image/png";
};

export const MessageBlockImage: FC<MessageBlockImageProps> = ({ block }) => {
  const [imageError, setImageError] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);
  const { saveImage } = useImageActions();

  const resolvedImageData = useMemo(() => {
    if (block.image_data?.data) {
      const rawData = block.image_data.data;
      if (rawData.startsWith("imgcache://") || rawData.startsWith("http://") || rawData.startsWith("https://")) {
        return { data: rawData, mimeType: "argos/image-url" };
      }

      let normalizedData = rawData;
      let normalizedMimeType = inferMimeType(rawData, block.image_data.mimeType);

      if (rawData.startsWith("data:image/")) {
        const match = rawData.match(/^data:([^;]+);base64,(.*)$/);
        if (match?.[1] && match?.[2]) {
          normalizedMimeType = match[1];
          normalizedData = match[2];
        }
      }

      return { data: normalizedData, mimeType: normalizedMimeType };
    }

    const content = block.content;
    if (content && typeof content === "object" && "data" in (content as LegacyImageBlockContent)) {
      const legacyContent = content as LegacyImageBlockContent;
      if (legacyContent.data) {
        const rawData = legacyContent.data;
        if (rawData.startsWith("imgcache://") || rawData.startsWith("http://") || rawData.startsWith("https://")) {
          return { data: rawData, mimeType: "argos/image-url" };
        }

        let normalizedData = rawData;
        let normalizedMimeType = inferMimeType(rawData, legacyContent.mimeType);

        if (rawData.startsWith("data:image/")) {
          const match = rawData.match(/^data:([^;]+);base64,(.*)$/);
          if (match?.[1] && match?.[2]) {
            normalizedMimeType = match[1];
            normalizedData = match[2];
          }
        }

        return { data: normalizedData, mimeType: normalizedMimeType };
      }
    }

    if (typeof content === "string" && content.length > 0) {
      if (content.startsWith("data:image/")) {
        const match = content.match(/^data:([^;]+);base64,(.*)$/);
        if (match?.[1] && match?.[2]) {
          return { data: match[2], mimeType: match[1] };
        }
      }
      if (content.startsWith("imgcache://") || content.startsWith("http://") || content.startsWith("https://")) {
        return { data: content, mimeType: "argos/image-url" };
      }
      return { data: content, mimeType: inferMimeType(content) };
    }

    return null;
  }, [block.image_data, block.content]);

  const resolvedImageSrc = useMemo(() => {
    if (!resolvedImageData) return "";
    return resolvedImageData.mimeType === "argos/image-url"
      ? resolvedImageData.data
      : `data:${resolvedImageData.mimeType};base64,${resolvedImageData.data}`;
  }, [resolvedImageData]);

  const resolvedImageMimeType = useMemo(() => {
    const mimeType = resolvedImageData?.mimeType;
    return mimeType === "argos/image-url" ? undefined : mimeType;
  }, [resolvedImageData]);

  const openFullImage = () => {
    if (resolvedImageData) setShowFullImage(true);
  };

  const handleSaveImage = () => {
    if (!resolvedImageSrc) return;
    void saveImage({ source: resolvedImageSrc, mimeType: resolvedImageMimeType });
  };

  return (
    <div className="my-1">
      <div className="rounded-lg border bg-card text-card-foreground p-4 w-fit">
        <div className="flex flex-col space-y-2">
          <div className="flex justify-center">
            {resolvedImageData ? (
              <ImageActionContextMenu source={resolvedImageSrc} mimeType={resolvedImageMimeType}>
                <img
                  src={resolvedImageSrc}
                  alt="Generated image"
                  className="max-w-[400px] rounded-md cursor-pointer hover:shadow-md transition-shadow"
                  onClick={openFullImage}
                  onError={() => setImageError(true)}
                />
              </ImageActionContextMenu>
            ) : imageError ? (
              <div className="text-sm text-red-500 p-4">Request failed</div>
            ) : (
              <div className="flex items-center justify-center h-40 w-full">
                <Icon icon="lucide:loader-2" className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={showFullImage} onOpenChange={setShowFullImage}>
        <DialogContent className="sm:max-w-[800px] p-3 bg-background border-0 shadow-none focus:outline-none">
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center justify-between gap-2 pr-8">
                <span>Image</span>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
                        onClick={handleSaveImage}
                      />
                    }
                  >
                    <Icon icon="lucide:download" className="h-4 w-4" />
                  </TooltipTrigger>
                  <TooltipContent>Save</TooltipContent>
                </Tooltip>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center">
            {resolvedImageData && (
              <ImageActionContextMenu source={resolvedImageSrc} mimeType={resolvedImageMimeType}>
                <img
                  src={resolvedImageSrc}
                  alt="Generated image"
                  className="rounded-md max-h-[80vh] max-w-full object-contain"
                />
              </ImageActionContextMenu>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
