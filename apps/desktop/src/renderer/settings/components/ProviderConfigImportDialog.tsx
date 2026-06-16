import { useState, useEffect, useMemo } from "react";
import { Icon } from "@iconify/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@shadcn/components/ui/dialog";
import { Button } from "@shadcn/components/ui/button";
import { Checkbox } from "@shadcn/components/ui/checkbox";
import { Badge } from "@shadcn/components/ui/badge";
import { ScrollArea } from "@shadcn/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@shadcn/components/ui/select";
import { cn } from "@/lib/utils";
import { createProviderClient } from "@api/ProviderClient";
import { PROVIDER_IMPORT_CUSTOM_API_TYPES } from "@shared/providerImport";
import type {
  ProviderImportApplyResult,
  ProviderImportApplyResultItem,
  ProviderImportCustomApiType,
  ProviderImportProviderPreview,
  ProviderImportScanResult,
  ProviderImportSelection,
  ProviderImportSourceId,
  ProviderImportSourceScan,
} from "@shared/providerImport";

type WizardStep = "scan" | "providers" | "applying" | "done";

interface ProviderConfigImportDialogProps {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  onImportComplete?: (result: ProviderImportApplyResult) => void;
}

function apiTypeLabel(value: string): string {
  const labels: Record<string, string> = {
    "openai-completions": "OpenAI Completions",
    openai: "OpenAI Responses",
    "openai-responses": "OpenAI Responses",
    anthropic: "Anthropic",
    gemini: "Gemini",
    ollama: "Ollama",
    mistral: "Mistral",
  };
  return labels[value] ?? value;
}

const toCustomApiType = (value: string): ProviderImportCustomApiType =>
  PROVIDER_IMPORT_CUSTOM_API_TYPES.includes(value as ProviderImportCustomApiType)
    ? (value as ProviderImportCustomApiType)
    : "openai-completions";

export default function ProviderConfigImportDialog({
  open,
  onOpenChange,
  onImportComplete,
}: ProviderConfigImportDialogProps) {
  const providerClient = createProviderClient();

  const [step, setStep] = useState<WizardStep>("scan");
  const [scanResult, setScanResult] = useState<ProviderImportScanResult | null>(null);
  const [applyResult, setApplyResult] = useState<ProviderImportApplyResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [applyError, setApplyError] = useState("");
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
  const [selectedSources, setSelectedSources] = useState<Set<ProviderImportSourceId>>(new Set());
  const [selectedProvidersBySource, setSelectedProvidersBySource] = useState<Record<string, string[]>>({});
  const [selectedProviderApiTypes, setSelectedProviderApiTypes] = useState<Record<string, ProviderImportCustomApiType>>(
    {},
  );

  const customApiTypeOptions = useMemo(
    () => PROVIDER_IMPORT_CUSTOM_API_TYPES.map((value) => ({ value, label: apiTypeLabel(value) })),
    [],
  );

  const orderedSources = useMemo<ProviderImportSourceScan[]>(() => {
    if (!scanResult) return [];
    const sourceById = new Map(scanResult.sources.map((s) => [s.id, s]));
    return scanResult.sourceOrder.flatMap((sourceId) => {
      const source = sourceById.get(sourceId);
      return source ? [source] : [];
    });
  }, [scanResult]);

  const visibleSources = useMemo<ProviderImportSourceScan[]>(
    () => orderedSources.filter((s) => s.status !== "not_found" && s.status !== "unsupported_platform"),
    [orderedSources],
  );

  const selectableSourceCount = useMemo(() => visibleSources.filter((s) => s.selectable).length, [visibleSources]);

  const selectedSourceIds = useMemo(
    () => visibleSources.filter((s) => s.selectable && selectedSources.has(s.id)).map((s) => s.id),
    [visibleSources, selectedSources],
  );

  const currentSource = useMemo(() => {
    const sourceId = selectedSourceIds[currentSourceIndex];
    return orderedSources.find((s) => s.id === sourceId) ?? null;
  }, [selectedSourceIds, currentSourceIndex, orderedSources]);

  const currentSourceProviders = useMemo(
    () => (currentSource && scanResult ? scanResult.providers.filter((p) => p.sourceId === currentSource.id) : []),
    [currentSource, scanResult],
  );

  const selectedProviderCount = useMemo(
    () =>
      selectedSourceIds.reduce((count, sourceId) => {
        return count + (selectedProvidersBySource[sourceId]?.length ?? 0);
      }, 0),
    [selectedSourceIds, selectedProvidersBySource],
  );

  const canContinueFromScan = !isScanning && selectedSourceIds.length > 0;
  const canContinueFromProviders =
    step === "providers" && (currentSourceIndex < selectedSourceIds.length - 1 || selectedProviderCount > 0);

  const providerActionLabel = currentSourceIndex < selectedSourceIds.length - 1 ? "Next" : "Import";

  const activeStepKey = useMemo(() => {
    if (step === "providers") return `source-${currentSource?.id ?? "unknown"}`;
    return step;
  }, [step, currentSource]);

  const visibleSteps = useMemo(() => {
    const sources = selectedSourceIds.map((sourceId) => {
      const source = orderedSources.find((item) => item.id === sourceId);
      return { key: `source-${sourceId}`, label: source?.name ?? sourceId };
    });
    return [{ key: "scan", label: "Scan" }, ...sources, { key: "done", label: "Done" }];
  }, [selectedSourceIds, orderedSources]);

  const summaryMetrics = useMemo(() => {
    if (!applyResult) return [];
    return [
      { key: "imported", label: "Imported", value: applyResult.summary.imported },
      { key: "created", label: "Created", value: applyResult.summary.created },
      { key: "updated", label: "Updated", value: applyResult.summary.updated },
      { key: "overwritten", label: "Overwritten", value: applyResult.summary.overwritten },
      { key: "skipped", label: "Skipped", value: applyResult.summary.skipped },
      { key: "models", label: "Models", value: applyResult.summary.models },
    ];
  }, [applyResult]);

  useEffect(() => {
    if (open) {
      void initialize();
    }
  }, [open]);

  const initialize = async () => {
    setStep("scan");
    setApplyResult(null);
    setApplyError("");
    setCurrentSourceIndex(0);
    setSelectedProviderApiTypes({});
    await runScan();
  };

  const runScan = async () => {
    setIsScanning(true);
    setScanError("");
    setApplyError("");
    setSelectedProviderApiTypes({});
    try {
      const result = await providerClient.scanProviderImports();
      setScanResult(result);
      setSelectedSources(new Set(result.sources.filter((s) => s.selectable && s.defaultSelected).map((s) => s.id)));
      const bySource: Record<string, string[]> = {};
      result.providers.forEach((p) => {
        if (!p.defaultSelected) return;
        bySource[p.sourceId] = [...(bySource[p.sourceId] ?? []), p.id];
      });
      setSelectedProvidersBySource(bySource);
      const apiTypes: Record<string, ProviderImportCustomApiType> = {};
      result.providers.forEach((p) => {
        if (p.targetKind !== "custom") return;
        apiTypes[p.id] = toCustomApiType(p.targetApiType);
      });
      setSelectedProviderApiTypes(apiTypes);
    } catch (error) {
      setScanResult(null);
      setScanError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsScanning(false);
    }
  };

  const toggleSource = (sourceId: ProviderImportSourceId) => {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) next.delete(sourceId);
      else next.add(sourceId);
      return next;
    });
  };

  const toggleProvider = (providerId: string) => {
    const sourceId = currentSource?.id;
    if (!sourceId) return;
    const provider = currentSourceProviders.find((item) => item.id === providerId);
    if (!provider) return;
    setSelectedProvidersBySource((prev) => {
      const selected = new Set(prev[sourceId] ?? []);
      if (selected.has(providerId)) {
        selected.delete(providerId);
      } else {
        if (!isProviderSelectable(provider)) return prev;
        selected.add(providerId);
      }
      return { ...prev, [sourceId]: [...selected] };
    });
  };

  const isProviderSelected = (providerId: string): boolean => {
    const sourceId = currentSource?.id;
    return Boolean(sourceId && selectedProvidersBySource[sourceId]?.includes(providerId));
  };

  const selectAllCurrentProviders = () => {
    const sourceId = currentSource?.id;
    if (!sourceId) return;
    setSelectedProvidersBySource((prev) => ({
      ...prev,
      [sourceId]: currentSourceProviders.filter((p) => isProviderSelectable(p)).map((p) => p.id),
    }));
  };

  const clearCurrentProviders = () => {
    const sourceId = currentSource?.id;
    if (!sourceId) return;
    setSelectedProvidersBySource((prev) => ({ ...prev, [sourceId]: [] }));
  };

  const goToProviders = () => {
    setCurrentSourceIndex(0);
    setStep("providers");
  };

  const goBack = () => {
    if (step !== "providers") return;
    if (currentSourceIndex === 0) {
      setStep("scan");
      return;
    }
    setCurrentSourceIndex((prev) => prev - 1);
  };

  const goNextProviderStep = async () => {
    if (currentSourceIndex < selectedSourceIds.length - 1) {
      setCurrentSourceIndex((prev) => prev + 1);
      return;
    }
    if (!scanResult || selectedProviderCount === 0) return;

    setStep("applying");
    setApplyError("");
    try {
      const result = await providerClient.applyProviderImports(
        scanResult.sessionId,
        selectedSourceIds.map((sourceId) => ({
          sourceId,
          providerIds: [...(selectedProvidersBySource[sourceId] ?? [])],
          providerOptions: buildProviderOptions(selectedProvidersBySource[sourceId] ?? []),
        })),
      );
      setApplyResult(result);
      setStep("done");
      onImportComplete?.(result);
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : String(error));
      setStep("providers");
    }
  };

  const buildProviderOptions = (providerIds: string[]): ProviderImportSelection["providerOptions"] => {
    if (!scanResult) return undefined;
    const selectedIds = new Set(providerIds);
    const options: NonNullable<ProviderImportSelection["providerOptions"]> = {};
    for (const provider of scanResult.providers) {
      if (!selectedIds.has(provider.id) || provider.targetKind !== "custom") continue;
      options[provider.id] = {
        targetApiType: selectedProviderApiTypes[provider.id] || toCustomApiType(provider.targetApiType),
      };
    }
    return Object.keys(options).length > 0 ? options : undefined;
  };

  const hasRequiredPreviewCredentials = (
    provider: ProviderImportProviderPreview,
    apiType = selectedProviderApiTypes[provider.id] || toCustomApiType(provider.targetApiType),
  ): boolean => {
    if (provider.targetKind !== "custom") {
      return !provider.warnings.includes("missing_api_key");
    }
    if (apiType === "ollama") return Boolean(provider.baseUrl.trim());
    return Boolean(provider.apiKeyMasked.trim()) && Boolean(provider.baseUrl.trim());
  };

  const canEditProviderApiType = (provider: ProviderImportProviderPreview): boolean =>
    provider.targetKind === "custom" && Boolean(provider.baseUrl.trim());

  const isProviderSelectable = (provider: ProviderImportProviderPreview): boolean => {
    if (provider.targetKind === "custom") {
      return canEditProviderApiType(provider) && hasRequiredPreviewCredentials(provider);
    }
    return provider.selectable;
  };

  const warningTexts = (provider: ProviderImportProviderPreview): string[] => {
    const warnings = provider.warnings.filter((w) => w !== "missing_api_key" || provider.targetKind !== "custom");
    if (provider.targetKind === "custom" && !hasRequiredPreviewCredentials(provider)) {
      warnings.push("missing_api_key");
    }
    const warningLabels: Record<string, string> = {
      missing_api_key: "API key is required",
      missing_base_url: "Base URL is required",
    };
    return warnings.map((w) => warningLabels[w] ?? w);
  };

  const providerTargetKey = (provider: ProviderImportProviderPreview): string => {
    if (provider.targetKind === "unsupported" || !provider.targetProviderId) return "";
    if (provider.targetKind === "custom") {
      return `${provider.targetKind}:${provider.targetProviderId}:${provider.baseUrl}:${provider.apiKeyMasked}`;
    }
    return `${provider.targetKind}:${provider.targetProviderId}`;
  };

  const selectedProviderOrder = useMemo(() => {
    if (!scanResult) return [];
    return selectedSourceIds.flatMap((sourceId) => {
      const selected = new Set(selectedProvidersBySource[sourceId] ?? []);
      return scanResult!.providers.filter((p) => p.sourceId === sourceId && selected.has(p.id));
    });
  }, [scanResult, selectedSourceIds, selectedProvidersBySource]);

  const selectedProviderConflict = useMemo(() => {
    const lastByTarget = new Map<string, ProviderImportProviderPreview>();
    const firstByTarget = new Map<string, ProviderImportProviderPreview>();
    for (const provider of selectedProviderOrder) {
      const key = providerTargetKey(provider);
      if (!key) continue;
      if (!firstByTarget.has(key)) firstByTarget.set(key, provider);
      lastByTarget.set(key, provider);
    }
    return { firstByTarget, lastByTarget };
  }, [selectedProviderOrder]);

  const selectionConflictText = (provider: ProviderImportProviderPreview): string => {
    if (!selectedProvidersBySource[provider.sourceId]?.includes(provider.id)) return "";
    const key = providerTargetKey(provider);
    if (!key) return "";
    const first = selectedProviderConflict.firstByTarget.get(key);
    const last = selectedProviderConflict.lastByTarget.get(key);
    if (!first || !last || first.id === last.id) return "";
    if (last.id === provider.id) return "This will override a previous selection.";
    return "This will be overwritten by a later selection.";
  };

  const resultStatusIcon = (status: ProviderImportApplyResultItem["status"]): string => {
    switch (status) {
      case "created":
        return "lucide:plus-circle";
      case "updated":
        return "lucide:check-circle-2";
      case "overwritten":
        return "lucide:replace";
      case "skipped":
        return "lucide:circle-slash";
    }
  };

  const targetKindLabel = (targetKind: ProviderImportProviderPreview["targetKind"]): string => {
    const labels: Record<string, string> = {
      builtin: "Built-in",
      custom: "Custom",
      unsupported: "Unsupported",
    };
    return labels[targetKind] ?? targetKind;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[88vh] max-h-[88vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 border-b px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-base">
                <Icon icon="lucide:download" className="h-4 w-4 text-primary" />
                Import Provider Configuration
              </DialogTitle>
              <DialogDescription className="mt-2">
                Import provider configurations from supported applications.
              </DialogDescription>
            </div>
            <div className="hidden shrink-0 items-center gap-1 rounded-full border bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground sm:flex">
              {visibleSteps.map((s) => (
                <span
                  key={s.key}
                  className={`rounded-full px-2 py-1 ${s.key === activeStepKey ? "bg-background text-foreground" : ""}`}
                >
                  {s.label}
                </span>
              ))}
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-hidden px-6 py-5">
          {step === "scan" && (
            <div className="flex h-full min-h-0 flex-col gap-4">
              {isScanning ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3">
                  <Icon icon="lucide:loader-2" className="h-6 w-6 animate-spin text-primary" />
                  <div className="space-y-1 text-center">
                    <div className="text-sm font-medium">Scanning...</div>
                    <p className="text-xs text-muted-foreground">Looking for importable provider configurations.</p>
                  </div>
                </div>
              ) : scanError ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3">
                  <Icon icon="lucide:triangle-alert" className="h-6 w-6 text-destructive" />
                  <div className="space-y-1 text-center">
                    <div className="text-sm font-medium">Scan failed</div>
                    <p className="max-w-md text-xs text-muted-foreground">{scanError}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => void runScan()}>
                    <Icon icon="lucide:refresh-cw" className="h-4 w-4" />
                    Rescan
                  </Button>
                </div>
              ) : scanResult ? (
                <>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                    <div className="space-y-1">
                      <div className="text-sm font-medium">Sources</div>
                      <p className="text-xs text-muted-foreground">Select sources to import providers from.</p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {selectedSourceIds.length} of {selectableSourceCount} selected
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-lg border">
                    {visibleSources.map((source) => (
                      <div
                        key={source.id}
                        className={`flex items-start gap-3 border-b px-4 py-3 last:border-b-0 ${
                          source.selectable ? "bg-background" : "bg-muted/20 text-muted-foreground"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                            <div className="text-sm font-medium">{source.name}</div>
                            <Badge variant="outline" className="text-[11px]">
                              {source.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{source.providerCount} providers</span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{source.configPath}</p>
                          {source.message && <p className="mt-0.5 text-xs text-destructive">{source.message}</p>}
                        </div>
                        <Checkbox
                          className="mt-1 shrink-0"
                          checked={selectedSources.has(source.id)}
                          disabled={!source.selectable}
                          onCheckedChange={() => toggleSource(source.id)}
                        />
                      </div>
                    ))}
                  </div>

                  {selectableSourceCount === 0 && (
                    <div className="rounded-lg border border-dashed p-5 text-center">
                      <div className="text-sm font-medium">No sources found</div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        No importable provider configurations were found on your system.
                      </p>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          )}

          {step === "providers" && currentSource && (
            <div className="flex h-full min-h-0 flex-col">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium">{currentSource.name}</div>
                    <Badge variant="outline" className="text-[11px]">
                      {currentSourceIndex + 1} of {selectedSourceIds.length}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Imported providers will overwrite existing configurations with the same ID.
                  </p>
                  {applyError && <p className="text-xs text-destructive">{applyError}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={selectAllCurrentProviders}>
                    Select all
                  </Button>
                  <Button variant="outline" size="sm" onClick={clearCurrentProviders}>
                    Clear
                  </Button>
                </div>
              </div>

              <ScrollArea className="h-0 min-h-0 flex-1 pr-3">
                {currentSourceProviders.length === 0 ? (
                  <div className="rounded-lg border p-6 text-center">
                    <div className="text-sm font-medium">No providers</div>
                    <p className="mt-1 text-xs text-muted-foreground">No providers found in this source.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {currentSourceProviders.map((provider) => (
                      <div
                        key={provider.id}
                        className={`rounded-lg border p-4 ${cn(
                          !isProviderSelectable(provider) && !canEditProviderApiType(provider)
                            ? "bg-muted/20 opacity-75"
                            : "bg-background",
                          isProviderSelected(provider.id) ? "border-primary/50" : "",
                        )}`}
                      >
                        <div className="flex gap-3">
                          <Checkbox
                            className="mt-1"
                            checked={isProviderSelected(provider.id)}
                            disabled={!isProviderSelectable(provider)}
                            onCheckedChange={() => toggleProvider(provider.id)}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-sm font-medium">{provider.name}</div>
                                  <Badge
                                    variant={provider.configured ? "secondary" : "outline"}
                                    className="text-[11px]"
                                  >
                                    {provider.configured ? "Configured" : provider.sourceType}
                                  </Badge>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                  <span>{provider.sourceProviderId}</span>
                                  {provider.apiKeyMasked && <span>Key: {provider.apiKeyMasked}</span>}
                                  {provider.baseUrl && <span>{provider.baseUrl}</span>}
                                </div>
                              </div>

                              <div className="min-w-0 rounded-md border bg-muted/20 px-3 py-2 lg:w-64">
                                <div className="flex items-center gap-2 text-xs">
                                  <Badge variant="outline" className="text-[11px]">
                                    {targetKindLabel(provider.targetKind)}
                                  </Badge>
                                  <span className="truncate font-medium">
                                    {provider.targetProviderName || provider.targetProviderId}
                                  </span>
                                </div>
                                <div className="mt-1 truncate text-[11px] text-muted-foreground">
                                  {provider.targetKind === "custom"
                                    ? apiTypeLabel(
                                        selectedProviderApiTypes[provider.id] ||
                                          toCustomApiType(provider.targetApiType),
                                      )
                                    : provider.targetApiType || provider.targetProviderId}
                                </div>
                                {provider.targetKind === "custom" && (
                                  <div className="mt-2">
                                    <div className="mb-1 text-[11px] text-muted-foreground">API Type</div>
                                    <Select
                                      value={
                                        selectedProviderApiTypes[provider.id] || toCustomApiType(provider.targetApiType)
                                      }
                                      disabled={!canEditProviderApiType(provider)}
                                      onValueChange={(value) => {
                                        if (
                                          !PROVIDER_IMPORT_CUSTOM_API_TYPES.includes(
                                            value as ProviderImportCustomApiType,
                                          )
                                        )
                                          return;
                                        setSelectedProviderApiTypes((prev) => ({
                                          ...prev,
                                          [provider.id]: value as ProviderImportCustomApiType,
                                        }));
                                      }}
                                    >
                                      <SelectTrigger className="h-8 w-full text-xs">
                                        <SelectValue placeholder="Select API type" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {customApiTypeOptions.map((option) => (
                                          <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-2">
                              {provider.modelPreview.map((model) => (
                                <Badge key={model} variant="secondary" className="max-w-[12rem] truncate text-[11px]">
                                  {model}
                                </Badge>
                              ))}
                              {provider.modelCount > provider.modelPreview.length && (
                                <span className="text-xs text-muted-foreground">
                                  +{provider.modelCount - provider.modelPreview.length}
                                </span>
                              )}
                              {provider.modelCount === 0 && (
                                <span className="text-xs text-muted-foreground">No models</span>
                              )}
                            </div>

                            <div className="mt-3 flex flex-col gap-1 text-xs">
                              {warningTexts(provider).map((warning) => (
                                <p key={warning} className="text-muted-foreground">
                                  {warning}
                                </p>
                              ))}
                              {selectionConflictText(provider) && (
                                <p className="text-amber-600 dark:text-amber-400">{selectionConflictText(provider)}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}

          {step === "applying" && (
            <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3">
              <Icon icon="lucide:loader-2" className="h-6 w-6 animate-spin text-primary" />
              <div className="space-y-1 text-center">
                <div className="text-sm font-medium">Importing...</div>
                <p className="text-xs text-muted-foreground">Applying your provider selections.</p>
              </div>
            </div>
          )}

          {step === "done" && applyResult && (
            <div className="flex h-full min-h-0 flex-col gap-4">
              <div className="space-y-1">
                <div className="text-sm font-medium">Import complete</div>
                <p className="text-xs text-muted-foreground">
                  Successfully imported {applyResult.summary.imported} providers.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 md:grid-cols-6">
                {summaryMetrics.map((metric) => (
                  <div key={metric.key} className="rounded-lg border bg-muted/20 px-3 py-2">
                    <div className="text-[11px] text-muted-foreground">{metric.label}</div>
                    <div className="mt-1 text-lg font-semibold">{metric.value}</div>
                  </div>
                ))}
              </div>

              <ScrollArea className="h-0 min-h-0 flex-1 rounded-lg border">
                {applyResult.results.map((result) => (
                  <div key={result.id} className="flex items-start gap-3 border-b p-3 last:border-b-0">
                    <Icon icon={resultStatusIcon(result.status)} className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-medium">{result.name}</div>
                        <Badge variant="outline" className="text-[11px]">
                          {result.status}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {result.sourceName} -&gt; {result.targetProviderName || result.targetProviderId}
                      </p>
                      {result.message && <p className="mt-1 text-xs text-muted-foreground">{result.message}</p>}
                    </div>
                    <div className="text-xs text-muted-foreground">{result.modelCount} models</div>
                  </div>
                ))}
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t px-6 py-4">
          {step === "scan" && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          )}
          {step !== "scan" && step !== "applying" && step !== "done" && (
            <Button variant="outline" onClick={goBack}>
              Back
            </Button>
          )}
          {step === "scan" && (
            <Button variant="outline" disabled={isScanning} onClick={() => void runScan()}>
              Rescan
            </Button>
          )}
          {step === "scan" && (
            <Button disabled={!canContinueFromScan} onClick={goToProviders}>
              Next
            </Button>
          )}
          {step === "providers" && (
            <Button disabled={!canContinueFromProviders} onClick={() => void goNextProviderStep()}>
              {providerActionLabel}
            </Button>
          )}
          {step === "done" && <Button onClick={() => onOpenChange(false)}>OK</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
