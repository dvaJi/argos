import { useEffect, useState } from "react";
import { Checkbox } from "#shadcn/components/ui/checkbox";
import { Button } from "#shadcn/components/ui/button";
import { createMcpClient } from "#api/McpClient";

// Process-wide singleton; module scope keeps effect dependencies stable.
const mcpClient = createMcpClient();

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
  return Array.from(
    new Set(
      value.flatMap((item) => {
        const t = item.trim();
        return t ? [t] : [];
      }),
    ),
  );
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
  const selectedSet = new Set(
    selectedIds === undefined ? items.map((item) => item.id) : normalizeSelection(selectedIds),
  );
  const selectedCount = selectedIds === undefined ? items.length : selectedSet.size;
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
  const [loading, setLoading] = useState(true);
  const [mcpServers, setMcpServers] = useState<
    Array<{ id: string; label: string; pluginId?: string; source?: string; sourceId?: string }>
  >([]);

  useEffect(() => {
    let mounted = true;
    void mcpClient
      .getMcpServers()
      .then((servers) => {
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
      })
      .catch((error) => console.error("Failed to load agent extension scope data:", error))
      .finally(() => {
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const normalizedValue = {
    enabledMcpServerIds: Array.isArray(value.enabledMcpServerIds)
      ? normalizeSelection(value.enabledMcpServerIds)
      : undefined,
  };

  const updateValue = (nextValue: AgentExtensionPolicyValue) => {
    onChange({
      enabledMcpServerIds:
        nextValue.enabledMcpServerIds === undefined ? undefined : normalizeSelection(nextValue.enabledMcpServerIds),
    });
  };

  const handleToggle = (itemId: string, checked: boolean) => {
    const allIds = mcpServers.map((item) => item.id);
    const current = normalizedValue.enabledMcpServerIds;
    if (checked) {
      const explicit = normalizeSelection(current);
      const next = Array.from(new Set([...explicit, itemId]));
      const nextSet = new Set(next);
      if (allIds.every((id) => nextSet.has(id))) {
        updateValue({ ...normalizedValue, enabledMcpServerIds: undefined });
        return;
      }
      updateValue({ ...normalizedValue, enabledMcpServerIds: next });
      return;
    }
    const base = current === undefined ? allIds : current;
    updateValue({ ...normalizedValue, enabledMcpServerIds: base.filter((id) => id !== itemId) });
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border p-5">
      <div className="space-y-1">
        <div className="text-sm font-semibold">MCP scope</div>
        <p className="text-xs text-muted-foreground">
          Checked servers are available to this agent. Uncheck when everything is allowed to create an explicit
          allowlist.
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
          onToggle={handleToggle}
          onClear={() => updateValue({ ...normalizedValue, enabledMcpServerIds: undefined })}
          disabled={disabled}
        />
      </div>
    </section>
  );
}
