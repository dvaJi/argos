import { useState, useEffect, useRef } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRouter } from "@tanstack/react-router";
import { useProviderStore, getSortedProvidersFrom, ensureInitialized } from "#/stores/providerStore";
import { useModelStore, refreshProviderModels } from "#/stores/modelStore";
import { Icon } from "@iconify/react";
import ModelProviderSettingsDetail from "./ModelProviderSettingsDetail";
import OllamaProviderSettingsDetail from "./OllamaProviderSettingsDetail";
import BedrockProviderSettingsDetail from "./BedrockProviderSettingsDetail";
import ModelIcon from "#/components/icons/ModelIcon";
import AddCustomProviderDialog from "./AddCustomProviderDialog";
import type { AWS_BEDROCK_PROVIDER, LLM_PROVIDER } from "@argos/shared/presenter";
import { Switch } from "#shadcn/components/ui/switch";
import { Input } from "#shadcn/components/ui/input";
import { Button } from "#shadcn/components/ui/button";
import { ScrollArea } from "#shadcn/components/ui/scroll-area";
import { useThemeStore } from "#/stores/theme";
import { useLanguageStore } from "#/stores/language";
import GuidedOnboardingOverlay from "#/components/onboarding/GuidedOnboardingOverlay";
import { useGuidedOnboardingStep } from "#/composables/useGuidedOnboardingStep";
import { createWindowClient } from "#api/WindowClient";
import { continueGuidedOnboardingFromSettings } from "../lib/guidedOnboardingSettings";
import { useStartupWorkloadStore } from "#/stores/startupWorkloadStore";
const windowClient = createWindowClient();
interface ModelProviderSettingsProps {
  providerId?: string;
}
function reorderSubset(
  fullList: LLM_PROVIDER[],
  subsetBefore: LLM_PROVIDER[],
  subsetAfter: LLM_PROVIDER[],
  predicate: (provider: LLM_PROVIDER) => boolean,
): LLM_PROVIDER[] {
  const nextSubsetMap = new Map(subsetAfter.map((provider, index) => [provider.id, index]));
  const untouchedSubset = subsetBefore.filter((provider) => !nextSubsetMap.has(provider.id));
  const completeSubset = [...subsetAfter, ...untouchedSubset];
  let subsetIndex = 0;
  return fullList.map((provider) => {
    if (!predicate(provider)) {
      return provider;
    }
    const replacement = completeSubset[subsetIndex];
    subsetIndex += 1;
    return replacement ?? provider;
  });
}
function SortableProviderRow({
  provider,
  dimmed,
  selected,
  onClick,
  children,
}: {
  provider: LLM_PROVIDER;
  dimmed?: boolean;
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: provider.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={isDragging ? "z-10" : ""}
    >
      <div
        data-provider-id={provider.id}
        className={`flex flex-row items-center gap-2 rounded-lg p-2 group hover:bg-accent ${dimmed ? "opacity-60" : ""} ${selected ? "bg-accent text-accent-foreground" : ""}`}
        onClick={onClick}
      >
        <span
          {...attributes}
          {...listeners}
          className="cursor-move touch-none"
          onClick={(event) => event.stopPropagation()}
        >
          <Icon
            icon="lucide:grip-vertical"
            className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 drag-handle"
          />
        </span>
        {children}
      </div>
    </div>
  );
}
const useProviderNameEditor = (providerStore: ReturnType<typeof useProviderStore>) => {
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const startEditingName = (provider: LLM_PROVIDER, event: React.MouseEvent) => {
    event.stopPropagation();
    setEditingProviderId(provider.id);
    setEditingName(provider.name);
    setTimeout(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }, 0);
  };
  const saveEditingName = async () => {
    if (!editingProviderId || !editingName.trim()) {
      cancelEditingName();
      return;
    }
    const trimmedName = editingName.trim();
    const providerId = editingProviderId;
    setEditingProviderId(null);
    await providerStore.updateProviderConfig(providerId, {
      name: trimmedName,
    });
  };
  const cancelEditingName = () => {
    setEditingProviderId(null);
    setEditingName("");
  };
  const handleEditKeydown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      void saveEditingName();
    } else if (event.key === "Escape") {
      cancelEditingName();
    }
  };
  return {
    editingProviderId,
    editingName,
    setEditingName,
    editInputRef,
    startEditingName,
    saveEditingName,
    cancelEditingName,
    handleEditKeydown,
  };
};
export default function ModelProviderSettings({ providerId: routeProviderId }: ModelProviderSettingsProps) {
  const languageStore = useLanguageStore();
  const providerStore = useProviderStore();
  const { providers, providerOrder, providerTimestamps } = providerStore;
  const modelStore = useModelStore();
  const themeStore = useThemeStore();
  const router = useRouter();
  const providerDetailRef = useRef<HTMLDivElement | null>(null);
  const [guideRootEl, setGuideRootEl] = useState<HTMLDivElement | null>(null);
  const [providerListGuideTargetEl, setProviderListGuideTargetEl] = useState<HTMLDivElement | null>(null);
  const [providerApiKeyTargetEl] = useState<HTMLDivElement | null>(null);
  const [providerModelTargetEl] = useState<HTMLDivElement | null>(null);
  const selectProviderGuide = useGuidedOnboardingStep("select-provider");
  const providerApiKeyGuide = useGuidedOnboardingStep("provider-api-key");
  const providerModelGuide = useGuidedOnboardingStep("provider-model");
  const [isAddProviderDialogOpen, setIsAddProviderDialogOpen] = useState(false);
  const [searchQueryBase, setSearchQueryBase] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
  );
  const attachProviderListGuideTarget = (el: HTMLDivElement | null) => {
    setProviderListGuideTargetEl((el?.parentElement as HTMLDivElement | null) ?? el);
  };
  const showClearButton = searchQueryBase.trim().length > 0;
  const showSelectProviderGuide = selectProviderGuide.showGuide && Boolean(providerListGuideTargetEl);
  const showProviderApiKeyGuide = providerApiKeyGuide.showGuide && Boolean(providerApiKeyTargetEl);
  const showProviderModelGuide = providerModelGuide.showGuide && Boolean(providerModelTargetEl);
  const detailGuideStepId = (() => {
    if (providerModelGuide.currentStepId === "provider-model") return "provider-model";
    if (providerApiKeyGuide.currentStepId === "provider-api-key") return "provider-api-key";
    return null;
  })();
  const startupWorkloadStore = useStartupWorkloadStore();
  const continueProviderGuide = async (state: any) => {
    await continueGuidedOnboardingFromSettings({
      state,
      router: {
        navigate: (opts: { to: string; params?: Record<string, string>; replace?: boolean }) => {
          const to = opts.to as any;
          const params = opts.params as any;
          void router.navigate({
            to,
            params,
            replace: opts.replace,
          });
          return Promise.resolve();
        },
      },
      currentRoute: {
        params: {
          providerId: routeProviderId,
        },
      },
      windowClient,
    });
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchQueryBase);
    }, 150);
    return () => clearTimeout(timer);
  }, [searchQueryBase]);
  const clearSearch = () => {
    setSearchQueryBase("");
  };
  const filterProviders = (providerList: LLM_PROVIDER[]) => {
    if (!searchQuery.trim()) return providerList;
    const query = searchQuery.toLowerCase().trim();
    return providerList.filter((provider) => provider.name.toLowerCase().includes(query));
  };
  const visibleProviders = (() => {
    const seen = new Set<string>();
    return getSortedProvidersFrom(providers, providerOrder, providerTimestamps).filter((provider) => {
      if (provider.id === "acp" || seen.has(provider.id)) {
        return false;
      }
      seen.add(provider.id);
      return true;
    });
  })();
  const allEnabledProviders = visibleProviders.filter((p) => p.enable);
  const allDisabledProviders = visibleProviders.filter((p) => !p.enable);
  const enabledProviders = filterProviders(allEnabledProviders);
  const disabledProviders = filterProviders(allDisabledProviders);
  const showProviderSkeleton =
    (!providerStore.initialized || startupWorkloadStore?.isTaskRunning("settings.providers.summary")) &&
    visibleProviders.length === 0;
  const activeProvider = (() => {
    const provider = providerStore.providers.find((p) => p.id === routeProviderId);
    if (provider?.id === "acp") return null;
    return provider;
  })();
  const navigateToProvider = (id: string) => {
    const prefix = router.state.location.pathname.startsWith("/settings/") ? "/settings/provider" : "/provider";
    console.log("Navigating to provider:", `${prefix}/${id}`);
    void router.navigate({
      to: `${prefix}/${id}` as any,
    });
  };
  const setActiveProvider = (id: string) => {
    navigateToProvider(id);
  };

  // When the user lands on `/provider` with no `providerId` in the URL, the
  // detail pane is gated on `routeProviderId` and stays empty. Auto-select the
  // first available provider so the API key / model UI is visible immediately.
  // Runs once per providerId-less entry; subsequent clicks already call
  // `setActiveProvider` explicitly.
  useEffect(() => {
    if (routeProviderId || !providerStore.initialized) return;
    if (visibleProviders.length === 0) return;
    const fallback = allEnabledProviders[0] ?? visibleProviders[0];
    if (fallback) {
      navigateToProvider(fallback.id);
    }
    // Intentionally only react to the empty-id case so we don't fight user clicks.
  }, [routeProviderId, providerStore.initialized, visibleProviders, allEnabledProviders, navigateToProvider]);
  const handleProviderRowClick = async (id: string) => {
    setActiveProvider(id);
  };
  const scrollToProvider = (id: string) => {
    const element = document.querySelector(`[data-provider-id="${id}"]`);
    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }
  };
  const toggleProviderStatus = async (provider: LLM_PROVIDER) => {
    const willEnable = !provider.enable;
    await providerStore.updateProviderStatus(provider.id, willEnable);
    setActiveProvider(provider.id);
    if (willEnable) {
      setTimeout(() => scrollToProvider(provider.id), 100);
    }
  };
  const nameEditor = useProviderNameEditor(providerStore);
  const {
    editingProviderId,
    editingName,
    setEditingName,
    editInputRef,
    startEditingName,
    saveEditingName,
    handleEditKeydown,
  } = nameEditor;
  const handleProviderAdded = (provider: LLM_PROVIDER) => {
    setActiveProvider(provider.id);
  };
  const reorderEnabledProviders = async (activeId: string, overId: string) => {
    const oldIndex = enabledProviders.findIndex((provider) => provider.id === activeId);
    const newIndex = enabledProviders.findIndex((provider) => provider.id === overId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    const nextEnabled = arrayMove(enabledProviders, oldIndex, newIndex);
    const nextAll = searchQuery.trim()
      ? reorderSubset(visibleProviders, enabledProviders, nextEnabled, (provider) => provider.enable)
      : [...nextEnabled, ...allDisabledProviders];
    await providerStore.updateProvidersOrder(nextAll);
  };
  const reorderDisabledProviders = async (activeId: string, overId: string) => {
    const oldIndex = disabledProviders.findIndex((provider) => provider.id === activeId);
    const newIndex = disabledProviders.findIndex((provider) => provider.id === overId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    const nextDisabled = arrayMove(disabledProviders, oldIndex, newIndex);
    const nextAll = searchQuery.trim()
      ? reorderSubset(visibleProviders, disabledProviders, nextDisabled, (provider) => !provider.enable)
      : [...allEnabledProviders, ...nextDisabled];
    await providerStore.updateProvidersOrder(nextAll);
  };
  const handleEnabledDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    await reorderEnabledProviders(String(active.id), String(over.id));
  };
  const handleDisabledDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    await reorderDisabledProviders(String(active.id), String(over.id));
  };
  const renderProviderRow = (provider: LLM_PROVIDER, dimmed: boolean = false) => (
    <SortableProviderRow
      key={provider.id}
      provider={provider}
      dimmed={dimmed}
      selected={routeProviderId === provider.id}
      onClick={() => void handleProviderRowClick(provider.id)}
    >
      <ProviderRowContent
        provider={provider}
        isFirst={provider.id === visibleProviders[0]?.id}
        isEditing={editingProviderId === provider.id}
        editingName={editingName}
        onEditingNameChange={setEditingName}
        editInputRef={editInputRef}
        isDark={themeStore.isDark}
        dir={languageStore.dir}
        onAttachGuideTarget={attachProviderListGuideTarget}
        onStartEditing={startEditingName}
        onSaveEditing={() => void saveEditingName()}
        onEditKeydown={handleEditKeydown}
        onToggleStatus={() => void toggleProviderStatus(provider)}
      />
    </SortableProviderRow>
  );
  useEffect(() => {
    void ensureInitialized();
    if (!routeProviderId && visibleProviders.length > 0) {
      setActiveProvider(visibleProviders[0].id);
    }
  }, [routeProviderId, setActiveProvider, visibleProviders]);
  useEffect(() => {
    if (!routeProviderId) {
      return;
    }
    void refreshProviderModels(routeProviderId);
  }, [routeProviderId]);
  if (showProviderSkeleton) {
    return <ProviderSkeleton />;
  }
  return (
    <>
      <div ref={setGuideRootEl} data-testid="settings-provider-page" className="w-full h-full flex flex-row">
        <ProviderListPanel
          dir={languageStore.dir}
          searchQuery={searchQueryBase}
          onSearchQueryChange={setSearchQueryBase}
          showClearButton={showClearButton}
          onClearSearch={clearSearch}
          enabledProviders={enabledProviders}
          disabledProviders={disabledProviders}
          sensors={sensors}
          renderRow={renderProviderRow}
          onEnabledDragEnd={(event) => void handleEnabledDragEnd(event)}
          onDisabledDragEnd={(event) => void handleDisabledDragEnd(event)}
          onAddProvider={() => setIsAddProviderDialogOpen(true)}
        />

        <ProviderDetailPane
          activeProvider={activeProvider}
          detailGuideStepId={detailGuideStepId}
          detailRef={providerDetailRef}
        />

        <AddCustomProviderDialog
          open={isAddProviderDialogOpen}
          onOpenChange={setIsAddProviderDialogOpen}
          onProviderAdded={handleProviderAdded}
        />
      </div>

      {showSelectProviderGuide && (
        <SelectProviderGuideOverlay
          visible={showSelectProviderGuide}
          guide={selectProviderGuide}
          containerEl={guideRootEl}
          targetEl={providerListGuideTargetEl}
          hasActiveProvider={Boolean(activeProvider ?? visibleProviders[0])}
          onContinue={continueProviderGuide}
          onSelectFirstProvider={() => {
            const firstProviderId = visibleProviders[0]?.id;
            if (firstProviderId && activeProvider?.id !== firstProviderId) {
              setActiveProvider(firstProviderId);
            }
          }}
        />
      )}

      {showProviderApiKeyGuide && (
        <ProviderApiKeyGuideOverlay
          visible={showProviderApiKeyGuide}
          guide={providerApiKeyGuide}
          modelGuide={providerModelGuide}
          containerEl={guideRootEl}
          targetEl={providerApiKeyTargetEl}
          hasApiKey={Boolean(activeProvider?.apiKey?.trim())}
          onContinue={continueProviderGuide}
        />
      )}

      {showProviderModelGuide && (
        <ProviderModelGuideOverlay
          visible={showProviderModelGuide}
          guide={providerModelGuide}
          containerEl={guideRootEl}
          targetEl={providerModelTargetEl}
          onContinue={continueProviderGuide}
        />
      )}
    </>
  );
}
const ProviderRowContent = ({
  provider,
  isFirst,
  isEditing,
  editingName,
  onEditingNameChange,
  editInputRef,
  isDark,
  dir,
  onAttachGuideTarget,
  onStartEditing,
  onSaveEditing,
  onEditKeydown,
  onToggleStatus,
}: {
  provider: LLM_PROVIDER;
  isFirst: boolean;
  isEditing: boolean;
  editingName: string;
  onEditingNameChange: (value: string) => void;
  editInputRef: React.RefObject<HTMLInputElement | null>;
  isDark: boolean;
  dir: string;
  onAttachGuideTarget: (el: HTMLDivElement | null) => void;
  onStartEditing: (provider: LLM_PROVIDER, event: React.MouseEvent) => void;
  onSaveEditing: () => void;
  onEditKeydown: (event: React.KeyboardEvent) => void;
  onToggleStatus: () => void;
}) => (
  <>
    <div ref={isFirst ? onAttachGuideTarget : undefined} className="contents" />
    <ModelIcon modelId={provider.id} customClass="w-4 h-4 text-muted-foreground" isDark={isDark} />
    {isEditing ? (
      <input
        ref={editInputRef}
        value={editingName}
        onChange={(e) => onEditingNameChange(e.target.value)}
        aria-label="Provider name"
        className="text-sm font-medium flex-1 min-w-0 bg-background border border-input rounded px-2 py-0.5 outline-none focus:ring-1 focus:ring-ring"
        dir={dir}
        onBlur={onSaveEditing}
        onKeyDown={onEditKeydown}
        onClick={(e) => e.stopPropagation()}
      />
    ) : (
      <>
        <span className="text-sm font-medium flex-1 min-w-0 truncate" dir={dir}>
          {provider.name}
        </span>
        {provider.custom && (
          <Icon
            icon="lucide:pencil"
            className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-60 hover:opacity-100 shrink-0"
            onClick={(e) => onStartEditing(provider, e as any)}
          />
        )}
      </>
    )}
    <Switch
      checked={provider.enable}
      onClick={(e) => {
        e.stopPropagation();
        onToggleStatus();
      }}
    />
  </>
);
const ProviderSkeleton = () => (
  <div className="w-full h-full flex flex-row animate-pulse">
    <div className="w-80 h-full border-r p-4 space-y-3">
      <div className="h-9 rounded-md bg-muted/60" />
      {Array.from({
        length: 8,
      }).map((_, i) => (
        <div key={`provider-skeleton-${i}`} className="h-10 rounded-lg bg-muted/40" />
      ))}
      <div className="pt-2">
        <div className="h-10 rounded-lg bg-muted/50" />
      </div>
    </div>
    <div className="flex-1 p-6 space-y-4">
      <div className="h-6 w-48 rounded-md bg-muted/50" />
      <div className="h-24 rounded-xl bg-muted/40" />
      <div className="grid grid-cols-2 gap-4">
        <div className="h-20 rounded-xl bg-muted/40" />
        <div className="h-20 rounded-xl bg-muted/40" />
      </div>
      <div className="h-72 rounded-xl bg-muted/30" />
    </div>
  </div>
);
const ProviderSearchBox = ({
  value,
  onChange,
  showClearButton,
  onClear,
}: {
  value: string;
  onChange: (value: string) => void;
  showClearButton: boolean;
  onClear: () => void;
}) => (
  <div className="sticky top-4 z-10">
    <div className="relative">
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search providers..."
        className="h-9 pr-8 text-sm backdrop-blur-lg border-border"
        onKeyDown={(e) => {
          if (e.key === "Escape") onClear();
        }}
      />
      {!showClearButton ? (
        <Icon
          icon="lucide:search"
          className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
        />
      ) : (
        <Icon
          icon="lucide:x"
          className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground hover:text-foreground cursor-pointer"
          onClick={onClear}
        />
      )}
    </div>
  </div>
);
const ProviderDragSection = ({
  label,
  count,
  providers,
  sensors,
  dimmed,
  renderRow,
  onDragEnd,
}: {
  label: string;
  count: number;
  providers: LLM_PROVIDER[];
  sensors: ReturnType<typeof useSensors>;
  dimmed?: boolean;
  renderRow: (provider: LLM_PROVIDER, dimmed?: boolean) => React.ReactNode;
  onDragEnd: (event: DragEndEvent) => void;
}) => (
  <div className="flex flex-col gap-2">
    <div className="text-xs font-medium text-muted-foreground px-2">
      {label} ({count})
    </div>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={providers.map((provider) => provider.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">{providers.map((p) => renderRow(p, dimmed))}</div>
      </SortableContext>
    </DndContext>
  </div>
);
const ProviderAddButtonBar = ({ dir, onAddProvider }: { dir: string; onAddProvider: () => void }) => (
  <div className="sticky bottom-4 z-10" dir={dir}>
    <Button
      data-testid="provider-add-button"
      variant="outline"
      className="w-full flex flex-row items-center gap-2 rounded-lg p-2 backdrop-blur-lg hover:bg-accent"
      onClick={onAddProvider}
    >
      <Icon icon="lucide:plus" className="w-4 h-4 text-muted-foreground" />
      <span className="text-sm font-medium">Add Custom Provider</span>
    </Button>
  </div>
);
const ProviderListPanel = ({
  dir,
  searchQuery,
  onSearchQueryChange,
  showClearButton,
  onClearSearch,
  enabledProviders,
  disabledProviders,
  sensors,
  renderRow,
  onEnabledDragEnd,
  onDisabledDragEnd,
  onAddProvider,
}: {
  dir: string;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  showClearButton: boolean;
  onClearSearch: () => void;
  enabledProviders: LLM_PROVIDER[];
  disabledProviders: LLM_PROVIDER[];
  sensors: ReturnType<typeof useSensors>;
  renderRow: (provider: LLM_PROVIDER, dimmed?: boolean) => React.ReactNode;
  onEnabledDragEnd: (event: DragEndEvent) => void;
  onDisabledDragEnd: (event: DragEndEvent) => void;
  onAddProvider: () => void;
}) => (
  <ScrollArea className="w-80 border-r h-full">
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Model Providers</h1>
        <p className="text-xs text-muted-foreground">Configure your AI model providers and API keys.</p>
      </div>
      <ProviderSearchBox
        value={searchQuery}
        onChange={onSearchQueryChange}
        showClearButton={showClearButton}
        onClear={onClearSearch}
      />

      {enabledProviders.length > 0 && (
        <ProviderDragSection
          label="Enabled"
          count={enabledProviders.length}
          providers={enabledProviders}
          sensors={sensors}
          renderRow={renderRow}
          onDragEnd={onEnabledDragEnd}
        />
      )}

      {disabledProviders.length > 0 && (
        <ProviderDragSection
          label="Disabled"
          count={disabledProviders.length}
          providers={disabledProviders}
          sensors={sensors}
          dimmed
          renderRow={renderRow}
          onDragEnd={onDisabledDragEnd}
        />
      )}

      <ProviderAddButtonBar dir={dir} onAddProvider={onAddProvider} />
    </div>
  </ScrollArea>
);
const ProviderDetailPane = ({
  activeProvider,
  detailGuideStepId,
  detailRef,
}: {
  activeProvider: LLM_PROVIDER | null | undefined;
  detailGuideStepId: string | null;
  detailRef: React.RefObject<HTMLDivElement | null>;
}) => {
  if (!activeProvider) return null;
  return (
    <div ref={detailRef} className="flex min-w-0 flex-1">
      {activeProvider.apiType === "ollama" ? (
        <OllamaProviderSettingsDetail
          key={`ollama-${activeProvider.id}`}
          provider={activeProvider}
          onProviderConfigured={() => {}}
          onProviderModelEnabled={() => {}}
        />
      ) : activeProvider.apiType === "aws-bedrock" ? (
        <BedrockProviderSettingsDetail
          key={`bedrock-${activeProvider.id}`}
          provider={activeProvider as AWS_BEDROCK_PROVIDER}
          onProviderConfigured={() => {}}
          onProviderModelEnabled={() => {}}
        />
      ) : (
        <ModelProviderSettingsDetail
          key={`standard-${activeProvider.id}`}
          provider={activeProvider}
          activeOnboardingStepId={detailGuideStepId}
          onProviderConfigured={() => {}}
          onProviderModelEnabled={() => {}}
        />
      )}
    </div>
  );
};
type ProviderGuide = ReturnType<typeof useGuidedOnboardingStep>;
const SelectProviderGuideOverlay = ({
  visible,
  guide,
  containerEl,
  targetEl,
  hasActiveProvider,
  onContinue,
  onSelectFirstProvider,
}: {
  visible: boolean;
  guide: ProviderGuide;
  containerEl: HTMLDivElement | null;
  targetEl: HTMLDivElement | null;
  hasActiveProvider: boolean;
  onContinue: (state: any) => Promise<void>;
  onSelectFirstProvider: () => void;
}) => (
  <GuidedOnboardingOverlay
    visible={visible}
    containerEl={containerEl}
    targetEl={targetEl}
    eyebrow="Getting Started"
    title="Select a Provider"
    description="Configure your AI model providers and API keys."
    stepIndex={guide.stepIndex}
    totalSteps={guide.totalSteps}
    closeLabel="Close"
    backLabel={guide.canGoPrevious ? "Back" : undefined}
    expertLabel="Skip all"
    primaryLabel="Next"
    primaryDisabled={!hasActiveProvider}
    onClose={guide.dismissGuide}
    onBack={async () => {
      const state = await guide.activatePreviousStep();
      await onContinue(state);
    }}
    onExpert={async () => {
      const state = await guide.forceComplete();
      await onContinue(state);
    }}
    onPrimary={async () => {
      onSelectFirstProvider();
      const state = await guide.completeStep();
      await onContinue(state);
    }}
  />
);
const ProviderApiKeyGuideOverlay = ({
  visible,
  guide,
  modelGuide,
  containerEl,
  targetEl,
  hasApiKey,
  onContinue,
}: {
  visible: boolean;
  guide: ProviderGuide;
  modelGuide: ProviderGuide;
  containerEl: HTMLDivElement | null;
  targetEl: HTMLDivElement | null;
  hasApiKey: boolean;
  onContinue: (state: any) => Promise<void>;
}) => (
  <GuidedOnboardingOverlay
    visible={visible}
    containerEl={containerEl}
    targetEl={targetEl}
    eyebrow="Getting Started"
    title="Enter API Key"
    description="Configure your AI model providers and API keys."
    stepIndex={guide.stepIndex}
    totalSteps={guide.totalSteps}
    closeLabel="Close"
    backLabel={guide.canGoPrevious ? "Back" : undefined}
    secondaryLabel="Skip"
    expertLabel="Skip all"
    primaryLabel="Next"
    primaryDisabled={!hasApiKey}
    onClose={guide.dismissGuide}
    onBack={async () => {
      const state = await guide.activatePreviousStep();
      await onContinue(state);
    }}
    onSecondary={async () => {
      const skippedState = await guide.skipStep();
      if (skippedState?.currentStepId === "provider-model") {
        const skippedModelState = await modelGuide.skipStep();
        await onContinue(skippedModelState);
        return;
      }
      await onContinue(skippedState);
    }}
    onExpert={async () => {
      const state = await guide.forceComplete();
      await onContinue(state);
    }}
    onPrimary={async () => {
      const state = await guide.completeStep();
      await onContinue(state);
    }}
  />
);
const ProviderModelGuideOverlay = ({
  visible,
  guide,
  containerEl,
  targetEl,
  onContinue,
}: {
  visible: boolean;
  guide: ProviderGuide;
  containerEl: HTMLDivElement | null;
  targetEl: HTMLDivElement | null;
  onContinue: (state: any) => Promise<void>;
}) => (
  <GuidedOnboardingOverlay
    visible={visible}
    containerEl={containerEl}
    targetEl={targetEl}
    eyebrow="Getting Started"
    title="Models"
    description="Configure your AI model providers and API keys."
    stepIndex={guide.stepIndex}
    totalSteps={guide.totalSteps}
    closeLabel="Close"
    backLabel={guide.canGoPrevious ? "Back" : undefined}
    secondaryLabel="Skip"
    expertLabel="Skip all"
    primaryLabel="Next"
    primaryDisabled={false}
    onClose={guide.dismissGuide}
    onBack={async () => {
      const state = await guide.activatePreviousStep();
      await onContinue(state);
    }}
    onSecondary={async () => {
      const state = await guide.skipStep();
      await onContinue(state);
    }}
    onExpert={async () => {
      const state = await guide.forceComplete();
      await onContinue(state);
    }}
    onPrimary={async () => {
      const state = await guide.completeStep();
      await onContinue(state);
    }}
  />
);
