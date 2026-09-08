import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Badge } from "#shadcn/components/ui/badge";
import { Input } from "#shadcn/components/ui/input";
import { Skeleton } from "#shadcn/components/ui/skeleton";
import { toast } from "#/components/use-toast";
import { createToolchainClient } from "#api/ToolchainClient";
import type { ToolchainName, ToolchainSource, ToolchainStatus } from "@argos/shared-contracts/routes";

const toolchainClient = createToolchainClient();

const SOURCE_BADGE_CLASS: Record<ToolchainSource, string> = {
  managed: "bg-green-600/15 text-green-700 dark:text-green-400 border-green-600/30",
  bundled: "bg-blue-600/15 text-blue-700 dark:text-blue-400 border-blue-600/30",
  system: "bg-violet-600/15 text-violet-700 dark:text-violet-400 border-violet-600/30",
  custom: "bg-amber-600/15 text-amber-700 dark:text-amber-400 border-amber-600/30",
  unconfigured: "bg-muted text-muted-foreground border-border",
};

const TOOL_DESCRIPTIONS: Record<ToolchainName, { title: string; description: string }> = {
  node: {
    title: "Node.js",
    description:
      "Runs npx-based ACP agents and Node MCP servers. Managed installs are pinned, SHA-256 verified, and isolated from your system.",
  },
  uv: {
    title: "uv",
    description:
      "Runs uvx-based MCP servers and Python tooling. Ships as a bundled seed; a managed install overrides it with the pinned release.",
  },
  ripgrep: {
    title: "ripgrep",
    description: "Fast file search used by agent tools. Resolved from the bundled seed or your system install.",
  },
};

const MANAGEABLE: Array<ToolchainName> = ["node", "uv", "ripgrep"];

function SourceBadge({ source }: { source: ToolchainSource }) {
  const label = source.charAt(0).toUpperCase() + source.slice(1);
  return (
    <Badge variant="outline" className={`${SOURCE_BADGE_CLASS[source]} text-xs font-medium`}>
      {label}
    </Badge>
  );
}

function ToolchainCard({
  status,
  busy,
  onInstall,
  onCancel,
  onRevert,
  onSetCustom,
}: {
  status: ToolchainStatus;
  busy: boolean;
  onInstall: (tool: "node" | "uv") => void;
  onCancel: (tool: "node" | "uv") => void;
  onRevert: (tool: ToolchainName) => void;
  onSetCustom: (tool: ToolchainName, path: string) => void;
}) {
  const [customPath, setCustomPath] = useState("");
  const [showCustomInput, setShowCustomInput] = useState(false);
  const meta = TOOL_DESCRIPTIONS[status.tool];
  const installable = status.tool !== "ripgrep";
  const installing = status.install != null && status.install.phase !== "idle";

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{meta.title}</span>
          <SourceBadge source={status.source} />
          {status.version ? <span className="font-mono text-xs text-muted-foreground">{status.version}</span> : null}
          {status.pin ? <span className="text-xs text-muted-foreground">pin {status.pin}</span> : null}
        </div>
        <div className="flex items-center gap-2">
          {installable ? (
            installing ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => onCancel(status.tool as "node" | "uv")}
              >
                <Icon icon="lucide:x" className="mr-1 size-3.5" /> Cancel
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => onInstall(status.tool as "node" | "uv")}
              >
                <Icon icon="lucide:download" className="mr-1 size-3.5" />
                {status.source === "managed" ? "Repair" : "Install"}
              </Button>
            )
          ) : null}
          {status.explicit ? (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRevert(status.tool)}>
              Revert
            </Button>
          ) : null}
        </div>
      </div>

      <p className="text-pretty text-xs leading-5 text-muted-foreground">{meta.description}</p>

      {installing ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Icon icon="lucide:loader-circle" className="size-3.5 animate-spin" />
          {status.install?.phase === "downloading" ? "Downloading…" : null}
          {status.install?.phase === "extracting" ? "Extracting…" : null}
          {status.install?.phase === "activating" ? "Activating…" : null}
          {status.install?.phase === "idle" ? "Finishing…" : null}
        </div>
      ) : null}

      {status.error ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <Icon icon="lucide:alert-triangle" className="mt-0.5 size-3.5 shrink-0" />
          <span className="min-w-0 break-words">{status.error}</span>
        </div>
      ) : null}

      <div className="min-w-0 break-all font-mono text-xs text-muted-foreground">
        {status.path ?? "Not found — npx/uvx commands will fall back to PATH lookup."}
      </div>

      {showCustomInput ? (
        <div className="flex items-center gap-2">
          <Input
            value={customPath}
            onChange={(event) => setCustomPath(event.target.value)}
            placeholder="Path to the executable…"
            className="h-8 font-mono text-xs"
          />
          <Button
            size="sm"
            disabled={busy || customPath.trim().length === 0}
            onClick={() => {
              onSetCustom(status.tool, customPath.trim());
              setShowCustomInput(false);
              setCustomPath("");
            }}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowCustomInput(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <button
          type="button"
          className="w-fit text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          onClick={() => setShowCustomInput(true)}
        >
          Use a custom executable…
        </button>
      )}
    </div>
  );
}

export default function ToolchainsSettings() {
  const [tools, setTools] = useState<ToolchainStatus[] | null>(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await toolchainClient.list();
      setTools(result.tools);
      return result.tools;
    } catch (error) {
      toast({
        title: "Could not load toolchains",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
      return [];
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void refresh());
  }, [refresh]);

  // Poll while any install is in flight so progress phases stay live.
  useEffect(() => {
    const installing = tools?.some((tool) => tool.install != null && tool.install.phase !== "idle");
    if (installing && pollRef.current == null) {
      pollRef.current = window.setInterval(() => void refresh(), 1500);
    } else if (!installing && pollRef.current != null) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current != null) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [tools, refresh]);

  const run = useCallback(
    async (action: () => Promise<unknown>, successTitle: string) => {
      setBusy(true);
      try {
        await action();
        await refresh();
        toast({ title: successTitle });
      } catch (error) {
        toast({
          title: "Action failed",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
      }
      setBusy(false);
    },
    [refresh],
  );

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight">Toolchains</h1>
        <p className="text-sm text-muted-foreground">
          External runtimes used by ACP agents, MCP servers, and agent tools. Managed installs are pinned and SHA-256
          verified; nothing here mutates your system installation.
        </p>
      </div>

      {tools == null ? (
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid max-w-3xl gap-3">
          {MANAGEABLE.map((tool) => {
            const status = tools.find((entry) => entry.tool === tool);
            if (!status) return null;
            return (
              <ToolchainCard
                key={tool}
                status={status}
                busy={busy}
                onInstall={(name) => void run(() => toolchainClient.install(name), `Installing ${name}…`)}
                onCancel={(name) => void run(() => toolchainClient.cancelInstall(name), "Cancellation requested")}
                onRevert={(name) => void run(() => toolchainClient.removeSource(name), "Reverted")}
                onSetCustom={(name, path) =>
                  void run(() => toolchainClient.setSource({ tool: name, source: "custom", path }), "Custom path saved")
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
