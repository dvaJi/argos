import type { FC } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@shadcn/components/ui/button";

interface MessageActionButtonsProps {
  showCleanButton: boolean;
  showScrollButton: boolean;
  showWorkspaceButton?: boolean;
  onClean?: () => void;
  onScrollToBottom?: () => void;
  onOpenWorkspace?: () => void;
}

export const MessageActionButtons: FC<MessageActionButtonsProps> = ({
  showCleanButton,
  showScrollButton,
  showWorkspaceButton,
  onClean,
  onScrollToBottom,
  onOpenWorkspace,
}) => {
  return (
    <div className="absolute bottom-3 right-3 flex flex-col items-center gap-2 will-change-transform">
      {showWorkspaceButton && (
        <Button
          variant="outline"
          size="icon"
          className="w-8 h-8 shrink-0 opacity-100 bg-card backdrop-blur-lg z-30"
          title="Workspace"
          onClick={onOpenWorkspace}
        >
          <Icon icon="lucide:layout-dashboard" className="w-5 h-5 text-foreground" />
        </Button>
      )}

      {showCleanButton && (
        <Button
          variant="outline"
          size="icon"
          className="w-8 h-8 shrink-0 opacity-100 bg-card backdrop-blur-lg z-20"
          onClick={onClean}
        >
          <Icon icon="lucide:brush-cleaning" className="w-6 h-6 text-foreground" />
        </Button>
      )}

      {showScrollButton && (
        <Button
          variant="outline"
          size="icon"
          className="w-8 h-8 shrink-0 relative z-10 backdrop-blur-lg"
          onClick={onScrollToBottom}
        >
          <Icon icon="lucide:arrow-down" className="w-5 h-5 text-foreground" />
        </Button>
      )}
    </div>
  );
};
