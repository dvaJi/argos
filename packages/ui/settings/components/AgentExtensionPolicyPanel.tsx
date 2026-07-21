import { useEffect, useMemo, useState } from "react";
import { Checkbox } from "#shadcn/components/ui/checkbox";
import { Button } from "#shadcn/components/ui/button";
import { usePresenter } from "#api/presenterBridge";

type AgentExtensionPolicyValue = {
  enabledMcpServerIds?: string[];
};

type PolicyItem = {
  id: string;
  label: string;
  description?: string;
};

interface AgentExtensionPolicyPanelProps {
  value: AgentExtensionPolicyValue;
  onChange: (nextValue: AgentExtensionPolicyValue) => void;
  disabled?: boolean;
}

const normalizeSelection = (value?: string[]): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value.map((item) => item.trim()).filter(Boolean)));
};

const updateSelection = (current: string[] | undefined, itemId: string, checked: boolean): string[] => {
  const currentSelection = normalizeSelection(current);
  if (checked) {
    return Array.from(new Set([...currentSelection, itemId]));
  }
  return currentSelection.filter((id) => id !== itemId);
};

function PolicyScopeList({
  title,
  description,
  items,
  selectedIds,
  onToggle,
  onClear,
  disabled,
}: {
  title: string;
  description: string;
  items: PolicyItem[];
  selectedIds?: string[];
  onToggle: (itemId: string, checked: boolean) => void;
  onClear: () => void;
  disabled?: boolean;
}) {
  const selectedSet = useMemo(() => new Set(normalizeSelection(selectedIds)), [selectedIds]);
  const selectedCount = selectedSet.size;
  const scopeLabel =
    selectedIds === undefined ? "All allowed" : selectedCount === 0 ? "None allowed" : `${selectedCount} selected`;

  return (
    <div className="space-y-3 rounded-2xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold">{title}</div>
            <span className="rounded border px-2 py-0.5 text-[10px] uppercase tracking-wide">{scopeLabel}</span>
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={disabled} onClick={onClear}>
          Allow all
        </Button>
      </div>

      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-xs text-muted-foreground">
            Nothing available yet.
          </div>
        ) : (
          items.map((item) => (
            <label key={item.id} className="flex items-start gap-3 rounded-xl border border-border px-3 py-2">
              <Checkbox
                checked={selectedSet.has(item.id)}
                disabled={disabled}
                onCheckedChange={(checked) => onToggle(item.id, checked === true)}
              />
              <div className="min-w-0 space-y-0.5">
                <div className="truncate text-sm font-medium" title={item.label}>
                  {item.label}
                </div>
                {item.description ? <div className="text-xs text-muted-foreground">{item.description}</div> : null}
              </div>
            </label>
          ))
        )}
      </div>
    </div>
  );
}

export default function AgentExtensionPolicyPanel({
  value,
  onChange,
  disabled = false,
}: AgentExtensionPolicyPanelProps) {
  const configPresenter = usePresenter("configPresenter");
  const [loading, setLoading] = useState(false);
  const [mcpServers, setMcpServers] = useState<
    Array<{ id: string; label: string; pluginId?: string; source?: string; sourceId?: string }>
  >([]);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      try {
        const servers = await configPresenter.getMcpServers();
        if (!mounted) {
          return;
        }

        const entries = Object.entries(servers ?? {}).map(([id, config]) => ({
          id,
          label: id,
          pluginId: config.ownerPluginId ?? (config.source === "plugin" ? config.sourceId : undefined),
          source: config.source,
          sourceId: config.sourceId,
        }));
        setMcpServers(entries);
      } catch (error) {
        console.error("Failed to load agent extension scope data:", error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [configPresenter]);

  const normalizedValue = useMemo(
    () => ({
      enabledMcpServerIds: Array.isArray(value.enabledMcpServerIds)
        ? normalizeSelection(value.enabledMcpServerIds)
        : undefined,
    }),
    [value.enabledMcpServerIds],
  );

  const updateValue = (nextValue: AgentExtensionPolicyValue) => {
    onChange({
      enabledMcpServerIds:
        nextValue.enabledMcpServerIds === undefined ? undefined : normalizeSelection(nextValue.enabledMcpServerIds),
    });
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border p-5">
      <div className="space-y-1">
        <div className="text-sm font-semibold">MCP scope</div>
        <p className="text-xs text-muted-foreground">
          Leave this unset to allow every configured MCP server. An empty list blocks MCP tools entirely.
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-xs text-muted-foreground">
          Loading available MCP servers...
        </div>
      ) : null}

      <div>
        <PolicyScopeList
          title="MCP servers"
          description="Limit which MCP servers this agent can use."
          items={mcpServers}
          selectedIds={normalizedValue.enabledMcpServerIds}
          onToggle={(itemId, checked) => {
            updateValue({
              ...normalizedValue,
              enabledMcpServerIds: updateSelection(normalizedValue.enabledMcpServerIds, itemId, checked),
            });
          }}
          onClear={() => updateValue({ ...normalizedValue, enabledMcpServerIds: undefined })}
          disabled={disabled}
        />
      </div>
    </section>
  );
}
