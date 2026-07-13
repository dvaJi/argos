import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Input } from "#shadcn/components/ui/input";
import { Button } from "#shadcn/components/ui/button";
import { Badge } from "#shadcn/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "#shadcn/components/ui/popover";
import { Icon } from "@iconify/react";
import ModelConfigItem from "#/components/settings/ModelConfigItem";
import { type RENDERER_MODEL_META } from "@argos/shared/presenter";
import { ModelType } from "@argos/shared/model";
import { useModelStore } from "#/stores/modelStore";
import { useUiSettingsStore } from "#/stores/uiSettingsStore";
import AddCustomModelButton from "./AddCustomModelButton";
import { ScrollArea } from "#shadcn/components/ui/scroll-area";

type ModelSortKey = "status" | "name";
type ModelCapabilityKey = "vision" | "functionCall" | "reasoning" | "search";
type FilterToken = {
  kind: "capability" | "type";
  value: string;
  label: string;
};

type BatchAction = "enable" | "disable";

type FacetOption<Value extends string> = {
  value: Value;
  label: string;
  icon: string;
  count: number;
};

const LABEL_ITEM_HEIGHT = 36;
const MODEL_ITEM_HEIGHT = 48;
const PROVIDER_ACTIONS_ITEM_HEIGHT = 56;
const modelNameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

const CAPABILITY_ORDER: ModelCapabilityKey[] = ["vision", "functionCall", "reasoning", "search"];
const TYPE_ORDER: ModelType[] = [
  ModelType.Chat,
  ModelType.Embedding,
  ModelType.Rerank,
  ModelType.ImageGeneration,
  ModelType.VideoGeneration,
  ModelType.TTS,
];

const CAPABILITY_ICONS: Record<ModelCapabilityKey, string> = {
  vision: "lucide:eye",
  functionCall: "lucide:function-square",
  reasoning: "lucide:brain",
  search: "lucide:globe",
};

const TYPE_ICONS: Record<ModelType, string> = {
  [ModelType.Chat]: "lucide:messages-square",
  [ModelType.Embedding]: "lucide:database",
  [ModelType.Rerank]: "lucide:arrow-up-wide-narrow",
  [ModelType.ImageGeneration]: "lucide:image",
  [ModelType.VideoGeneration]: "lucide:clapperboard",
  [ModelType.TTS]: "lucide:volume-2",
};

interface ProviderModelListProps {
  providerId?: string;
  providerModels: { providerId: string; models: RENDERER_MODEL_META[] }[];
  customModels: RENDERER_MODEL_META[];
  providers: { id: string; name: string }[];
  isLoading?: boolean;
  stickyOffset?: number;
  onEnabledChange?: (model: RENDERER_MODEL_META, enabled: boolean) => void;
  onSaved?: () => void;
  onConfigChanged?: () => void;
}

export default function ProviderModelList({
  providerModels: providerModelsProp,
  customModels: customModelsProp,
  providers,
  isLoading: isLoadingProp,
  stickyOffset,
  onEnabledChange,
  onConfigChanged,
}: ProviderModelListProps) {
  const modelStore = useModelStore();
  const uiSettingsStore = useUiSettingsStore();

  const [modelSearchQuery, setModelSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [filterPopoverOpen, setFilterPopoverOpen] = useState(false);
  const [sortPopoverOpen, setSortPopoverOpen] = useState(false);
  const [filterSort, setFilterSort] = useState<ModelSortKey>("name");
  const [selectedCapabilities, setSelectedCapabilities] = useState<ModelCapabilityKey[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<ModelType[]>([]);
  const [providerBatchPending, setProviderBatchPending] = useState<Record<string, BatchAction | undefined>>({});

  const isLoading = isLoadingProp ?? false;
  const newProviderModel = providers?.[0]?.id ?? "";
  const stickyBaseOffset = stickyOffset ?? 0;

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(modelSearchQuery);
    }, 180);
    return () => clearTimeout(timer);
  }, [modelSearchQuery]);

  const normalizedSearchQuery = debouncedSearchQuery.trim().toLowerCase();

  const getModelTypeValue = (model: RENDERER_MODEL_META): ModelType => model.type ?? ModelType.Chat;

  const hasModelCapability = (model: RENDERER_MODEL_META, capability: ModelCapabilityKey) => {
    switch (capability) {
      case "vision":
        return !!model.vision;
      case "functionCall":
        return !!model.functionCall;
      case "reasoning":
        return !!model.reasoning;
      case "search":
        return !!model.enableSearch;
    }
  };

  const getCapabilityLabel = (capability: ModelCapabilityKey) => {
    const labels: Record<ModelCapabilityKey, string> = {
      vision: "Vision",
      functionCall: "Function Call",
      reasoning: "Reasoning",
      search: "Search",
    };
    return labels[capability];
  };

  const getModelTypeLabel = (type: ModelType) => {
    const labels: Record<ModelType, string> = {
      [ModelType.Chat]: "Chat",
      [ModelType.Embedding]: "Embedding",
      [ModelType.Rerank]: "Rerank",
      [ModelType.ImageGeneration]: "Image",
      [ModelType.VideoGeneration]: "Video",
      [ModelType.TTS]: "TTS",
    };
    return labels[type] ?? type;
  };

  const allModels = useMemo(
    () => [...customModelsProp, ...providerModelsProp.flatMap((p) => p.models)],
    [customModelsProp, providerModelsProp],
  );

  const facetCounts = useMemo(() => {
    const counts = {
      total: 0,
      capabilities: { vision: 0, functionCall: 0, reasoning: 0, search: 0 } as Record<ModelCapabilityKey, number>,
      types: {} as Partial<Record<ModelType, number>>,
    };
    for (const model of allModels) {
      counts.total += 1;
      if (model.vision) counts.capabilities.vision += 1;
      if (model.functionCall) counts.capabilities.functionCall += 1;
      if (model.reasoning) counts.capabilities.reasoning += 1;
      if (model.enableSearch) counts.capabilities.search += 1;
      const type = getModelTypeValue(model);
      counts.types[type] = (counts.types[type] ?? 0) + 1;
    }
    return counts;
  }, [allModels]);

  const totalModelCount = facetCounts.total;

  const capabilityFilterOptions = useMemo<FacetOption<ModelCapabilityKey>[]>(
    () =>
      CAPABILITY_ORDER.map((capability) => ({
        value: capability,
        label: getCapabilityLabel(capability),
        icon: CAPABILITY_ICONS[capability],
        count: facetCounts.capabilities[capability],
      })).filter((option) => option.count > 0),
    [facetCounts],
  );

  const typeFilterOptions = useMemo<FacetOption<ModelType>[]>(
    () =>
      TYPE_ORDER.map((type) => ({
        value: type,
        label: getModelTypeLabel(type),
        icon: TYPE_ICONS[type],
        count: facetCounts.types[type] ?? 0,
      })).filter((option) => option.count > 0),
    [facetCounts],
  );

  const sortOptions = useMemo(
    () => [
      { value: "status" as ModelSortKey, label: "Status" },
      { value: "name" as ModelSortKey, label: "Name" },
    ],
    [],
  );

  const currentSortLabel = filterSort === "status" ? "Status" : "Name";
  const activeAdvancedFilterCount = selectedCapabilities.length + selectedTypes.length;

  const activeFilterTokens = useMemo<FilterToken[]>(() => {
    const tokens: FilterToken[] = [];
    selectedCapabilities.forEach((capability) => {
      tokens.push({ kind: "capability", value: capability, label: getCapabilityLabel(capability) });
    });
    selectedTypes.forEach((type) => {
      tokens.push({ kind: "type", value: type, label: getModelTypeLabel(type) });
    });
    return tokens;
  }, [selectedCapabilities, selectedTypes]);

  const hasListRefinements = normalizedSearchQuery.length > 0 || activeAdvancedFilterCount > 0;

  const matchesSearch = (model: RENDERER_MODEL_META) => {
    if (!normalizedSearchQuery) return true;
    return (
      model.name.toLowerCase().includes(normalizedSearchQuery) ||
      model.id.toLowerCase().includes(normalizedSearchQuery) ||
      (!!model.group && model.group.toLowerCase().includes(normalizedSearchQuery)) ||
      (!!model.description && model.description.toLowerCase().includes(normalizedSearchQuery))
    );
  };

  const matchesAdvancedFilters = (model: RENDERER_MODEL_META) => {
    const type = getModelTypeValue(model);
    if (
      selectedCapabilities.length > 0 &&
      !selectedCapabilities.some((capability) => hasModelCapability(model, capability))
    ) {
      return false;
    }
    if (selectedTypes.length > 0 && !selectedTypes.includes(type)) {
      return false;
    }
    return true;
  };

  const getModelKey = (model: RENDERER_MODEL_META) => `${model.providerId}:${model.id}`;

  const statusSortWeight = (model: RENDERER_MODEL_META) => (model.enabled ? 0 : 1);

  const statusSortOrder = useMemo(() => {
    const orderedModels = [...allModels].sort((left, right) => {
      const statusDifference = statusSortWeight(left) - statusSortWeight(right);
      if (statusDifference !== 0) return statusDifference;
      return modelNameCollator.compare(left.name, right.name);
    });
    const nextOrder: Record<string, number> = {};
    orderedModels.forEach((model, index) => {
      nextOrder[getModelKey(model)] = index;
    });
    return nextOrder;
  }, [allModels]);

  const sortModels = (models: RENDERER_MODEL_META[]) =>
    [...models].sort((left, right) => {
      if (filterSort === "name") {
        return modelNameCollator.compare(left.name, right.name);
      }
      const leftRank = statusSortOrder[getModelKey(left)];
      const rightRank = statusSortOrder[getModelKey(right)];
      if (leftRank !== undefined || rightRank !== undefined) {
        if (leftRank === undefined) return 1;
        if (rightRank === undefined) return -1;
        if (leftRank !== rightRank) return leftRank - rightRank;
      }
      return modelNameCollator.compare(left.name, right.name);
    });

  const filterAndSortModels = (models: RENDERER_MODEL_META[]) =>
    sortModels(models.filter((model) => matchesSearch(model) && matchesAdvancedFilters(model)));

  const filteredProviderModels = useMemo(
    () =>
      providerModelsProp
        .map((p) => ({
          providerId: p.providerId,
          models: filterAndSortModels(p.models),
        }))
        .filter((p) => p.models.length > 0),
    [providerModelsProp, filterSort, normalizedSearchQuery, selectedCapabilities, selectedTypes, statusSortOrder],
  );

  const filteredCustomModels = useMemo(
    () => filterAndSortModels(customModelsProp),
    [customModelsProp, filterSort, normalizedSearchQuery, selectedCapabilities, selectedTypes, statusSortOrder],
  );

  const visibleModelCount =
    filteredCustomModels.length + filteredProviderModels.reduce((total, p) => total + p.models.length, 0);

  const getProviderName = (providerId: string) => {
    const p = providers.find((item) => item.id === providerId);
    return p?.name || providerId;
  };

  const getProviderPendingAction = (providerId: string) => providerBatchPending[providerId];
  const isProviderBatchPending = (providerId: string) => getProviderPendingAction(providerId) !== undefined;

  const setProviderBatchPendingAction = (providerId: string, action?: BatchAction) => {
    setProviderBatchPending((prev) => {
      const next = { ...prev };
      if (action) {
        next[providerId] = action;
      } else {
        delete next[providerId];
      }
      return next;
    });
  };

  const getBatchTargetModels = (providerId: string) => {
    const pModels = filteredProviderModels.find((p) => p.providerId === providerId)?.models ?? [];
    const pCustomModels = filteredCustomModels.filter((model) => model.providerId === providerId);
    if (pCustomModels.length === 0) return pModels;
    const dedupedModels = new Map<string, RENDERER_MODEL_META>();
    for (const model of pModels) dedupedModels.set(getModelKey(model), model);
    for (const model of pCustomModels) dedupedModels.set(getModelKey(model), model);
    return Array.from(dedupedModels.values());
  };

  const enableAllModels = async (providerId: string) => {
    if (isProviderBatchPending(providerId)) return;
    setProviderBatchPendingAction(providerId, "enable");
    try {
      await modelStore.enableAllModels(providerId, getBatchTargetModels(providerId));
    } catch (error) {
      console.error(`Failed to enable all models for provider ${providerId}:`, error);
    } finally {
      setProviderBatchPendingAction(providerId);
    }
  };

  const disableAllModels = async (providerId: string) => {
    if (isProviderBatchPending(providerId)) return;
    setProviderBatchPendingAction(providerId, "disable");
    try {
      await modelStore.disableAllModels(providerId, getBatchTargetModels(providerId));
    } catch (error) {
      console.error(`Failed to disable all models for provider ${providerId}:`, error);
    } finally {
      setProviderBatchPendingAction(providerId);
    }
  };

  const handleDeleteCustomModel = async (model: RENDERER_MODEL_META) => {
    try {
      await modelStore.removeCustomModel(model.providerId, model.id);
    } catch (error) {
      console.error("Failed to delete custom model:", error);
    }
  };

  const toggleCapabilityFilter = (capability: ModelCapabilityKey) => {
    setSelectedCapabilities((prev) =>
      prev.includes(capability) ? prev.filter((item) => item !== capability) : [...prev, capability],
    );
  };

  const toggleTypeFilter = (type: ModelType) => {
    setSelectedTypes((prev) => (prev.includes(type) ? prev.filter((item) => item !== type) : [...prev, type]));
  };

  const clearAdvancedFilters = () => {
    setSelectedCapabilities([]);
    setSelectedTypes([]);
  };

  const clearAllFilters = () => {
    clearAdvancedFilters();
  };

  const removeFilterToken = (token: FilterToken) => {
    if (token.kind === "capability") {
      setSelectedCapabilities((prev) => prev.filter((item) => item !== token.value));
      return;
    }
    setSelectedTypes((prev) => prev.filter((item) => item !== token.value));
  };

  const setSort = (sort: ModelSortKey) => {
    setFilterSort(sort);
    setSortPopoverOpen(false);
  };

  return (
    <div className="flex flex-col w-full gap-4">
      <div
        className="sticky z-30 border-b border-border/60 py-2 backdrop-blur supports-backdrop-filter:bg-background/80"
        style={{ top: `${stickyBaseOffset}px` }}
      >
        <div className="flex gap-2">
          <Input
            className="flex-1"
            value={modelSearchQuery}
            onChange={(e) => setModelSearchQuery(e.target.value)}
            placeholder="Search models..."
          />

          <Popover open={filterPopoverOpen} onOpenChange={setFilterPopoverOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={`px-3 text-xs ${activeAdvancedFilterCount ? "border-accent-400/40 bg-accent-400/10" : ""}`}
              >
                <Icon icon="lucide:funnel" className="mr-2 h-4 w-4 text-muted-foreground" />
                Filter
                {activeAdvancedFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {activeAdvancedFilterCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[320px] p-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">Filter</div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    disabled={!activeAdvancedFilterCount}
                    onClick={clearAdvancedFilters}
                  >
                    Clear
                  </Button>
                </div>

                {capabilityFilterOptions.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">Capabilities</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {capabilityFilterOptions.map((option) => (
                        <Button
                          key={option.value}
                          data-testid={`model-capability-filter-${option.value}`}
                          size="sm"
                          className="justify-between px-3 text-xs"
                          variant={selectedCapabilities.includes(option.value) ? "default" : "outline"}
                          onClick={() => toggleCapabilityFilter(option.value)}
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            <Icon icon={option.icon} className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{option.label}</span>
                          </span>
                          <span className="ml-2 text-[11px] opacity-70">{option.count}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}

                {typeFilterOptions.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-muted-foreground">Types</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {typeFilterOptions.map((option) => (
                        <Button
                          key={option.value}
                          data-testid={`model-type-filter-${option.value}`}
                          size="sm"
                          className="justify-between px-3 text-xs"
                          variant={selectedTypes.includes(option.value) ? "default" : "outline"}
                          onClick={() => toggleTypeFilter(option.value)}
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            <Icon icon={option.icon} className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate">{option.label}</span>
                          </span>
                          <span className="ml-2 text-[11px] opacity-70">{option.count}</span>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </PopoverContent>
          </Popover>

          <Popover open={sortPopoverOpen} onOpenChange={setSortPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="px-3 text-xs">
                <Icon icon="lucide:arrow-up-down" className="mr-2 h-4 w-4 text-muted-foreground" />
                {currentSortLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 p-2">
              <div className="space-y-1">
                {sortOptions.map((option) => (
                  <Button
                    key={option.value}
                    data-testid={`model-sort-${option.value}`}
                    size="sm"
                    variant="ghost"
                    className="w-full justify-between px-2 text-xs"
                    onClick={() => setSort(option.value)}
                  >
                    <span>{option.label}</span>
                    {filterSort === option.value && <Icon icon="lucide:check" className="h-2 w-2" />}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

          <AddCustomModelButton providerId={newProviderModel} onSaved={onConfigChanged} />
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {activeFilterTokens.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {activeFilterTokens.map((token) => (
                <Button
                  key={`${token.kind}-${token.value}`}
                  size="sm"
                  variant="outline"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => removeFilterToken(token)}
                >
                  <span>{token.label}</span>
                  <Icon icon="lucide:x" className="ml-1 h-3.5 w-3.5" />
                </Button>
              ))}
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={clearAllFilters}>
                Clear all
              </Button>
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            {visibleModelCount} of {totalModelCount} models
          </div>
        </div>
      </div>

      {filteredCustomModels.length > 0 && (
        <div className="relative">
          <div className="text-xs font-medium text-muted-foreground px-3 py-2">Custom</div>
          <div className="w-full border border-border/50 overflow-hidden divide-y divide-border bg-card">
            {filteredCustomModels.map((model) => (
              <ModelConfigItem
                key={model.id}
                modelName={model.name}
                modelId={model.id}
                providerId={model.providerId}
                enabled={model.enabled ?? false}
                isCustomModel={true}
                vision={model.vision}
                functionCall={model.functionCall}
                explicitFunctionCall={model.explicitFunctionCall}
                reasoning={model.reasoning}
                enableSearch={model.enableSearch}
                type={model.type ?? ModelType.Chat}
                supportedEndpointTypes={model.supportedEndpointTypes}
                endpointType={model.endpointType}
                onEnabledChange={(enabled: boolean) => onEnabledChange?.(model, enabled)}
                onDeleteModel={() => void handleDeleteCustomModel(model)}
                onConfigChanged={onConfigChanged ?? (() => {})}
              />
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-muted py-4 px-4 text-sm text-muted-foreground">
          <Icon icon="lucide:loader-2" className="w-4 h-4 animate-spin" />
          Loading...
        </div>
      ) : filteredProviderModels.length > 0 ? (
        <ScrollArea className="w-full">
          {filteredProviderModels.map((providerGroup) => (
            <div key={providerGroup.providerId}>
              <div className="flex h-9 items-center px-3 text-xs text-muted-foreground">Official</div>
              {!hasListRefinements && (
                <div className="flex h-14 items-center justify-between gap-3 overflow-hidden px-3 py-2 bg-muted/30">
                  <div className="min-w-0 flex-1 truncate text-sm font-medium">
                    {getProviderName(providerGroup.providerId)}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 min-w-8 max-w-[9rem] whitespace-nowrap rounded-lg px-2 text-xs text-normal"
                      disabled={isProviderBatchPending(providerGroup.providerId)}
                      title="Enable all"
                      onClick={() => void enableAllModels(providerGroup.providerId)}
                    >
                      <Icon
                        icon={
                          getProviderPendingAction(providerGroup.providerId) === "enable"
                            ? "lucide:loader-2"
                            : "lucide:check-circle"
                        }
                        className={`h-3.5 w-3.5 shrink-0 sm:mr-1 ${
                          getProviderPendingAction(providerGroup.providerId) === "enable" ? "animate-spin" : ""
                        }`}
                      />
                      <span className="hidden min-w-0 truncate sm:inline">Enable all</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 min-w-8 max-w-[9rem] whitespace-nowrap rounded-lg px-2 text-xs text-normal"
                      disabled={isProviderBatchPending(providerGroup.providerId)}
                      title="Disable all"
                      onClick={() => void disableAllModels(providerGroup.providerId)}
                    >
                      <Icon
                        icon={
                          getProviderPendingAction(providerGroup.providerId) === "disable"
                            ? "lucide:loader-2"
                            : "lucide:x-circle"
                        }
                        className={`h-3.5 w-3.5 shrink-0 sm:mr-1 ${
                          getProviderPendingAction(providerGroup.providerId) === "disable" ? "animate-spin" : ""
                        }`}
                      />
                      <span className="hidden min-w-0 truncate sm:inline">Disable all</span>
                    </Button>
                  </div>
                </div>
              )}
              {providerGroup.models.map((model) => (
                <div key={model.id} className="h-12 overflow-hidden bg-card">
                  <ModelConfigItem
                    modelName={model.name}
                    modelId={model.id}
                    providerId={model.providerId}
                    enabled={model.enabled ?? false}
                    isCustomModel={false}
                    vision={model.vision}
                    functionCall={model.functionCall}
                    explicitFunctionCall={model.explicitFunctionCall}
                    reasoning={model.reasoning}
                    enableSearch={model.enableSearch}
                    type={model.type ?? ModelType.Chat}
                    supportedEndpointTypes={model.supportedEndpointTypes}
                    endpointType={model.endpointType}
                    onEnabledChange={(enabled: boolean) => onEnabledChange?.(model, enabled)}
                    onDeleteModel={() => {}}
                    onConfigChanged={onConfigChanged ?? (() => {})}
                  />
                </div>
              ))}
            </div>
          ))}
        </ScrollArea>
      ) : filteredCustomModels.length === 0 ? (
        <div className="rounded-lg border py-6 px-4 text-sm text-muted-foreground text-center">No models found.</div>
      ) : null}
    </div>
  );
}
