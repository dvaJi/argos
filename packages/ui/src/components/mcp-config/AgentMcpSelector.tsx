import { type FC, useState, useEffect, useRef } from "react";
import { createConfigClient } from "#api/ConfigClient";
import { Checkbox } from "#shadcn/components/ui/checkbox";
import { useToast } from "#/components/use-toast";
type AgentMcpServerConfig = {
  type?: string;
  source?: string;
  ownerPluginId?: string;
};
interface AgentMcpSelectorProps {
  onUpdateSelections?: (selections: string[]) => void;
}
const configClient = createConfigClient();
const AgentMcpSelector: FC<AgentMcpSelectorProps> = ({ onUpdateSelections }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [availableServers, setAvailableServers] = useState<
    Array<{
      name: string;
      config: AgentMcpServerConfig;
    }>
  >([]);
  const [selections, setSelections] = useState<string[]>([]);
  // Liveness flag flipped by the load effect; post-await state writes are skipped
  // once the effect is torn down so unmounted loads never write state.
  const loadLiveRef = useRef(false);
  // Latest callback, read through a ref so a parent passing an inline function
  // does not retrigger the load effect (which caused a load/report/re-render loop).
  const onUpdateSelectionsRef = useRef(onUpdateSelections);
  useEffect(() => {
    onUpdateSelectionsRef.current = onUpdateSelections;
  }, [onUpdateSelections]);
  const selectableServers = availableServers.filter((server) => server.config.type !== "inmemory");
  const selectionSet = new Set(selections);
  const persist = async (nextSelections: string[], previousSelections: string[] = selections) => {
    setSaving(true);
    try {
      await configClient.setAcpSharedMcpSelections(nextSelections);
      onUpdateSelections?.(nextSelections);
    } catch (error) {
      setSelections(previousSelections);
      onUpdateSelections?.(previousSelections);
      toast({
        title: "Operation failed",
        description: "Request failed",
        variant: "destructive",
      });
      setSaving(false);
      throw error;
    }
    setSaving(false);
  };
  const toggleServer = async (serverName: string, checked: boolean) => {
    const prev = [...selections];
    const next = checked
      ? Array.from(new Set([...selections, serverName]))
      : selections.filter((name) => name !== serverName);
    setSelections(next);
    try {
      await persist(next, prev);
    } catch (error) {
      setSelections(prev);
      throw error;
    }
  };
  // Load once on mount.
  useEffect(() => {
    const load = async () => {
      const isPluginOwnedServerConfig = (config: AgentMcpServerConfig): boolean =>
        Boolean(config.ownerPluginId || config.source === "plugin");
      setLoading(true);
      try {
        const [servers, currentSelections] = await Promise.all([
          configClient.getMcpServers(),
          configClient.getAcpSharedMcpSelections(),
        ]);
        if (!loadLiveRef.current) return;
        const filtered = Object.entries(servers ?? {}).flatMap(([name, config]) =>
          isPluginOwnedServerConfig(config)
            ? []
            : [
                {
                  name,
                  config,
                },
              ],
        );
        setAvailableServers(filtered);
        const visibleServerNames = new Set(filtered.map((server) => server.name));
        const next = Array.isArray(currentSelections)
          ? currentSelections.filter((name) => visibleServerNames.has(name))
          : [];
        setSelections(next);
        // Report the *visible* count on mount so the parent badge matches the list.
        onUpdateSelectionsRef.current?.(next);
        setLoading(false);
      } catch (error) {
        if (!loadLiveRef.current) return;
        setLoading(false);
        throw error;
      }
    };
    loadLiveRef.current = true;
    void Promise.resolve().then(() => load());
    return () => {
      loadLiveRef.current = false;
    };
  }, []);
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-muted-foreground">MCP Server Access</div>

      {loading && <div className="text-xs text-muted-foreground">Loading...</div>}

      {!loading && selectableServers.length === 0 && (
        <div className="text-xs text-muted-foreground">No MCP servers available for sharing</div>
      )}

      {!loading && selectableServers.length > 0 && (
        <div className="max-h-56 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {selectableServers.map((server) => (
              <div key={server.name} className="flex items-center gap-2 rounded-md border px-3 py-2">
                <Checkbox
                  checked={selectionSet.has(server.name)}
                  disabled={saving}
                  onCheckedChange={(value) => toggleServer(server.name, Boolean(value))}
                />
                <div className="min-w-0 text-sm font-medium truncate" title={server.name}>
                  {server.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
export default AgentMcpSelector;
