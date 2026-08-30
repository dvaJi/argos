import { useState, useEffect, useRef } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#shadcn/components/ui/dialog";
import { Input } from "#shadcn/components/ui/input";
import { Separator } from "#shadcn/components/ui/separator";
import { Switch } from "#shadcn/components/ui/switch";
import McpBuiltinMarket from "./McpBuiltinMarket";
import GuidedOnboardingOverlay from "#/components/onboarding/GuidedOnboardingOverlay";
import { McpServers, type McpServersRef } from "#/components/mcp-config/components/McpServers";
import { useGuidedOnboardingStep } from "#/composables/useGuidedOnboardingStep";
import { createWindowClient } from "#api/WindowClient";
import { createMcpClient } from "#api/McpClient";
import { useMcpStore } from "#/stores/mcp";
import { useLanguageStore } from "#/stores/language";
import { useToast } from "#/components/use-toast";
import { continueGuidedOnboardingFromSettings } from "../lib/guidedOnboardingSettings";
import { useRouter, useRouterState } from "@tanstack/react-router";
const windowClient = createWindowClient();
const npmRegistryClient = createMcpClient();
const normalizeNpmRegistryUrl = (registry: string) => {
  const trimmed = registry.trim();
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
};
const useNpmRegistrySettings = (deps: {
  mcpStore: ReturnType<typeof useMcpStore>;
  toast: ReturnType<typeof useToast>["toast"];
  onClearSuccess: () => void;
}) => {
  const { mcpStore, toast, onClearSuccess } = deps;
  const [refreshing, setRefreshing] = useState(false);
  const [customRegistryInput, setCustomRegistryInput] = useState("");
  const [npmRegistryStatus, setNpmRegistryStatus] = useState<{
    currentRegistry: string | null;
    autoDetectEnabled: boolean;
    customRegistry?: string;
  }>({
    currentRegistry: null,
    autoDetectEnabled: true,
  });
  const loadNpmRegistryStatus = async () => {
    try {
      const status = await mcpStore.getNpmRegistryStatus();
      setNpmRegistryStatus(status);
      setCustomRegistryInput(status.customRegistry || "");
    } catch (error) {
      console.error("Failed to load npm registry status:", error);
    }
  };
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const status = await npmRegistryClient.getNpmRegistryStatus();
        if (cancelled) return;
        setNpmRegistryStatus(status);
        setCustomRegistryInput(status.customRegistry || "");
      } catch (error) {
        console.error("Failed to load npm registry status:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const refreshNpmRegistry = async () => {
    try {
      setRefreshing(true);
      await mcpStore.refreshNpmRegistry();
      await loadNpmRegistryStatus();
      toast({
        title: "Registry refreshed",
        description: "The npm registry source was refreshed successfully.",
      });
    } catch (error) {
      console.error("Failed to refresh npm registry:", error);
      toast({
        title: "Refresh failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
    setRefreshing(false);
  };
  const setAutoDetectNpmRegistry = async (enabled: boolean) => {
    try {
      await mcpStore.setAutoDetectNpmRegistry(enabled);
      await loadNpmRegistryStatus();
      toast({
        title: "Registry detection updated",
        description: enabled ? "Automatic registry detection enabled." : "Automatic registry detection disabled.",
      });
    } catch (error) {
      console.error("Failed to set auto detect npm registry:", error);
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };
  const validateCustomRegistry = async (registry: string): Promise<boolean> => {
    const reportRegistryTestFailure = (error: unknown) => {
      console.error("Custom registry validation failed:", error);
      toast({
        title: "Registry test failed",
        description: `Could not reach ${normalizeNpmRegistryUrl(registry)}: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive",
      });
    };
    try {
      if (!registry.startsWith("http://") && !registry.startsWith("https://")) {
        toast({
          title: "Invalid URL",
          description: "The registry URL must start with http:// or https://.",
          variant: "destructive",
        });
        return false;
      }
      const normalizedRegistry = normalizeNpmRegistryUrl(registry);
      const testUrl = `${normalizedRegistry}tiny-runtime-injector`;
      toast({
        title: "Testing registry",
        description: `Testing ${normalizedRegistry}`,
      });
      const response = await fetch(testUrl, {
        method: "HEAD",
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        reportRegistryTestFailure(new Error(`HTTP ${response.status}`));
        return false;
      }
      return true;
    } catch (error) {
      reportRegistryTestFailure(error);
      return false;
    }
  };
  const saveCustomNpmRegistry = async () => {
    try {
      const registry = customRegistryInput.trim();
      if (!registry) return;
      const isValid = await validateCustomRegistry(registry);
      if (!isValid) return;
      await mcpStore.setCustomNpmRegistry(registry);
      await loadNpmRegistryStatus();
      const normalizedRegistry = mcpStore.getNpmRegistryStatus
        ? (await mcpStore.getNpmRegistryStatus()).customRegistry
        : registry;
      if (normalizedRegistry) {
        setCustomRegistryInput(normalizedRegistry);
      }
      toast({
        title: "Custom registry saved",
        description: `Using ${normalizedRegistry || normalizeNpmRegistryUrl(registry)}`,
      });
    } catch (error) {
      console.error("Failed to save custom npm registry:", error);
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };
  const clearCustomNpmRegistry = async () => {
    try {
      await mcpStore.setCustomNpmRegistry(undefined);
      setCustomRegistryInput("");
      await mcpStore.clearNpmRegistryCache();
      toast({
        title: "Custom registry cleared",
        description: "Re-detecting the best registry.",
      });
      try {
        await mcpStore.refreshNpmRegistry();
        await loadNpmRegistryStatus();
        toast({
          title: "Registry updated",
          description: "Optimal registry detected again.",
        });
      } catch (detectError) {
        console.error("Failed to re-detect optimal registry:", detectError);
        await loadNpmRegistryStatus();
        toast({
          title: "Re-detect failed",
          description: "The custom registry was cleared, but registry detection failed.",
          variant: "destructive",
        });
      }
      onClearSuccess();
    } catch (error) {
      console.error("Failed to clear custom npm registry:", error);
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  };
  return {
    refreshing,
    customRegistryInput,
    setCustomRegistryInput,
    npmRegistryStatus,
    refreshNpmRegistry,
    setAutoDetectNpmRegistry,
    saveCustomNpmRegistry,
    clearCustomNpmRegistry,
  };
};
export default function McpSettings() {
  const languageStore = useLanguageStore();
  const mcpStore = useMcpStore();
  const { toast } = useToast();
  const router = useRouter();
  const routerState = useRouterState();
  const mcpServersRef = useRef<McpServersRef | null>(null);
  const [guideRootEl, setGuideRootEl] = useState<HTMLDivElement | null>(null);
  const [mcpActionsEl, setMcpActionsEl] = useState<HTMLDivElement | null>(null);
  const mcpGuide = useGuidedOnboardingStep("mcp");
  const [isMarketView, setIsMarketView] = useState(false);
  const [npmAdvancedDialogOpen, setNpmAdvancedDialogOpen] = useState(false);
  const npmRegistry = useNpmRegistrySettings({
    mcpStore,
    toast,
    onClearSuccess: () => setNpmAdvancedDialogOpen(false),
  });
  const mcpEnabled = mcpStore.mcpEnabled;
  const showSkeleton = mcpStore.configLoading && !mcpStore.config.ready;
  const runningCount = mcpStore.serverList.filter((s) => s.isRunning).length;
  const builtInCount = mcpStore.serverList.filter((s) => {
    const config = mcpStore.config.mcpServers[s.name];
    return config?.type === "inmemory" || config?.source === "argos";
  }).length;
  const customCount = Math.max(mcpStore.serverList.length - builtInCount, 0);
  const showMcpGuide = mcpGuide.showGuide && Boolean(mcpActionsEl);
  const continueMcpGuide = async (state: any) => {
    await continueGuidedOnboardingFromSettings({
      state,
      router: {
        navigate: async (opts) => {
          const normalizedTo = opts.to.replace(/^\/settings/, "") || "/overview";
          const navigationOptions: any = {
            to: normalizedTo,
            replace: opts.replace,
          };
          if (opts.params) {
            navigationOptions.params = opts.params;
          }
          await router.navigate(navigationOptions);
        },
      },
      currentRoute: {
        pathname: routerState.location.pathname,
        params: routerState.location.pathname.includes("/provider") ? (routerState.location.search as any) : {},
      },
      windowClient,
    });
  };
  const handleMcpEnabledChange = async (enabled: boolean) => {
    await mcpStore.setMcpEnabled(enabled);
  };
  const openAddServerDialog = () => {
    mcpServersRef.current?.openAddServerDialog();
  };
  const handleMcpGuidePrimary = async () => {
    if (mcpGuide.currentStepId !== "mcp") return;
    const stepStatus = mcpGuide.stepState?.status;
    if (stepStatus === "completed" || stepStatus === "skipped") return;
    const state = await mcpGuide.completeStep();
    await continueMcpGuide(state);
  };
  const handleMcpGuideTargetInteract = async () => {
    await handleMcpGuidePrimary();
  };
  const handleMcpGuideBack = async () => {
    const state = await mcpGuide.activatePreviousStep();
    await continueMcpGuide(state);
  };
  const handleMcpGuideSkip = async () => {
    const state = await mcpGuide.skipStep();
    await continueMcpGuide(state);
  };
  const handleMcpGuideExpert = async () => {
    const state = await mcpGuide.forceComplete();
    await continueMcpGuide(state);
  };
  if (isMarketView) {
    return (
      <div data-testid="settings-mcp-page" className="w-full h-full">
        <McpBuiltinMarket embedded onBack={() => setIsMarketView(false)} />
      </div>
    );
  }
  if (showSkeleton) {
    return (
      <div data-testid="settings-mcp-page" className="w-full h-full flex flex-col p-4 gap-4 animate-pulse">
        <div className="h-16 rounded-xl bg-muted/40" />
        <div className="h-24 rounded-xl bg-muted/30" />
        <div className="h-10 rounded-xl bg-muted/20" />
        <div className="flex-1 rounded-xl bg-muted/20" />
      </div>
    );
  }
  return (
    <div ref={setGuideRootEl} data-testid="settings-mcp-page" className="w-full h-full min-h-0 flex flex-col">
      <McpSettingsHeader
        dir={languageStore.dir}
        mcpEnabled={mcpEnabled}
        onAdd={openAddServerDialog}
        onOpenMarket={() => setIsMarketView(true)}
        onEnabledChange={(v) => void handleMcpEnabledChange(v)}
        onGuideTargetInteract={() => void handleMcpGuideTargetInteract()}
        onActionsElRef={setMcpActionsEl}
      />

      <div className="min-h-0 flex-1 overflow-hidden">
        {mcpEnabled ? (
          <McpServers
            ref={mcpServersRef}
            showFooterAddButton={false}
            statusBar={
              <McpStatusBar
                total={mcpStore.serverList.length}
                running={runningCount}
                builtIn={builtInCount}
                custom={customCount}
              />
            }
            footerActionsAfter={
              <NpmRegistryDialog
                open={npmAdvancedDialogOpen}
                onOpenChange={setNpmAdvancedDialogOpen}
                status={npmRegistry.npmRegistryStatus}
                refreshing={npmRegistry.refreshing}
                input={npmRegistry.customRegistryInput}
                onInputChange={npmRegistry.setCustomRegistryInput}
                onRefresh={() => void npmRegistry.refreshNpmRegistry()}
                onAutoDetectChange={(value) => void npmRegistry.setAutoDetectNpmRegistry(value)}
                onSave={() => void npmRegistry.saveCustomNpmRegistry()}
                onClear={() => void npmRegistry.clearCustomNpmRegistry()}
              />
            }
          />
        ) : (
          <div className="p-8 text-center text-muted-foreground text-sm">Enable MCP to access servers</div>
        )}
      </div>

      <GuidedOnboardingOverlay
        visible={showMcpGuide}
        containerEl={guideRootEl}
        targetEl={mcpActionsEl}
        eyebrow="Guided Onboarding"
        title="Configure MCP"
        description="Enable MCP, add servers, and open the market to connect tools and capabilities."
        stepIndex={mcpGuide.stepIndex}
        totalSteps={mcpGuide.totalSteps}
        closeLabel="Close"
        backLabel={mcpGuide.canGoPrevious ? "Back" : undefined}
        secondaryLabel="Skip"
        expertLabel="Skip All"
        primaryLabel="Next"
        onClose={mcpGuide.dismissGuide}
        onBack={() => void handleMcpGuideBack()}
        onSecondary={() => void handleMcpGuideSkip()}
        onExpert={() => void handleMcpGuideExpert()}
        onPrimary={() => void handleMcpGuidePrimary()}
      />
    </div>
  );
}
const McpSettingsHeader = ({
  dir,
  mcpEnabled,
  onAdd,
  onOpenMarket,
  onEnabledChange,
  onGuideTargetInteract,
  onActionsElRef,
}: {
  dir: string;
  mcpEnabled: boolean;
  onAdd: () => void;
  onOpenMarket: () => void;
  onEnabledChange: (enabled: boolean) => void;
  onGuideTargetInteract: () => void;
  onActionsElRef: (el: HTMLDivElement | null) => void;
}) => (
  <div className="shrink-0 px-4 pt-4">
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div dir={dir} className="min-w-0">
          <h1 className="text-lg font-semibold">MCP Center</h1>
          <p className="text-xs text-muted-foreground">Manage MCP servers and tools</p>
        </div>
        <div ref={onActionsElRef} className="flex shrink-0 items-center gap-3" onClick={onGuideTargetInteract}>
          {mcpEnabled && (
            <Button size="sm" onClick={onAdd}>
              <Icon icon="lucide:plus" className="size-4" />
              Add
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onOpenMarket}>
            <Icon icon="lucide:shopping-bag" className="size-4" />
            Market
          </Button>
          <Switch dir="ltr" checked={mcpEnabled} onCheckedChange={onEnabledChange} />
        </div>
      </div>
    </div>
    <Separator className="mt-3" />
  </div>
);
const McpStatusBar = ({
  total,
  running,
  builtIn,
  custom,
}: {
  total: number;
  running: number;
  builtIn: number;
  custom: number;
}) => (
  <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
    <span className="text-xs text-muted-foreground">
      Total: <span className="font-medium text-foreground">{total}</span>
    </span>
    <span className="text-xs text-muted-foreground">
      Running: <span className="font-medium text-foreground">{running}</span>
    </span>
    <span className="text-xs text-muted-foreground">
      Built-in: <span className="font-medium text-foreground">{builtIn}</span>
    </span>
    <span className="text-xs text-muted-foreground">
      Custom: <span className="font-medium text-foreground">{custom}</span>
    </span>
  </div>
);
const NpmRegistryDialog = ({
  open,
  onOpenChange,
  status,
  refreshing,
  input,
  onInputChange,
  onRefresh,
  onAutoDetectChange,
  onSave,
  onClear,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: {
    currentRegistry: string | null;
    autoDetectEnabled: boolean;
    customRegistry?: string;
  };
  refreshing: boolean;
  input: string;
  onInputChange: (value: string) => void;
  onRefresh: () => void;
  onAutoDetectChange: (value: boolean) => void;
  onSave: () => void;
  onClear: () => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogTrigger
      render={
        <Button
          variant="outline"
          size="sm"
          className="h-8 max-w-[18rem] gap-1.5 px-3 text-xs"
          title={status.currentRegistry || "Default"}
        />
      }
    >
      <Icon icon="lucide:settings-2" className="h-3.5 w-3.5 shrink-0" />
      <span className="hidden text-muted-foreground sm:inline">NPM Registry</span>
      <span className="truncate font-mono">{status.currentRegistry || "Default"}</span>
    </DialogTrigger>
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>NPM Registry</DialogTitle>
        <DialogDescription>Configure advanced npm registry source settings for MCP installs.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">Current source</span>
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-mono text-xs">{status.currentRegistry || "Default"}</span>
            <Button variant="ghost" size="icon-sm" disabled={refreshing} onClick={onRefresh}>
              <Icon
                icon={refreshing ? "lucide:loader-2" : "lucide:refresh-cw"}
                className={refreshing ? "size-4 animate-spin" : "size-4"}
              />
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">Auto-detect optimal registry</span>
          <Switch checked={status.autoDetectEnabled} onCheckedChange={onAutoDetectChange} />
        </div>
        <Input
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder="https://registry.npmjs.org/"
          className="font-mono"
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={!input.trim() || input.trim() === status.customRegistry}
            className="flex-1"
            onClick={onSave}
          >
            Save
          </Button>
          {status.customRegistry && (
            <Button variant="outline" className="flex-1" onClick={onClear}>
              Clear
            </Button>
          )}
        </div>
      </div>
    </DialogContent>
  </Dialog>
);
