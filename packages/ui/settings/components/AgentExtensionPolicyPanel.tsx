import { useEffect, useMemo, useState } from "react";
import { Checkbox } from "#shadcn/components/ui/checkbox";
import { Button } from "#shadcn/components/ui/button";
import { Badge } from "#shadcn/components/ui/badge";
import { usePresenter } from "#api/presenterBridge";
import { loadSkills, useSkillsStore } from "#/stores/skillsStore";

type AgentExtensionPolicyValue = {
  enabledMcpServerIds?: string[];
  enabledPluginIds?: string[];
  enabledSkillNames?: string[];
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
            <Badge variant="outline" className="h-5 px-2 text-[10px] uppercase tracking-wide">
              {scopeLabel}
            </Badge>
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
  const skillsStore = useSkillsStore();
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
        await loadSkills();
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

  const availablePluginIds = useMemo(() => {
    const pluginCounts = new Map<string, number>();
    for (const server of mcpServers) {
      if (!server.pluginId) continue;
      pluginCounts.set(server.pluginId, (pluginCounts.get(server.pluginId) ?? 0) + 1);
    }

    return Array.from(pluginCounts.entries())
      .map(([id, count]) => ({
        id,
        label: id,
        description: `${count} MCP server${count === 1 ? "" : "s"}`,
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [mcpServers]);

  const availableSkills = useMemo(() => {
    return skillsStore.skills
      .map((skill) => ({
        id: skill.name,
        label: skill.name,
        description: skill.description?.trim() || skill.category?.trim() || undefined,
      }))
      .sort((left, right) => left.label.localeCompare(right.label));
  }, [skillsStore.skills]);

  const normalizedValue = useMemo(
    () => ({
      enabledMcpServerIds: Array.isArray(value.enabledMcpServerIds)
        ? normalizeSelection(value.enabledMcpServerIds)
        : undefined,
      enabledPluginIds: Array.isArray(value.enabledPluginIds) ? normalizeSelection(value.enabledPluginIds) : undefined,
      enabledSkillNames: Array.isArray(value.enabledSkillNames)
        ? normalizeSelection(value.enabledSkillNames)
        : undefined,
    }),
    [value.enabledMcpServerIds, value.enabledPluginIds, value.enabledSkillNames],
  );

  const updateValue = (nextValue: AgentExtensionPolicyValue) => {
    onChange({
      enabledMcpServerIds:
        nextValue.enabledMcpServerIds === undefined ? undefined : normalizeSelection(nextValue.enabledMcpServerIds),
      enabledPluginIds:
        nextValue.enabledPluginIds === undefined ? undefined : normalizeSelection(nextValue.enabledPluginIds),
      enabledSkillNames:
        nextValue.enabledSkillNames === undefined ? undefined : normalizeSelection(nextValue.enabledSkillNames),
    });
  };

  return (
    <section className="space-y-4 rounded-2xl border border-border p-5">
      <div className="space-y-1">
        <div className="text-sm font-semibold">Agent extension scope</div>
        <p className="text-xs text-muted-foreground">
          Leave a category unset to allow everything. An empty list blocks that category entirely.
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-xs text-muted-foreground">
          Loading available servers and skills...
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-3">
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
        <PolicyScopeList
          title="Plugin IDs"
          description="Allow only plugin-owned integrations from selected plugins."
          items={availablePluginIds}
          selectedIds={normalizedValue.enabledPluginIds}
          onToggle={(itemId, checked) => {
            updateValue({
              ...normalizedValue,
              enabledPluginIds: updateSelection(normalizedValue.enabledPluginIds, itemId, checked),
            });
          }}
          onClear={() => updateValue({ ...normalizedValue, enabledPluginIds: undefined })}
          disabled={disabled}
        />
        <PolicyScopeList
          title="Skills"
          description="Control which skills can be activated for this agent."
          items={availableSkills}
          selectedIds={normalizedValue.enabledSkillNames}
          onToggle={(itemId, checked) => {
            updateValue({
              ...normalizedValue,
              enabledSkillNames: updateSelection(normalizedValue.enabledSkillNames, itemId, checked),
            });
          }}
          onClear={() => updateValue({ ...normalizedValue, enabledSkillNames: undefined })}
          disabled={disabled}
        />
      </div>
    </section>
  );
}
