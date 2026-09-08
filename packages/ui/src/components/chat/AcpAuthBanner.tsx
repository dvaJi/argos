import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { createProviderClient } from "#api/ProviderClient";
import AcpAuthDialog from "#settings/components/AcpAuthDialog";

const providerClient = createProviderClient();

/**
 * Inline banner shown when an ACP agent fails a session/turn with
 * `auth_required`. Offers the sign-in dialog; clears on success.
 */
export default function AcpAuthBanner({ sessionId }: { sessionId: string }) {
  const [authPrompt, setAuthPrompt] = useState<{ agentId: string; workdir?: string | null } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const offRequired = providerClient.onAcpAuthRequired((payload) => {
      // A banner only makes sense for the conversation the user is looking at.
      if (payload.sessionId && payload.sessionId !== sessionId) return;
      setAuthPrompt({ agentId: payload.agentId, workdir: payload.workdir ?? null });
      setDialogOpen(true);
    });
    const offChanged = providerClient.onAcpAuthChanged((payload) => {
      if (payload.state === "ready") {
        setAuthPrompt(null);
      }
    });
    return () => {
      offRequired();
      offChanged();
    };
  }, [sessionId]);

  if (!authPrompt) return null;

  return (
    <>
      <div
        data-testid="acp-auth-banner"
        className="mx-auto mb-2 flex w-full max-w-4xl items-center justify-between gap-3 rounded-xl border border-amber-600/40 bg-amber-600/10 px-4 py-2.5"
      >
        <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
          <Icon icon="lucide:key-round" className="size-4 shrink-0 text-amber-600" />
          <span className="min-w-0 truncate">
            This agent needs to be signed in before the conversation can continue.
          </span>
        </span>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          Sign in
        </Button>
      </div>
      <AcpAuthDialog
        open={dialogOpen}
        agentId={authPrompt.agentId}
        agentName={authPrompt.agentId}
        workdir={authPrompt.workdir}
        onAuthenticated={() => setAuthPrompt(null)}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}
