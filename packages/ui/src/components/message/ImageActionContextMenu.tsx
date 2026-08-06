import type { FC, ReactNode } from "react";
import { Icon } from "@iconify/react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "#shadcn/components/ui/context-menu";
import { useImageActions } from "#/composables/useImageActions";

interface ImageActionContextMenuProps {
  source: string;
  mimeType?: string;
  suggestedName?: string;
  children: ReactNode;
}

export const ImageActionContextMenu: FC<ImageActionContextMenuProps> = ({
  source,
  mimeType,
  suggestedName,
  children,
}) => {
  const { copyImage, saveImage } = useImageActions();

  const getImageActionSource = () => ({
    source,
    mimeType,
    suggestedName,
  });

  const handleCopy = () => {
    void copyImage(getImageActionSource());
  };

  const handleSave = () => {
    void saveImage(getImageActionSource());
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger render={<div className="contents" />}>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        <ContextMenuItem onSelect={handleCopy}>
          <Icon icon="lucide:copy" className="h-4 w-4" />
          Copy Image
        </ContextMenuItem>
        <ContextMenuItem onSelect={handleSave}>
          <Icon icon="lucide:download" className="h-4 w-4" />
          Save As
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
};
