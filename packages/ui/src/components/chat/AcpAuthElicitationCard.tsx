import { useEffect, useState, useSyncExternalStore } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import { Checkbox } from "#shadcn/components/ui/checkbox";
import { openRuntimeExternal } from "#api/runtime";
import { createProviderClient } from "#api/ProviderClient";

const providerClient = createProviderClient();

// Agents whose sign-in dialog is open. That dialog renders the agent's prompts
// itself, so the chat-page card must not show a duplicate behind the modal.
const dialogOwnedAgents = new Map<string, number>();
const ownershipListeners = new Set<() => void>();
let ownershipVersion = 0;
const notifyOwnership = () => {
  ownershipVersion += 1;
  for (const listener of ownershipListeners) listener();
};
const subscribeOwnership = (listener: () => void) => {
  ownershipListeners.add(listener);
  return () => ownershipListeners.delete(listener);
};

/** Marks an agent's auth prompts as rendered by an open sign-in dialog. */
export function useClaimAcpAuthElicitations(agentId: string, active: boolean) {
  useEffect(() => {
    if (!active || !agentId) return;
    dialogOwnedAgents.set(agentId, (dialogOwnedAgents.get(agentId) ?? 0) + 1);
    notifyOwnership();
    return () => {
      const next = (dialogOwnedAgents.get(agentId) ?? 1) - 1;
      if (next > 0) dialogOwnedAgents.set(agentId, next);
      else dialogOwnedAgents.delete(agentId);
      notifyOwnership();
    };
  }, [agentId, active]);
}

type ElicitationPropertyView = {
  type?: string;
  title?: string;
  description?: string;
};

type AuthElicitationView = {
  requestId: string;
  agentId: string;
  mode: string;
  message: string;
  requestedSchema?: { properties?: Record<string, ElicitationPropertyView>; required?: string[] };
  url?: string | null;
};

/**
 * Renders request-scoped ACP elicitations that arrive during auth/config
 * flows (no session scope): a form card mirroring the chat elicitation
 * overlay, answered via providers.respondAcpAuthElicitation.
 *
 * With `agentId` (inside the sign-in dialog) it shows only that agent's
 * prompts; without it (chat page) it skips agents whose dialog is open.
 */
export default function AcpAuthElicitationCard({ agentId }: { agentId?: string } = {}) {
  const [request, setRequest] = useState<AuthElicitationView | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const setFieldValue = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  useEffect(() => {
    const offElicitation = providerClient.onAcpAuthElicitation((payload) => {
      if (agentId && payload.agentId !== agentId) return;
      setRequest(payload as AuthElicitationView);
      setValues({});
      setError(null);
    });
    const offResolved = providerClient.onAcpAuthElicitationResolved((payload) => {
      setRequest((prev) => (prev && prev.requestId === payload.requestId ? null : prev));
    });
    return () => {
      offElicitation();
      offResolved();
    };
  }, [agentId]);
  useSyncExternalStore(subscribeOwnership, () => ownershipVersion);

  if (!request) return null;
  if (!agentId && dialogOwnedAgents.has(request.agentId)) return null;

  const properties = request.requestedSchema?.properties ?? {};
  const required = new Set(request.requestedSchema?.required ?? []);
  const missing = [...required].filter((key) => {
    const value = values[key];
    return value === undefined || !value.trim();
  });
  const canSubmit = missing.length === 0;

  const respond = (action: "accept" | "decline" | "cancel") => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    const content: Record<string, string | number | boolean | string[]> = {};
    if (action === "accept") {
      for (const [key, prop] of Object.entries(properties)) {
        const raw = values[key];
        if (typeof raw !== "string" || !raw.trim()) continue;
        if (prop.type === "number" || prop.type === "integer") {
          const parsed = Number(raw);
          if (Number.isFinite(parsed)) content[key] = prop.type === "integer" ? Math.trunc(parsed) : parsed;
          continue;
        }
        if (prop.type === "boolean") {
          content[key] = raw === "true";
          continue;
        }
        if (prop.type === "array") {
          const list = raw
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
          if (list.length > 0) content[key] = list;
          continue;
        }
        content[key] = raw;
      }
    }
    void providerClient
      .respondAcpAuthElicitation({ requestId: request.requestId, action, content })
      .catch((respondError) => {
        console.error("[AcpAuthElicitationCard] respond failed:", respondError);
        setError(respondError instanceof Error ? respondError.message : String(respondError));
      })
      .finally(() => setSubmitting(false));
  };

  return (
    <div
      className="mx-auto mb-2 w-full max-w-4xl rounded-xl border border-amber-600/40 bg-amber-600/10 p-4"
      data-testid="acp-auth-elicitation-card"
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon icon="lucide:text-cursor-input" className="h-4 w-4" />
        <span>{request.agentId} needs your input</span>
      </div>
      {request.message && <p className="mt-2 whitespace-pre-wrap break-words text-sm">{request.message}</p>}

      {request.mode === "url" && request.url ? (
        <button
          type="button"
          disabled={submitting}
          className="mt-3 w-full rounded-md border bg-muted/50 px-3 py-2 text-left text-xs break-all transition-colors hover:bg-muted disabled:opacity-50"
          title={request.url}
          onClick={() => void openRuntimeExternal(request.url!)}
        >
          <span className="flex items-center gap-1.5">
            <Icon icon="lucide:external-link" className="h-3.5 w-3.5 shrink-0" />
            {request.url}
          </span>
        </button>
      ) : (
        <div className="mt-3 space-y-3">
          {Object.entries(properties).map(([key, prop]) => {
            const label = prop.title?.trim() || key;
            const fieldId = `acp-auth-elicit-${key}`;
            const value = values[key] ?? "";
            if (prop.type === "boolean") {
              return (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    id={fieldId}
                    disabled={submitting}
                    checked={value === "true"}
                    onCheckedChange={(checked) => setFieldValue(key, checked === true ? "true" : "false")}
                  />
                  <Label htmlFor={fieldId} className="text-xs">
                    {label}
                  </Label>
                </div>
              );
            }
            const inputType = prop.type === "number" || prop.type === "integer" ? "number" : "text";
            return (
              <div key={key} className="space-y-1.5">
                <Label htmlFor={fieldId} className="text-xs">
                  {label}
                  {required.has(key) && <span className="ml-1 text-muted-foreground">*</span>}
                </Label>
                <Input
                  id={fieldId}
                  type={inputType}
                  disabled={submitting}
                  value={value}
                  onChange={(event) => setFieldValue(key, event.target.value)}
                  className="h-8 text-xs"
                  placeholder={prop.type === "array" ? "Comma-separated values" : undefined}
                />
                {prop.description && <p className="text-[11px] text-muted-foreground">{prop.description}</p>}
              </div>
            );
          })}
          {missing.length > 0 && <p className="text-[11px] text-muted-foreground">Required: {missing.join(", ")}</p>}
        </div>
      )}

      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

      <div className="mt-4 flex gap-2">
        <Button
          disabled={submitting}
          variant="outline"
          size="sm"
          className="h-8 flex-1 text-xs"
          onClick={() => respond("cancel")}
        >
          Cancel
        </Button>
        <Button
          disabled={submitting}
          variant="outline"
          size="sm"
          className="h-8 flex-1 text-xs"
          onClick={() => respond("decline")}
        >
          Decline
        </Button>
        <Button size="sm" className="h-8 flex-1 text-xs" onClick={() => respond("accept")}>
          {request.mode === "url" ? "Mark complete" : "Submit"}
        </Button>
      </div>
    </div>
  );
}
