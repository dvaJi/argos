import { useState, useEffect, useMemo, useCallback } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Switch } from "#shadcn/components/ui/switch";
import { useToast } from "#/components/use-toast";
import { useLegacyPresenter } from "#api/legacy/presenters";
import {
  useProjectStore,
  refreshEnvironmentData,
  openDirectory,
  setDefaultProject,
  clearDefaultProject,
} from "#/stores/ui/project";
import type { EnvironmentSummary } from "@argos/shared/types/agent-interface";
import SettingsPageShell from "./control-center/SettingsPageShell";

type EnvironmentListItem = EnvironmentSummary & {
  isSyntheticDefault?: boolean;
};

export default function EnvironmentsSettings() {
  const { toast } = useToast();
  const projectStore = useProjectStore();
  const projectPresenter = useLegacyPresenter("projectPresenter", { safeCall: false });

  const [isLoading, setIsLoading] = useState(false);
  const [showMissing, setShowMissing] = useState(false);
  const [syntheticDefaultExists, setSyntheticDefaultExists] = useState(true);

  const defaultProjectPath = projectStore.defaultProjectPath;

  const sortEnvironments = useCallback(
    (list: EnvironmentListItem[]) =>
      [...list].sort((left, right) => {
        const leftDefault = left.path === defaultProjectPath;
        const rightDefault = right.path === defaultProjectPath;
        if (leftDefault !== rightDefault) return leftDefault ? -1 : 1;
        return right.lastUsedAt - left.lastUsedAt;
      }),
    [defaultProjectPath],
  );

  const syncSyntheticDefaultExists = useCallback(async () => {
    if (!defaultProjectPath) {
      setSyntheticDefaultExists(true);
      return;
    }
    const matched = projectStore.environments.find((e) => e.path === defaultProjectPath);
    if (matched) {
      setSyntheticDefaultExists(matched.exists);
      return;
    }
    try {
      const exists = await projectPresenter.pathExists(defaultProjectPath);
      setSyntheticDefaultExists(exists);
    } catch {
      setSyntheticDefaultExists(true);
    }
  }, [defaultProjectPath, projectStore.environments, projectPresenter]);

  const syntheticDefaultEnvironment = useMemo<EnvironmentListItem | null>(() => {
    if (!defaultProjectPath) return null;
    const matched = projectStore.environments.some((e) => e.path === defaultProjectPath);
    if (matched) return null;
    return {
      path: defaultProjectPath,
      name: defaultProjectPath.split(/[/\\]/).pop() ?? defaultProjectPath,
      sessionCount: 0,
      lastUsedAt: 0,
      isTemp: false,
      exists: syntheticDefaultExists,
      isSyntheticDefault: true,
    };
  }, [defaultProjectPath, projectStore.environments, syntheticDefaultExists]);

  const visibleEnvironments = useMemo(() => {
    const shouldShow = (e: EnvironmentListItem) =>
      (!e.isTemp || e.path === defaultProjectPath) && (showMissing || e.exists);
    return sortEnvironments(
      [...projectStore.environments, ...(syntheticDefaultEnvironment ? [syntheticDefaultEnvironment] : [])].filter(
        shouldShow,
      ),
    );
  }, [projectStore.environments, syntheticDefaultEnvironment, showMissing, defaultProjectPath, sortEnvironments]);

  const formatDate = useCallback((timestamp: number) => {
    if (!timestamp) return "Never";
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
  }, []);

  const refreshData = useCallback(async () => {
    try {
      setIsLoading(true);
      await refreshEnvironmentData();
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleOpen = useCallback(
    async (path: string) => {
      try {
        await openDirectory(path);
      } catch (error) {
        toast({
          title: "Failed to open",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
      }
    },
    [toast],
  );

  const handleSetDefault = useCallback(async (environment: EnvironmentListItem) => {
    if (!environment.exists) return;
    await setDefaultProject(environment.path);
  }, []);

  const handleClearDefault = useCallback(async () => {
    await clearDefaultProject();
  }, []);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  useEffect(() => {
    void syncSyntheticDefaultExists();
  }, [syncSyntheticDefaultExists, projectStore.environments]);

  return (
    <SettingsPageShell
      title="Environments"
      description="Manage project environments"
      eyebrow="Models"
      data-testid="settings-environments-page"
      actions={
        <Button variant="outline" size="sm" disabled={isLoading} onClick={() => void refreshData()}>
          <Icon icon="lucide:refresh-cw" className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      }
    >
      <div className="flex w-full flex-col gap-1.5">
        <div className="flex items-center gap-3 px-2 py-2">
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Icon icon="lucide:folder-x" className="h-4 w-4 text-muted-foreground" />
            Show missing
          </span>
          <div className="ml-auto">
            <Switch data-testid="missing-toggle" checked={showMissing} onCheckedChange={setShowMissing} />
          </div>
        </div>

        {visibleEnvironments.length === 0 ? (
          <div className="px-2 py-6 text-sm text-muted-foreground" data-testid="environments-empty">
            No environments found
          </div>
        ) : (
          visibleEnvironments.map((environment) => (
            <article
              key={environment.path}
              className="border-b border-border/50 px-2 py-3 last:border-b-0"
              data-testid="environment-row"
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/30 text-muted-foreground">
                      <Icon icon="lucide:folder" className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-medium text-foreground">{environment.name}</div>
                        {environment.path === defaultProjectPath && (
                          <span className="text-xs font-medium text-primary" data-testid="environment-badge-default">
                            Default
                          </span>
                        )}
                        {!environment.exists && <span className="text-xs text-destructive">Missing</span>}
                        {environment.isSyntheticDefault && (
                          <span className="text-xs text-muted-foreground">Not in history</span>
                        )}
                      </div>
                      <p className="mt-1 break-all text-xs text-muted-foreground">{environment.path}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {environment.sessionCount} sessions · Last used: {formatDate(environment.lastUsedAt)}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2 md:pl-4">
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label="Open"
                    onClick={() => void handleOpen(environment.path)}
                  >
                    Open
                  </Button>
                  {environment.path !== defaultProjectPath ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Set as default"
                      disabled={!environment.exists}
                      onClick={() => void handleSetDefault(environment)}
                    >
                      Set as Default
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Clear default"
                      onClick={() => void handleClearDefault()}
                    >
                      Clear Default
                    </Button>
                  )}
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </SettingsPageShell>
  );
}
