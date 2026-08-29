import { useState, useEffect, useRef } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "#shadcn/components/ui/dialog";
import { createPluginClient } from "#api/PluginClient";
import type {
  PluginActionResult,
  PluginInvokeActionRequest,
  PluginListItem,
  PluginRuntimeState,
} from "@argos/shared/types/plugin";
import SettingsPageShell from "./control-center/SettingsPageShell";
const pluginClient = createPluginClient();
type OpenPluginSettings = {
  pluginId: string;
  title: string;
  url: string;
};
type PluginSettingsFrameRequest = {
  source: "argos-plugin-settings-frame";
  requestId: string;
  pluginId: string;
  method: "getStatus" | "enable" | "disable" | "invokeAction";
  args?: unknown[];
};
function getSettingsUrl(result: PluginActionResult): string | null {
  if (!result.data || Array.isArray(result.data) || typeof result.data !== "object") return null;
  const settingsUrl = result.data.settingsUrl;
  if (typeof settingsUrl !== "string") return null;
  if (settingsUrl.startsWith("/")) return settingsUrl;
  try {
    const url = new URL(settingsUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
function isPluginSettingsFrameRequest(value: unknown): value is PluginSettingsFrameRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<PluginSettingsFrameRequest>;
  return (
    request.source === "argos-plugin-settings-frame" &&
    typeof request.requestId === "string" &&
    typeof request.pluginId === "string" &&
    typeof request.method === "string"
  );
}
function formatRuntimeState(state?: PluginRuntimeState): string {
  if (!state) return "-";
  const labels: Record<PluginRuntimeState, string> = {
    missing: "Missing",
    running: "Running",
    installed: "Installed",
    error: "Error",
  };
  return labels[state] ?? state;
}
function getPluginMcpErrors(plugin: PluginListItem): string[] {
  return (plugin.mcpServers ?? []).flatMap((server) =>
    server.lastError ? [`${server.serverId}: ${server.lastError}`] : [],
  );
}
export default function PluginsSettings() {
  const [plugins, setPlugins] = useState<PluginListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [pendingPluginId, setPendingPluginId] = useState<string | null>(null);
  const [openPluginSettings, setOpenPluginSettings] = useState<OpenPluginSettings | null>(null);
  const settingsFrameRef = useRef<HTMLIFrameElement>(null);
  // Liveness flag flipped by the load effect; post-await state writes are skipped
  // once the effect is torn down so unmounted loads never write state.
  const pluginsLiveRef = useRef(false);
  const loadPlugins = async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const result = await pluginClient.listPlugins();
      if (!pluginsLiveRef.current) return;
      setPlugins(result);
    } catch (error) {
      if (!pluginsLiveRef.current) return;
      setErrorMessage(error instanceof Error ? error.message : "Failed to load plugins");
    }
    if (!pluginsLiveRef.current) return;
    setLoading(false);
  };
  const runPluginAction = async (pluginId: string, action: () => Promise<PluginActionResult>) => {
    setPendingPluginId(pluginId);
    setErrorMessage("");
    try {
      const result = await action();
      if (!result.ok) {
        setErrorMessage(result.error || "Action failed");
      } else {
        await loadPlugins();
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Action failed");
    }
    setPendingPluginId(null);
  };
  const enablePlugin = (pluginId: string) => runPluginAction(pluginId, () => pluginClient.enablePlugin(pluginId));
  const disablePlugin = (pluginId: string) => runPluginAction(pluginId, () => pluginClient.disablePlugin(pluginId));
  const openSettings = async (plugin: PluginListItem) => {
    setPendingPluginId(plugin.id);
    setErrorMessage("");
    try {
      const result = await pluginClient.invokeAction({
        pluginId: plugin.id,
        actionId: "settings.open",
      });
      if (!result.ok) {
        setErrorMessage(result.error || "Failed to open plugin settings");
      } else {
        const url = getSettingsUrl(result);
        if (url) {
          setOpenPluginSettings({
            pluginId: plugin.id,
            title: plugin.settings?.title || plugin.name,
            url,
          });
        }
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to open plugin settings");
    }
    setPendingPluginId(null);
  };
  useEffect(() => {
    pluginsLiveRef.current = true;
    void Promise.resolve().then(() => loadPlugins());
    return () => {
      pluginsLiveRef.current = false;
    };
  }, [loadPlugins]);
  useEffect(() => {
    if (!openPluginSettings) return;
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== settingsFrameRef.current?.contentWindow || !isPluginSettingsFrameRequest(event.data)) {
        return;
      }
      const request = event.data;
      if (request.pluginId !== openPluginSettings.pluginId) return;
      void (async () => {
        try {
          let value: unknown;
          if (request.method === "getStatus") {
            const plugin = await pluginClient.getPlugin(request.pluginId);
            value = {
              pluginId: request.pluginId,
              platform: "daemon",
              arch: "unknown",
              enabled: Boolean(plugin?.enabled),
              runtime: plugin?.runtime,
              mcpServers: plugin?.mcpServers,
            };
          } else if (request.method === "enable") {
            value = await pluginClient.enablePlugin(request.pluginId);
            await loadPlugins();
          } else if (request.method === "disable") {
            value = await pluginClient.disablePlugin(request.pluginId);
            await loadPlugins();
          } else {
            const [actionId, payload] = request.args ?? [];
            if (typeof actionId !== "string") {
              settingsFrameRef.current?.contentWindow?.postMessage(
                {
                  source: "argos-plugin-settings-host",
                  requestId: request.requestId,
                  ok: false,
                  error: "Plugin action ID is required",
                },
                "*",
              );
              return;
            }
            value = await pluginClient.invokeAction({
              pluginId: request.pluginId,
              actionId,
              payload: payload as PluginInvokeActionRequest["payload"],
            });
          }
          settingsFrameRef.current?.contentWindow?.postMessage(
            {
              source: "argos-plugin-settings-host",
              requestId: request.requestId,
              ok: true,
              value,
            },
            "*",
          );
        } catch (error) {
          settingsFrameRef.current?.contentWindow?.postMessage(
            {
              source: "argos-plugin-settings-host",
              requestId: request.requestId,
              ok: false,
              error: error instanceof Error ? error.message : "Plugin settings request failed",
            },
            "*",
          );
        }
      })();
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [loadPlugins, openPluginSettings]);
  return (
    <SettingsPageShell
      title="Plugins"
      description="Only official plugins are supported"
      eyebrow="Tools"
      data-testid="settings-plugins-page"
      actions={
        <Button
          variant="outline"
          size="icon"
          disabled={loading}
          aria-label="Refresh"
          title="Refresh"
          onClick={loadPlugins}
        >
          <Icon icon="lucide:refresh-cw" className="h-4 w-4" />
        </Button>
      }
    >
      {errorMessage && (
        <div className="rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive">{errorMessage}</div>
      )}

      <div className="space-y-3">
        {!loading && plugins.length === 0 && (
          <div className="flex flex-col gap-4 rounded-lg border border-dashed border-border bg-background p-6">
            <div className="flex items-start gap-3">
              <Icon icon="lucide:puzzle" className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">No plugins installed</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Plugins extend functionality. Install one to get started.
                </p>
              </div>
            </div>
          </div>
        )}

        {plugins.map((plugin) => (
          <article key={plugin.id} className="flex flex-col gap-4 rounded-lg border border-border bg-background p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-semibold">{plugin.name}</h3>
                  <span className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                    {plugin.version}
                  </span>
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">
                  {plugin.publisher} · {plugin.id}
                </div>
              </div>
              <span
                className={`shrink-0 rounded border px-2 py-1 text-xs ${plugin.enabled ? "border-emerald-500/40 text-emerald-600" : "border-border text-muted-foreground"}`}
              >
                {plugin.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>

            <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Runtime</dt>
              <dd>{formatRuntimeState(plugin.runtime?.state)}</dd>
              <dt className="text-muted-foreground">Version</dt>
              <dd>{plugin.runtime?.version || "-"}</dd>
              <dt className="text-muted-foreground">Command</dt>
              <dd className="truncate font-mono text-xs">{plugin.runtime?.command || "-"}</dd>
            </dl>

            {plugin.runtime?.lastError && <div className="text-xs text-destructive">{plugin.runtime.lastError}</div>}

            {getPluginMcpErrors(plugin).length > 0 && (
              <div className="space-y-1 text-xs text-destructive">
                {getPluginMcpErrors(plugin).map((error) => (
                  <div key={error}>{error}</div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {!plugin.enabled && (
                <Button
                  data-testid={`plugin-enable-${plugin.id}`}
                  size="sm"
                  disabled={pendingPluginId === plugin.id}
                  onClick={() => void enablePlugin(plugin.id)}
                >
                  <Icon icon="lucide:power" className="mr-2 h-4 w-4" />
                  Enable
                </Button>
              )}
              {plugin.settings && (
                <Button
                  data-testid={`plugin-settings-${plugin.id}`}
                  size="sm"
                  variant="outline"
                  disabled={pendingPluginId === plugin.id}
                  onClick={() => void openSettings(plugin)}
                >
                  <Icon icon="lucide:settings" className="mr-2 h-4 w-4" />
                  Settings
                </Button>
              )}
              {plugin.enabled && (
                <Button
                  data-testid={`plugin-disable-${plugin.id}`}
                  size="sm"
                  variant="outline"
                  disabled={pendingPluginId === plugin.id}
                  onClick={() => void disablePlugin(plugin.id)}
                >
                  <Icon icon="lucide:power-off" className="mr-2 h-4 w-4" />
                  Disable
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>

      <Dialog open={Boolean(openPluginSettings)} onOpenChange={(open) => !open && setOpenPluginSettings(null)}>
        <DialogContent className="flex h-[80dvh] max-w-4xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>{openPluginSettings?.title || "Plugin Settings"}</DialogTitle>
            <DialogDescription>Configure this plugin through the daemon.</DialogDescription>
          </DialogHeader>
          {openPluginSettings && (
            <iframe
              ref={settingsFrameRef}
              src={openPluginSettings.url}
              title={`${openPluginSettings.title} settings`}
              sandbox="allow-forms allow-scripts"
              className="min-h-0 flex-1 border-0 bg-background"
            />
          )}
        </DialogContent>
      </Dialog>
    </SettingsPageShell>
  );
}
