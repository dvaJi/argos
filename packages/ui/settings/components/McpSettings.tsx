import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
import { useMcpStore } from "#/stores/mcp";
import { useLanguageStore } from "#/stores/language";
import { useToast } from "#/components/use-toast";
import { continueGuidedOnboardingFromSettings } from "../lib/guidedOnboardingSettings";
import { useRouter, useRouterState } from "@tanstack/react-router";

const windowClient = createWindowClient();

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
  const [refreshing, setRefreshing] = useState(false);
  const [customRegistryInput, setCustomRegistryInput] = useState("");
  const [npmRegistryStatus, setNpmRegistryStatus] = useState<{
    currentRegistry: string | null;
    autoDetectEnabled: boolean;
    customRegistry?: string;
  }>({ currentRegistry: null, autoDetectEnabled: true });

  const mcpEnabled = useMemo(() => mcpStore.mcpEnabled, [mcpStore.mcpEnabled]);
  const showSkeleton = useMemo(
    () => mcpStore.configLoading && !mcpStore.config.ready,
    [mcpStore.configLoading, mcpStore.config.ready],
  );
  const runningCount = useMemo(() => mcpStore.serverList.filter((s) => s.isRunning).length, [mcpStore.serverList]);
  const builtInCount = useMemo(
    () =>
      mcpStore.serverList.filter((s) => {
        const config = mcpStore.config.mcpServers[s.name];
        return config?.type === "inmemory" || config?.source === "argos";
      }).length,
    [mcpStore.serverList, mcpStore.config.mcpServers],
  );
  const customCount = useMemo(
    () => Math.max(mcpStore.serverList.length - builtInCount, 0),
    [mcpStore.serverList.length, builtInCount],
  );
  const showMcpGuide = useMemo(() => mcpGuide.showGuide && Boolean(mcpActionsEl), [mcpGuide.showGuide, mcpActionsEl]);

  const continueMcpGuide = useCallback(
    async (state: any) => {
      await continueGuidedOnboardingFromSettings({
        state,
        router: {
          navigate: async (opts) => {
            const normalizedTo = opts.to.replace(/^\/settings/, "") || "/overview";
            const navigationOptions: any = { to: normalizedTo, replace: opts.replace };
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
    },
    [router, routerState.location.pathname, routerState.location.search, windowClient],
  );

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
    void loadNpmRegistryStatus();
  }, []);

  const handleMcpEnabledChange = useCallback(
    async (enabled: boolean) => {
      await mcpStore.setMcpEnabled(enabled);
    },
    [mcpStore],
  );

  const openAddServerDialog = useCallback(() => {
    mcpServersRef.current?.openAddServerDialog();
  }, []);

  const handleMcpGuidePrimary = useCallback(async () => {
    if (mcpGuide.currentStepId !== "mcp") return;
    const stepStatus = mcpGuide.stepState?.status;
    if (stepStatus === "completed" || stepStatus === "skipped") return;
    const state = await mcpGuide.completeStep();
    await continueMcpGuide(state);
  }, [mcpGuide, continueMcpGuide]);

  const handleMcpGuideTargetInteract = useCallback(async () => {
    await handleMcpGuidePrimary();
  }, [handleMcpGuidePrimary]);

  const handleMcpGuideBack = useCallback(async () => {
    const state = await mcpGuide.activatePreviousStep();
    await continueMcpGuide(state);
  }, [mcpGuide, continueMcpGuide]);

  const handleMcpGuideSkip = useCallback(async () => {
    const state = await mcpGuide.skipStep();
    await continueMcpGuide(state);
  }, [mcpGuide, continueMcpGuide]);

  const handleMcpGuideExpert = useCallback(async () => {
    const state = await mcpGuide.forceComplete();
    await continueMcpGuide(state);
  }, [mcpGuide, continueMcpGuide]);

  const refreshNpmRegistry = useCallback(async () => {
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
    } finally {
      setRefreshing(false);
    }
  }, [mcpStore, toast]);

  const setAutoDetectNpmRegistry = useCallback(
    async (enabled: boolean) => {
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
    },
    [mcpStore, toast],
  );

  const normalizeNpmRegistryUrl = useCallback((registry: string) => {
    const trimmed = registry.trim();
    return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
  }, []);

  const validateCustomRegistry = useCallback(
    async (registry: string): Promise<boolean> => {
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
          throw new Error(`HTTP ${response.status}`);
        }

        return true;
      } catch (error) {
        console.error("Custom registry validation failed:", error);
        toast({
          title: "Registry test failed",
          description: `Could not reach ${normalizeNpmRegistryUrl(registry)}: ${error instanceof Error ? error.message : String(error)}`,
          variant: "destructive",
        });
        return false;
      }
    },
    [normalizeNpmRegistryUrl, toast],
  );

  const saveCustomNpmRegistry = useCallback(async () => {
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
  }, [customRegistryInput, mcpStore, normalizeNpmRegistryUrl, toast, validateCustomRegistry]);

  const clearCustomNpmRegistry = useCallback(async () => {
    try {
      await mcpStore.setCustomNpmRegistry(undefined);
      setCustomRegistryInput("");
      await mcpStore.clearNpmRegistryCache();
      toast({ title: "Custom registry cleared", description: "Re-detecting the best registry." });

      try {
        await mcpStore.refreshNpmRegistry();
        await loadNpmRegistryStatus();
        toast({ title: "Registry updated", description: "Optimal registry detected again." });
      } catch (detectError) {
        console.error("Failed to re-detect optimal registry:", detectError);
        await loadNpmRegistryStatus();
        toast({
          title: "Re-detect failed",
          description: "The custom registry was cleared, but registry detection failed.",
          variant: "destructive",
        });
      } finally {
        setNpmAdvancedDialogOpen(false);
      }
    } catch (error) {
      console.error("Failed to clear custom npm registry:", error);
      toast({
        title: "Update failed",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
  }, [mcpStore, toast]);

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
      <div className="shrink-0 px-4 pt-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div dir={languageStore.dir} className="min-w-0">
              <h1 className="text-lg font-semibold">MCP Center</h1>
              <p className="text-xs text-muted-foreground">Manage MCP servers and tools</p>
            </div>
            <div
              ref={setMcpActionsEl}
              className="flex shrink-0 items-center gap-3"
              onClick={() => void handleMcpGuideTargetInteract()}
            >
              {mcpEnabled && (
                <Button size="sm" onClick={openAddServerDialog}>
                  <Icon icon="lucide:plus" className="size-4" />
                  Add
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setIsMarketView(true)}>
                <Icon icon="lucide:shopping-bag" className="size-4" />
                Market
              </Button>
              <Switch dir="ltr" checked={mcpEnabled} onCheckedChange={(v) => void handleMcpEnabledChange(v)} />
            </div>
          </div>
        </div>
        <Separator className="mt-3" />
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {mcpEnabled ? (
          <McpServers
            ref={mcpServersRef}
            showFooterAddButton={false}
            statusBar={
              <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-xs text-muted-foreground">
                  Total: <span className="font-medium text-foreground">{mcpStore.serverList.length}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  Running: <span className="font-medium text-foreground">{runningCount}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  Built-in: <span className="font-medium text-foreground">{builtInCount}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  Custom: <span className="font-medium text-foreground">{customCount}</span>
                </span>
              </div>
            }
            footerActionsAfter={
              <Dialog open={npmAdvancedDialogOpen} onOpenChange={setNpmAdvancedDialogOpen}>
                <DialogTrigger
                  render={
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 max-w-[18rem] gap-1.5 px-3 text-xs"
                      title={npmRegistryStatus.currentRegistry || "Default"}
                    />
                  }
                >
                  <Icon icon="lucide:settings-2" className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden text-muted-foreground sm:inline">NPM Registry</span>
                  <span className="truncate font-mono">{npmRegistryStatus.currentRegistry || "Default"}</span>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>NPM Registry</DialogTitle>
                    <DialogDescription>
                      Configure advanced npm registry source settings for MCP installs.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">Current source</span>
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-mono text-xs">
                          {npmRegistryStatus.currentRegistry || "Default"}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={refreshing}
                          onClick={() => void refreshNpmRegistry()}
                        >
                          <Icon
                            icon={refreshing ? "lucide:loader-2" : "lucide:refresh-cw"}
                            className={refreshing ? "size-4 animate-spin" : "size-4"}
                          />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">Auto-detect optimal registry</span>
                      <Switch
                        checked={npmRegistryStatus.autoDetectEnabled}
                        onCheckedChange={(value) => void setAutoDetectNpmRegistry(value)}
                      />
                    </div>
                    <Input
                      value={customRegistryInput}
                      onChange={(e) => setCustomRegistryInput(e.target.value)}
                      placeholder="https://registry.npmjs.org/"
                      className="font-mono"
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        disabled={
                          !customRegistryInput.trim() || customRegistryInput.trim() === npmRegistryStatus.customRegistry
                        }
                        className="flex-1"
                        onClick={() => void saveCustomNpmRegistry()}
                      >
                        Save
                      </Button>
                      {npmRegistryStatus.customRegistry && (
                        <Button variant="outline" className="flex-1" onClick={() => void clearCustomNpmRegistry()}>
                          Clear
                        </Button>
                      )}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
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
