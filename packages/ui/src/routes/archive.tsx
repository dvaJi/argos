import { useEffect, useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "#shadcn/components/ui/button";
import { createDeviceClient } from "#api/DeviceClient";
import ArchiveView from "../views/ArchiveView";

/** Archived threads page (docs/features/thread-archive); same chrome as /usage. */
function ArchiveLayout() {
  const router = useRouter();
  const [isMacOS, setIsMacOS] = useState(false);
  useEffect(() => {
    createDeviceClient()
      .getDeviceInfo()
      .then((info) => setIsMacOS(info.platform === "darwin"))
      .catch(() => setIsMacOS(false));
  }, []);
  return (
    <div data-testid="archive-page" className="flex h-full w-full flex-col bg-background">
      <div
        className={`flex h-9 w-full shrink-0 flex-row justify-start border border-b-0 border-window-inner-border bg-window-background/10 window-drag-region ${isMacOS ? "rounded-t-[10px]" : ""}`}
      >
        <div className="absolute bottom-0 left-0 z-10 h-[1px] w-full bg-border" />
        {!isMacOS && (
          <Button
            variant="ghost"
            className="window-no-drag-region h-9 shrink-0 gap-1.5 rounded-none px-3 text-muted-foreground hover:text-foreground"
            onClick={() => void router.navigate({ to: "/chat" })}
          >
            <ArrowLeft className="size-4" />
            <span className="text-xs font-medium">Back to chat</span>
          </Button>
        )}
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-background">
        <div className="pointer-events-none absolute inset-0 z-10 rounded-b-[10px] border-x border-b border-window-inner-border" />
        <ArchiveView />
      </div>
    </div>
  );
}

export const Route = createFileRoute("/archive")({
  component: ArchiveLayout,
});
