import { useState, useCallback, useEffect } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "#shadcn/components/ui/button";
import { createDeviceClient } from "#api/DeviceClient";
import UsageView from "../views/UsageView";

function UsageLayout() {
  const router = useRouter();
  const [isMacOS, setIsMacOS] = useState(false);

  useEffect(() => {
    const deviceClient = createDeviceClient();
    deviceClient
      .getDeviceInfo()
      .then((info) => setIsMacOS(info.platform === "darwin"))
      .catch(() => setIsMacOS(false));
  }, []);

  const navigateBack = useCallback(() => {
    void router.navigate({ to: "/chat" });
  }, [router]);

  return (
    <div data-testid="usage-page" className="flex h-full w-full flex-col bg-background">
      <div
        className={`flex h-9 w-full shrink-0 flex-row justify-start border border-b-0 border-window-inner-border bg-window-background/10 window-drag-region ${
          isMacOS ? "rounded-t-[10px]" : ""
        }`}
      >
        <div className="absolute bottom-0 left-0 z-10 h-[1px] w-full bg-border" />
        {!isMacOS && (
          <Button
            variant="ghost"
            className="window-no-drag-region h-9 shrink-0 gap-1.5 rounded-none px-3 text-muted-foreground hover:text-foreground"
            onClick={navigateBack}
          >
            <ArrowLeft className="size-4" />
            <span className="text-xs font-medium">Back to chat</span>
          </Button>
        )}
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-background">
        <div className="absolute inset-0 z-10 pointer-events-none border-x border-b border-window-inner-border rounded-b-[10px]" />
        <UsageView />
      </div>
    </div>
  );
}

export const Route = createFileRoute("/usage")({
  component: UsageLayout,
});
