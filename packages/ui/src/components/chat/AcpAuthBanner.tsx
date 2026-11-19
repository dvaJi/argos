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
  const [accounts, setAccounts] = useState<
    Array<{ label: string; description?: string | null; active?: boolean | null }>
  >([]);

  useEffect(() => {
    const offRequired = providerClient.onAcpAuthRequired((payload) => {
      // A banner only makes sense for the conversation the user is looking at.
      if (payload.sessionId && payload.sessionId !== sessionId) return;
      setAuthPrompt({ agentId: payload.agentId, workdir: payload.workdir ?? null });
      setDialogOpen(true);
    });
    const offChanged = providerClient.onAcpAuthChanged((payload) => {
      // Only the same agent's success clears the prompt - signing in to a
      // different agent elsewhere must not dismiss an unrelated prompt.
      if (payload.authStatus?.accounts) {
        setAccounts(payload.authStatus.accounts);
      }
      if (payload.state === "ready" && authPrompt?.agentId === payload.agentId) {
        setAuthPrompt(null);
      }
    });
    return () => {
      offRequired();
      offChanged();
    };
  }, [sessionId, authPrompt?.agentId]);

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
            This agent needs to be signed in before the conversation can continue. After signing in, send your message
            again.
          </span>
        </span>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          Sign in
        </Button>
      </div>
      {accounts.length > 0 && (
        <div className="mx-auto mb-2 flex w-full max-w-4xl flex-wrap gap-1.5" data-testid="acp-auth-accounts">
          {accounts.map((account) => (
            <span
              key={account.label}
              title={account.description ?? account.label}
              className="inline-flex items-center gap-1 rounded-full border bg-background/60 px-2.5 py-0.5 text-[11px] text-muted-foreground"
            >
              {account.active && (
                <Icon icon="lucide:check" className="h-3 w-3 text-emerald-600" aria-label="active account" />
              )}
              {account.label}
            </span>
          ))}
        </div>
      )}
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
