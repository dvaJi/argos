import { type FC, useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "#shadcn/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "#shadcn/components/ui/tooltip";
import type { ToolCallImagePreview } from "@argos/shared/types/core/mcp";
import { ImageActionContextMenu } from "./ImageActionContextMenu";
import { useImageActions } from "#/composables/useImageActions";

interface MessageBlockToolCallImagePreviewProps {
  previews: ToolCallImagePreview[];
}

const resolveImageSrc = (preview: ToolCallImagePreview): string => {
  const data = preview.data?.trim() ?? "";
  const hasSafeScheme =
    data.startsWith("data:image/") ||
    data.startsWith("imgcache://") ||
    data.startsWith("http://") ||
    data.startsWith("https://");

  if (hasSafeScheme) return data;
  if (preview.mimeType === "argos/image-url") return "";
  return `data:${preview.mimeType || "image/png"};base64,${data}`;
};

export const MessageBlockToolCallImagePreview: FC<MessageBlockToolCallImagePreviewProps> = ({ previews }) => {
  const { saveImage } = useImageActions();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const failedImagesRef = useRef<Set<string>>(new Set());

  const selectedPreview = useMemo(
    () => (selectedIndex === null ? null : (previews[selectedIndex] ?? null)),
    [selectedIndex, previews],
  );

  const selectedPreviewSrc = useMemo(
    () => (selectedPreview ? resolveImageSrc(selectedPreview) : ""),
    [selectedPreview],
  );

  const selectedPreviewMimeType = useMemo(() => {
    const mimeType = selectedPreview?.mimeType;
    return mimeType === "argos/image-url" ? undefined : mimeType;
  }, [selectedPreview]);

  const openPreview = (index: number) => {
    const preview = previews[index];
    if (!preview || failedImagesRef.current.has(preview.id || String(index))) return;
    setSelectedIndex(index);
  };

  const handleDialogOpenChange = (open: boolean) => {
    if (!open) setSelectedIndex(null);
  };

  const handleImageError = (id: string) => {
    failedImagesRef.current.add(id);
  };

  const handleSaveSelectedPreview = () => {
    if (!selectedPreview || !selectedPreviewSrc) return;
    void saveImage({ source: selectedPreviewSrc, mimeType: selectedPreviewMimeType });
  };

  return (
    <div data-testid="tool-call-image-preview" className="space-y-2 flex-1 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <h5 className="text-xs font-medium text-accent-foreground flex flex-row gap-2 items-center">
          <Icon icon="lucide:image" className="w-4 h-4 text-foreground" />
          Image Preview
        </h5>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2">
        {previews.map((preview, index) => (
          <ImageActionContextMenu
            key={preview.id}
            source={resolveImageSrc(preview)}
            mimeType={preview.mimeType === "argos/image-url" ? undefined : preview.mimeType}
          >
            <button
              type="button"
              data-testid="tool-call-image-preview-item"
              className="group overflow-hidden rounded-lg border bg-background text-left transition-shadow hover:shadow-md"
              onClick={() => openPreview(index)}
            >
              <div className="flex aspect-video items-center justify-center bg-muted/40">
                <img
                  src={resolveImageSrc(preview)}
                  alt={preview.title || "Image Preview"}
                  className="max-h-full max-w-full object-contain"
                  onError={() => handleImageError(preview.id || String(index))}
                />
              </div>
              {preview.title && (
                <div className="truncate border-t px-2 py-1.5 text-[11px] text-muted-foreground" title={preview.title}>
                  {preview.title}
                </div>
              )}
            </button>
          </ImageActionContextMenu>
        ))}
      </div>

      <Dialog open={selectedPreview !== null} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-[800px] p-3 bg-background border-0 shadow-none focus:outline-none">
          <DialogHeader>
            <DialogTitle>
              <div className="flex items-center justify-between gap-2 pr-8">
                <span>{selectedPreview?.title || "Image Preview"}</span>
                {selectedPreview && (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground"
                          onClick={handleSaveSelectedPreview}
                        />
                      }
                    >
                      <Icon icon="lucide:download" className="h-4 w-4" />
                    </TooltipTrigger>
                    <TooltipContent>Save</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center">
            {selectedPreview && (
              <ImageActionContextMenu source={selectedPreviewSrc} mimeType={selectedPreviewMimeType}>
                <img
                  src={selectedPreviewSrc}
                  alt={selectedPreview.title || "Image Preview"}
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
