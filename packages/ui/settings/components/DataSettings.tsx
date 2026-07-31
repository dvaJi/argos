import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Icon } from "@iconify/react";
import { openRuntimeExternal } from "#api/runtime";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Switch } from "#shadcn/components/ui/switch";
import { Label } from "#shadcn/components/ui/label";
import { RadioGroup, RadioGroupItem } from "#shadcn/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#shadcn/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "#shadcn/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "#shadcn/components/ui/alert-dialog";
import {
  useSyncStore,
  setSyncEnabled,
  startBackup,
  importData,
  initializeSync,
  selectSyncFolder,
  openSyncFolder,
  saveCloudConfig,
  testCloud,
  uploadToCloud,
  pullFromCloud,
} from "#/stores/sync";
import { useLanguageStore } from "#/stores/language";
import { usePresenter } from "#api/presenterBridge";
import { createOnboardingClient } from "#api/OnboardingClient";
import { createDatabaseSecurityClient } from "#api/DatabaseSecurityClient";
import { createBrowserClient } from "#api/BrowserClient";
import { cn } from "#/lib/utils";
import { useToast } from "#/components/use-toast";
import PrivacySettingsSection from "./common/PrivacySettingsSection";
import SettingsPageShell from "./control-center/SettingsPageShell";
import ProviderConfigImportDialog from "./ProviderConfigImportDialog";
import type { DatabaseRepairReport } from "@argos/shared/presenter";
import type { ProviderImportApplyResult } from "@argos/shared/providerImport";

const PUBLIC_PROVIDER_CONF_URL = "https://github.com/dvaJi/PublicProviderConf";
const CLOUDFLARE_R2_S3_DOCS_URL = "https://developers.cloudflare.com/r2/api/s3/api/";

type CloudSyncProviderMode = "r2" | "custom";

const CLOUD_SYNC_DEFAULTS = {
  region: "auto",
  prefix: "argos-backups",
};

const createDefaultCloudSyncForm = () => ({
  endpoint: "",
  bucket: "",
  region: CLOUD_SYNC_DEFAULTS.region,
  prefix: CLOUD_SYNC_DEFAULTS.prefix,
  accessKeyId: "",
  secretAccessKey: "",
});

const normalizeCloudEndpoint = (value: string) => value.trim();
const normalizeCloudBucket = (value: string) => value.trim();
const normalizeCloudRegion = (value: string) => value.trim() || CLOUD_SYNC_DEFAULTS.region;
const normalizeCloudPrefix = (value: string) => value.trim() || CLOUD_SYNC_DEFAULTS.prefix;
const normalizeCloudAccessKeyId = (value: string) => value.trim();
const normalizeCloudSecret = (value: string) => value.trim();

const validateCloudSyncForm = (
  form: ReturnType<typeof createDefaultCloudSyncForm>,
  options: { providerMode: CloudSyncProviderMode; hasStoredSecret: boolean },
) => {
  const errors: string[] = [];
  const warnings: string[] = [];
  const endpoint = normalizeCloudEndpoint(form.endpoint);
  const bucket = normalizeCloudBucket(form.bucket);
  const region = normalizeCloudRegion(form.region);
  const prefix = normalizeCloudPrefix(form.prefix);
  const accessKeyId = normalizeCloudAccessKeyId(form.accessKeyId);
  const secretAccessKey = normalizeCloudSecret(form.secretAccessKey);

  if (!endpoint) errors.push("endpointRequired");
  if (!bucket) errors.push("bucketRequired");
  if (!accessKeyId) errors.push("accessKeyRequired");
  if (!secretAccessKey && !options.hasStoredSecret) errors.push("secretRequired");
  if (options.providerMode === "custom" && !region) errors.push("regionRequired");

  if (options.providerMode === "r2" && /^[a-f0-9]{32}$/i.test(accessKeyId)) {
    warnings.push("r2AccessKeyLooksLikeAccountId");
  }

  if (
    options.providerMode === "r2" &&
    secretAccessKey &&
    (secretAccessKey.split(".").length >= 3 || secretAccessKey.length > 100)
  ) {
    errors.push("r2SecretLooksLikeApiToken");
  }

  return {
    canSave: errors.length === 0,
    errors,
    warnings,
    normalized: {
      endpoint,
      bucket,
      region,
      prefix,
      accessKeyId,
      secretAccessKey,
    },
  };
};

export default function DataSettings() {
  const { toast } = useToast();
  const languageStore = useLanguageStore();
  const syncStore = useSyncStore();
  const devicePresenter = usePresenter("devicePresenter");
  const configPresenter = usePresenter("configPresenter");
  const onboardingClient = createOnboardingClient();
  const databaseSecurityClient = createDatabaseSecurityClient();
  const browserClient = createBrowserClient();

  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isProviderImportDialogOpen, setIsProviderImportDialogOpen] = useState(false);
  const [importMode, setImportMode] = useState("increment");
  const [selectedBackup, setSelectedBackup] = useState("");
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [resetType, setResetType] = useState<"chat" | "knowledge" | "config" | "all">("chat");
  const [isResetting, setIsResetting] = useState(false);
  const [isUpdatingModelConfig, setIsUpdatingModelConfig] = useState(false);
  const [isClearingSandbox, setIsClearingSandbox] = useState(false);
  const [isClearSandboxDialogOpen, setIsClearSandboxDialogOpen] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [lastRepairReport, setLastRepairReport] = useState<DatabaseRepairReport | null>(null);
  const [cloudProviderMode, setCloudProviderMode] = useState<CloudSyncProviderMode>("r2");
  const [cloudPullMode, setCloudPullMode] = useState<"increment" | "overwrite">("increment");
  const [cloudForm, setCloudForm] = useState(createDefaultCloudSyncForm());

  const dir = languageStore.dir;
  const isBackupActive = syncStore.isBackingUp;
  const isImporting = syncStore.isImporting;
  const cloudConfig = syncStore.cloudConfig;
  const isCloudBusy = syncStore.isCloudBusy;
  const availableBackups = syncStore.backups ?? [];

  const openExternalLink = useCallback((url: string) => {
    openRuntimeExternal(url).catch(() => {
      window.open(url, "_blank", "noopener,noreferrer");
    });
  }, []);

  const setCloudProvider = useCallback((mode: CloudSyncProviderMode) => {
    setCloudProviderMode(mode);
    if (mode === "r2") {
      setCloudForm((prev) => ({
        ...prev,
        region: prev.region.trim() || CLOUD_SYNC_DEFAULTS.region,
        prefix: prev.prefix.trim() || CLOUD_SYNC_DEFAULTS.prefix,
      }));
    }
  }, []);

  const isRepairActionDisabled = isRepairing || isBackupActive || isImporting;
  const isResetActionDisabled = isResetting || isBackupActive || isImporting;
  const hasStoredCloudSecret = useMemo(() => Boolean(cloudConfig?.hasSecret), [cloudConfig?.hasSecret]);
  const cloudValidation = useMemo(
    () => validateCloudSyncForm(cloudForm, { providerMode: cloudProviderMode, hasStoredSecret: hasStoredCloudSecret }),
    [cloudForm, cloudProviderMode, hasStoredCloudSecret],
  );
  const isCloudSecretWriteUnavailable = useMemo(
    () => Boolean(cloudForm.secretAccessKey.trim()) && cloudConfig?.safeStorageAvailable === false,
    [cloudConfig?.safeStorageAvailable, cloudForm.secretAccessKey],
  );
  const isCloudSaveDisabled = useMemo(
    () => Boolean(isCloudBusy) || !cloudValidation.canSave || isCloudSecretWriteUnavailable,
    [isCloudBusy, cloudValidation.canSave, isCloudSecretWriteUnavailable],
  );
  const hasUsableCloudConfig = useMemo(
    () =>
      Boolean(
        cloudConfig?.endpoint?.trim() &&
        cloudConfig?.bucket?.trim() &&
        cloudConfig?.accessKeyId?.trim() &&
        cloudConfig?.hasSecret,
      ),
    [cloudConfig],
  );
  const isCloudOperationDisabled = useMemo(
    () => Boolean(isCloudBusy) || !hasUsableCloudConfig,
    [isCloudBusy, hasUsableCloudConfig],
  );
  const cloudSecretPlaceholder = useMemo(() => (hasStoredCloudSecret ? "Configured" : ""), [hasStoredCloudSecret]);
  const cloudSecretStatusText = useMemo(() => {
    if (hasStoredCloudSecret && !cloudForm.secretAccessKey) {
      return "Secret is stored securely. Leave blank to keep the current secret.";
    }
    return "Enter a secret to save or replace the stored cloud credential.";
  }, [hasStoredCloudSecret, cloudForm.secretAccessKey]);

  const formatBytes = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / Math.pow(1024, exponent);
    return `${value.toFixed(value >= 100 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
  };

  const formatBackupLabel = (fileName: string, createdAt: number, size: number) => {
    const date = new Date(createdAt);
    return Number.isFinite(createdAt)
      ? `${date.toLocaleString()} (${formatBytes(size)})`
      : `${fileName} (${formatBytes(size)})`;
  };

  const handleSyncEnabledChange = useCallback((value: boolean) => setSyncEnabled(value), [setSyncEnabled]);

  const handleBackup = useCallback(async () => {
    try {
      const backupInfo = await startBackup();
      if (!backupInfo) return;
      toast({
        title: "Backup successful",
        description: `${new Date(backupInfo.createdAt).toLocaleString()} (${formatBytes(backupInfo.size)})`,
        duration: 4000,
      });
    } catch (error) {
      toast({
        title: "Backup failed",
        description: error instanceof Error ? error.message : "Could not create the backup.",
        variant: "destructive",
        duration: 5000,
      });
    }
  }, [toast]);

  const persistCloudConfig = useCallback(async (): Promise<boolean> => {
    if (isCloudSaveDisabled) return false;
    await saveCloudConfig({
      endpoint: cloudValidation.normalized.endpoint,
      bucket: cloudValidation.normalized.bucket,
      region: cloudValidation.normalized.region,
      prefix: cloudValidation.normalized.prefix,
      accessKeyId: cloudValidation.normalized.accessKeyId,
      secretAccessKey: cloudValidation.normalized.secretAccessKey || undefined,
    });
    setCloudForm((prev) => ({ ...prev, secretAccessKey: "" }));
    return true;
  }, [cloudValidation.normalized, isCloudSaveDisabled]);

  const handleSaveCloud = useCallback(async () => {
    const saved = await persistCloudConfig();
    if (!saved) return;
    toast({ title: "Cloud config saved", duration: 3000 });
  }, [persistCloudConfig, toast]);

  const handleTestCloud = useCallback(async () => {
    const result = await testCloud();
    if (!result) return;
    toast({
      title: result.success ? "Test successful" : "Test failed",
      description: result.success ? undefined : result.message,
      variant: result.success ? "default" : "destructive",
      duration: 4000,
    });
  }, [toast]);

  const handleSaveAndTestCloud = useCallback(async () => {
    const saved = await persistCloudConfig();
    if (!saved) return;
    await handleTestCloud();
  }, [handleTestCloud, persistCloudConfig]);

  const handleUploadToCloud = useCallback(async () => {
    const result = await uploadToCloud();
    if (!result) return;
    toast({
      title: result.success ? "Upload successful" : "Upload failed",
      description: result.success ? undefined : result.message,
      variant: result.success ? "default" : "destructive",
      duration: 4000,
    });
  }, [toast]);

  const handlePullFromCloud = useCallback(async () => {
    const result = await pullFromCloud(cloudPullMode);
    if (!result) return;
    if (result.success) {
      toast({
        title: "Pull successful",
        description: `${result.count ?? 0} item(s) imported`,
        duration: 4000,
      });
    }
  }, [cloudPullMode, toast]);

  const handleImport = useCallback(async () => {
    if (!selectedBackup) return;
    const result = await importData(selectedBackup, importMode as "increment" | "overwrite");
    if (result?.success) {
      toast({
        title: "Import successful",
        description: `Import completed`,
        duration: 4000,
      });
    }
    setIsImportDialogOpen(false);
    setImportMode("increment");
  }, [selectedBackup, importMode, syncStore, toast]);

  const handleRefreshProviderDb = useCallback(async () => {
    if (isUpdatingModelConfig) return;
    setIsUpdatingModelConfig(true);
    try {
      const result = await configPresenter.refreshProviderDb(true);
      if (!result || result.status === "error") {
        toast({
          title: "Update failed",
          description: "Could not refresh provider database.",
          variant: "destructive",
          duration: 4000,
        });
        return;
      }
      const isUpToDate = result.status === "not-modified" || result.status === "skipped";
      toast({
        title: isUpToDate ? "Already up to date" : "Provider database updated",
        duration: 4000,
      });
    } catch {
      toast({ title: "Update failed", variant: "destructive", duration: 4000 });
    } finally {
      setIsUpdatingModelConfig(false);
    }
  }, [isUpdatingModelConfig, configPresenter, toast]);

  const handleReset = useCallback(async () => {
    if (isResetActionDisabled) return;
    setIsResetting(true);
    try {
      await devicePresenter.resetDataByType(resetType);
      setIsResetDialogOpen(false);
      setResetType("chat");
    } catch (error) {
      console.error("Failed to reset data:", error);
    } finally {
      setIsResetting(false);
    }
  }, [isResetActionDisabled, resetType, devicePresenter]);

  const handleClearSandboxData = useCallback(async () => {
    if (isClearingSandbox) return;
    setIsClearingSandbox(true);
    try {
      await browserClient.clearSandboxData();
      toast({ title: "Sandbox data cleared", duration: 4000 });
    } catch {
      toast({ title: "Failed to clear", variant: "destructive", duration: 4000 });
    } finally {
      setIsClearingSandbox(false);
      setIsClearSandboxDialogOpen(false);
    }
  }, [isClearingSandbox, browserClient, toast]);

  useEffect(() => {
    void (async () => {
      await initializeSync();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!cloudConfig) return;
    const isR2 = cloudConfig.endpoint.includes("r2.cloudflarestorage.com");
    setCloudProviderMode(isR2 ? "r2" : "custom");
    setCloudForm({
      endpoint: cloudConfig.endpoint,
      bucket: cloudConfig.bucket,
      region: cloudConfig.region || CLOUD_SYNC_DEFAULTS.region,
      prefix: cloudConfig.prefix || CLOUD_SYNC_DEFAULTS.prefix,
      accessKeyId: cloudConfig.accessKeyId,
      secretAccessKey: "",
    });
  }, [cloudConfig]);

  useEffect(() => {
    if (!availableBackups.length) {
      setSelectedBackup("");
      return;
    }
    if (!selectedBackup || !availableBackups.find((b) => b.fileName === selectedBackup)) {
      setSelectedBackup(availableBackups[0].fileName);
    }
  }, [availableBackups, selectedBackup]);

  return (
    <SettingsPageShell
      data-testid="settings-data-page"
      title="Data & Privacy"
      description="Manage your data, backups, and privacy settings"
    >
      <div className="flex w-full flex-col gap-4">
        <div className="rounded-xl border border-border bg-card/30 p-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" dir={dir}>
              <span className="flex flex-row items-center gap-2">
                <Icon icon="lucide:refresh-cw" className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Sync</span>
              </span>
              <div className="shrink-0">
                <Switch checked={syncStore.syncEnabled} onCheckedChange={handleSyncEnabledChange} />
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between" dir={dir}>
              <span className="flex flex-row items-center gap-2">
                <Icon icon="lucide:folder" className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Sync Folder</span>
              </span>
              <div className="flex w-full gap-2 lg:w-96">
                <Input
                  value={syncStore.syncFolderPath}
                  disabled={!syncStore.syncEnabled}
                  className="h-8!"
                  onClick={() => selectSyncFolder()}
                  onChange={() => {}}
                />
                <Button
                  size="icon-sm"
                  variant="outline"
                  disabled={!syncStore.syncEnabled}
                  title="Open sync folder"
                  onClick={() => openSyncFolder()}
                >
                  <Icon icon="lucide:external-link" className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between" dir={dir}>
              <span className="flex flex-row items-center gap-2">
                <Icon icon="lucide:clock" className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Last Sync</span>
              </span>
              <span className="text-sm text-muted-foreground">
                {!syncStore.lastSyncTime ? "Never" : new Date(syncStore.lastSyncTime).toLocaleString()}
              </span>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                dir={dir}
                disabled={!syncStore.syncEnabled || syncStore.isBackingUp}
                onClick={() => void handleBackup()}
              >
                <Icon
                  icon={syncStore.isBackingUp ? "lucide:loader-2" : "lucide:save"}
                  className={`h-4 w-4 text-muted-foreground ${syncStore.isBackingUp ? "animate-spin" : ""}`}
                />
                <span className="text-sm font-medium">{syncStore.isBackingUp ? "Backing up..." : "Backup Now"}</span>
              </Button>

              <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="w-full sm:w-auto" disabled={!syncStore.syncEnabled} dir={dir}>
                    <Icon icon="lucide:download" className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Import Data</span>
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Import Data</DialogTitle>
                    <DialogDescription>Select a backup to import.</DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-4 px-4 pb-4">
                    <div className="flex flex-col gap-2">
                      <Label className="text-sm font-medium" dir={dir}>
                        Select Backup
                      </Label>
                      <Select
                        value={selectedBackup}
                        onValueChange={setSelectedBackup}
                        disabled={!availableBackups.length}
                      >
                        <SelectTrigger className="h-8!" dir={dir}>
                          <SelectValue placeholder="Select a backup" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableBackups.map((backup) => (
                            <SelectItem key={backup.fileName} value={backup.fileName} dir={dir}>
                              {formatBackupLabel(backup.fileName, backup.createdAt, backup.size)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <RadioGroup value={importMode} onValueChange={setImportMode} className="flex flex-col gap-2">
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="increment" />
                        <Label>Incremental Import</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="overwrite" />
                        <Label>Overwrite Import</Label>
                      </div>
                    </RadioGroup>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsImportDialogOpen(false);
                        setImportMode("increment");
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="default"
                      disabled={syncStore.isImporting || !selectedBackup}
                      onClick={() => void handleImport()}
                    >
                      {syncStore.isImporting ? "Importing..." : "Import"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="flex flex-col gap-3 border-t border-border pt-4" dir={dir}>
              <div className="flex flex-col gap-1">
                <span className="flex flex-row items-center gap-2">
                  <Icon icon="lucide:cloud" className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Cloud Sync</span>
                </span>
                <p className="text-xs text-muted-foreground">S3-compatible cloud backup</p>
              </div>
              <div className="grid w-full gap-1 rounded-lg border border-border bg-muted/30 p-1 sm:w-fit sm:grid-cols-2">
                <button
                  type="button"
                  data-testid="cloud-provider-r2"
                  className={cn(
                    "flex h-8 items-center justify-center gap-2 rounded-md px-3 text-xs font-medium transition-colors",
                    cloudProviderMode === "r2"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setCloudProvider("r2")}
                >
                  <Icon icon="lucide:cloud" className="h-3.5 w-3.5" />
                  <span>Cloudflare R2</span>
                </button>
                <button
                  type="button"
                  data-testid="cloud-provider-custom"
                  className={cn(
                    "flex h-8 items-center justify-center gap-2 rounded-md px-3 text-xs font-medium transition-colors",
                    cloudProviderMode === "custom"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setCloudProvider("custom")}
                >
                  <Icon icon="lucide:server-cog" className="h-3.5 w-3.5" />
                  <span>Custom S3</span>
                </button>
              </div>

              {cloudProviderMode === "r2" && (
                <div className="rounded-md border border-blue-500/20 bg-blue-500/5 p-3 text-xs text-muted-foreground">
                  <div className="flex gap-2">
                    <Icon icon="lucide:info" className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                    <div className="flex min-w-0 flex-col gap-2">
                      <p className="text-foreground">Cloudflare R2 setup guide</p>
                      <div className="grid gap-2">
                        <div className="grid gap-1 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-start">
                          <span className="font-medium text-foreground">Endpoint</span>
                          <span>Use your account R2 S3 endpoint from Cloudflare.</span>
                        </div>
                        <div className="grid gap-1 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-start">
                          <span className="font-medium text-foreground">Access Key ID</span>
                          <span>Use an R2 access key, not the account identifier.</span>
                        </div>
                        <div className="grid gap-1 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-start">
                          <span className="font-medium text-foreground">Secret Access Key</span>
                          <span>Use the S3 secret for the access key pair, not an API token.</span>
                        </div>
                      </div>
                      <a
                        href={CLOUDFLARE_R2_S3_DOCS_URL}
                        className="inline-flex w-fit items-center gap-1 text-blue-600 underline-offset-4 hover:underline dark:text-blue-400"
                        onClick={(event) => {
                          event.preventDefault();
                          openExternalLink(CLOUDFLARE_R2_S3_DOCS_URL);
                        }}
                      >
                        Cloudflare R2 S3 docs
                        <Icon icon="lucide:external-link" className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <Label className="text-xs">Endpoint</Label>
                  <Input
                    value={cloudForm.endpoint}
                    className="h-8!"
                    placeholder="https://<account>.r2.cloudflarestorage.com"
                    onChange={(e) => setCloudForm((p) => ({ ...p, endpoint: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground">
                    {cloudProviderMode === "r2"
                      ? "R2 usually uses a Cloudflare account endpoint."
                      : "Use the S3-compatible HTTPS endpoint for your provider."}
                  </p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Bucket</Label>
                  <Input
                    value={cloudForm.bucket}
                    className="h-8!"
                    onChange={(e) => setCloudForm((p) => ({ ...p, bucket: e.target.value }))}
                  />
                </div>
                {cloudProviderMode === "custom" && (
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Region</Label>
                    <Input
                      value={cloudForm.region}
                      className="h-8!"
                      placeholder="auto"
                      onChange={(e) => setCloudForm((p) => ({ ...p, region: e.target.value }))}
                    />
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Access Key ID</Label>
                  <Input
                    value={cloudForm.accessKeyId}
                    className="h-8!"
                    autoComplete="off"
                    onChange={(e) => setCloudForm((p) => ({ ...p, accessKeyId: e.target.value }))}
                  />
                  {cloudValidation.warnings.includes("r2AccessKeyLooksLikeAccountId") && (
                    <p data-testid="cloud-access-key-warning" className="text-xs text-amber-600 dark:text-amber-400">
                      This looks like a Cloudflare account ID, not an R2 access key ID.
                    </p>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Secret Access Key</Label>
                  <Input
                    value={cloudForm.secretAccessKey}
                    type="password"
                    className="h-8!"
                    autoComplete="off"
                    aria-invalid={cloudValidation.errors.includes("r2SecretLooksLikeApiToken") ? "true" : undefined}
                    placeholder={cloudSecretPlaceholder}
                    onChange={(e) => setCloudForm((p) => ({ ...p, secretAccessKey: e.target.value }))}
                  />
                  {cloudValidation.errors.includes("r2SecretLooksLikeApiToken") ? (
                    <p data-testid="cloud-secret-token-error" className="text-xs text-destructive">
                      This looks like an API token. Use the R2 S3 secret access key instead.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">{cloudSecretStatusText}</p>
                  )}
                </div>
                {cloudProviderMode === "custom" && (
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <Label className="text-xs">Prefix</Label>
                    <Input
                      value={cloudForm.prefix}
                      className="h-8!"
                      placeholder="argos-backups"
                      onChange={(e) => setCloudForm((p) => ({ ...p, prefix: e.target.value }))}
                    />
                  </div>
                )}
              </div>
              {cloudProviderMode === "r2" && (
                <details className="group rounded-md border border-border/70 px-3 py-2">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-medium">
                    <span>Advanced</span>
                    <Icon
                      icon="lucide:chevron-down"
                      className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180"
                    />
                  </summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Region</Label>
                      <Input
                        value={cloudForm.region}
                        className="h-8!"
                        placeholder="auto"
                        onChange={(e) => setCloudForm((p) => ({ ...p, region: e.target.value }))}
                      />
                      <p className="text-xs text-muted-foreground">
                        Usually keep `auto` for R2 unless your setup needs otherwise.
                      </p>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Prefix</Label>
                      <Input
                        value={cloudForm.prefix}
                        className="h-8!"
                        placeholder="argos-backups"
                        onChange={(e) => setCloudForm((p) => ({ ...p, prefix: e.target.value }))}
                      />
                      <p className="text-xs text-muted-foreground">
                        Customize the cloud backup folder prefix if needed.
                      </p>
                    </div>
                  </div>
                </details>
              )}

              {cloudConfig && !cloudConfig.safeStorageAvailable && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Secure system credential storage is unavailable, so saving a new cloud secret may be limited.
                </p>
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="default"
                  className="w-full sm:w-auto"
                  data-testid="cloud-save-test"
                  disabled={isCloudSaveDisabled}
                  onClick={() => void handleSaveAndTestCloud()}
                >
                  <Icon
                    icon={isCloudBusy ? "lucide:loader-2" : "lucide:plug-zap"}
                    className={`h-4 w-4 ${isCloudBusy ? "animate-spin" : ""}`}
                  />
                  <span className="text-sm font-medium">Save & Test</span>
                </Button>
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  data-testid="cloud-save-only"
                  disabled={isCloudSaveDisabled}
                  onClick={() => void handleSaveCloud()}
                >
                  <Icon icon="lucide:save" className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Save Only</span>
                </Button>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={isCloudOperationDisabled}
                  title={!hasUsableCloudConfig ? "Save and test your cloud configuration first." : ""}
                  onClick={() => void handleUploadToCloud()}
                >
                  <Icon icon="lucide:cloud-upload" className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Upload</span>
                </Button>
                <Button
                  variant="outline"
                  className="w-full sm:w-auto"
                  disabled={isCloudOperationDisabled}
                  title={!hasUsableCloudConfig ? "Save and test your cloud configuration first." : ""}
                  onClick={() => void handlePullFromCloud()}
                >
                  <Icon icon="lucide:cloud-download" className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Pull</span>
                </Button>
                <RadioGroup
                  value={cloudPullMode}
                  onValueChange={(v) => setCloudPullMode(v as "increment" | "overwrite")}
                  className="flex flex-row gap-3"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="increment" id="cloud-increment" />
                    <Label htmlFor="cloud-increment" className="text-xs">
                      Incremental
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="overwrite" id="cloud-overwrite" />
                    <Label htmlFor="cloud-overwrite" className="text-xs">
                      Overwrite
                    </Label>
                  </div>
                </RadioGroup>
              </div>
              {!hasUsableCloudConfig && (
                <p className="text-xs text-muted-foreground">
                  Save and test your cloud configuration before upload or pull.
                </p>
              )}
            </div>
          </div>
        </div>

        <PrivacySettingsSection />

        <div className="rounded-xl border border-border bg-card/30 p-4">
          <div className="flex flex-col divide-y divide-border" dir={dir}>
            <div className="flex flex-col gap-3 py-4 first:pt-0 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex gap-3">
                <Icon icon="lucide:download" className="mt-1 h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col gap-1">
                  <div className="text-sm font-medium">Provider Import</div>
                  <p className="text-xs text-muted-foreground">Import providers from a config file.</p>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full shrink-0 lg:w-56"
                dir={dir}
                onClick={() => setIsProviderImportDialogOpen(true)}
              >
                <Icon icon="lucide:download" className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Import Providers</span>
              </Button>
            </div>

            <div className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between" dir={dir}>
              <div className="flex gap-3">
                <Icon icon="lucide:database" className="mt-1 h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col gap-1">
                  <div className="text-sm font-medium">Database Repair</div>
                  <p className="text-xs text-muted-foreground">Check and repair database schema issues.</p>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full shrink-0 lg:w-56"
                disabled={isRepairActionDisabled}
                dir={dir}
                onClick={async () => {
                  if (isRepairActionDisabled) return;
                  setIsRepairing(true);
                  try {
                    const result = await databaseSecurityClient.repairSchema();
                    setLastRepairReport(result || null);
                    toast({ title: "Repair completed", duration: 4000 });
                  } catch {
                    toast({ title: "Repair failed", variant: "destructive" });
                  } finally {
                    setIsRepairing(false);
                  }
                }}
              >
                <Icon
                  icon={isRepairing ? "lucide:loader-2" : "lucide:wrench"}
                  className={`h-4 w-4 text-muted-foreground ${isRepairing ? "animate-spin" : ""}`}
                />
                <span className="text-sm font-medium">{isRepairing ? "Repairing..." : "Repair"}</span>
              </Button>
            </div>

            <div className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between" dir={dir}>
              <div className="flex gap-3">
                <Icon icon="lucide:refresh-cw" className="mt-1 h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col gap-1">
                  <div className="text-sm font-medium">Model Config Update</div>
                  <p className="text-xs text-muted-foreground">
                    Update provider model configuration from the public repository.
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                className="w-full shrink-0 lg:w-40"
                disabled={isUpdatingModelConfig}
                dir={dir}
                onClick={() => void handleRefreshProviderDb()}
              >
                <Icon
                  icon={isUpdatingModelConfig ? "lucide:loader-2" : "lucide:refresh-cw"}
                  className={`h-4 w-4 text-muted-foreground ${isUpdatingModelConfig ? "animate-spin" : ""}`}
                />
                <span className="text-sm font-medium">{isUpdatingModelConfig ? "Updating..." : "Update"}</span>
              </Button>
            </div>

            <div className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between" dir={dir}>
              <div className="flex gap-3">
                <Icon icon="lucide:rotate-ccw" className="mt-1 h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col gap-1">
                  <div className="text-sm font-medium">Danger Zone</div>
                  <p className="text-xs text-muted-foreground">Reset or clear data permanently.</p>
                </div>
              </div>
              <AlertDialog open={isResetDialogOpen} onOpenChange={setIsResetDialogOpen}>
                <Button
                  variant="outline"
                  className="w-full shrink-0 justify-center border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive lg:w-40"
                  disabled={isResetActionDisabled}
                  dir={dir}
                  data-testid="danger-zone-reset-entry"
                  onClick={() => {
                    setResetType("chat");
                    setIsResetDialogOpen(true);
                  }}
                >
                  <Icon icon="lucide:triangle-alert" className="h-4 w-4" />
                  <span className="text-sm font-medium">Reset Data</span>
                </Button>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset Data</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete the selected data. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <div className="p-4">
                    <RadioGroup
                      value={resetType}
                      onValueChange={(v) => setResetType(v as typeof resetType)}
                      className="flex flex-col gap-3"
                    >
                      {[
                        {
                          value: "chat",
                          label: "Chat Data",
                          desc: "Delete all conversations and messages",
                        },
                        {
                          value: "knowledge",
                          label: "Knowledge Data",
                          desc: "Delete all knowledge base entries",
                        },
                        {
                          value: "config",
                          label: "Configuration",
                          desc: "Reset all settings to defaults",
                        },
                        { value: "all", label: "All Data", desc: "Delete everything" },
                      ].map((opt) => (
                        <div
                          key={opt.value}
                          className={`-m-2 flex cursor-pointer items-start space-x-3 rounded-lg border border-transparent p-2 transition-colors hover:bg-accent ${resetType === opt.value ? "border-destructive/25 bg-destructive/5" : ""}`}
                          onClick={() => setResetType(opt.value as typeof resetType)}
                        >
                          <RadioGroupItem value={opt.value} id={`reset-${opt.value}`} className="mt-1" />
                          <div className="flex flex-col">
                            <Label htmlFor={`reset-${opt.value}`} className="font-medium">
                              {opt.label}
                            </Label>
                            <p className="text-xs text-muted-foreground">{opt.desc}</p>
                          </div>
                        </div>
                      ))}
                    </RadioGroup>
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel
                      onClick={() => {
                        setIsResetDialogOpen(false);
                        setResetType("chat");
                      }}
                    >
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      className={cn("bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90")}
                      disabled={isResetActionDisabled}
                      onClick={() => void handleReset()}
                    >
                      {isResetting ? "Resetting..." : "Confirm Reset"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            <div className="flex flex-col gap-3 pt-4 lg:flex-row lg:items-center lg:justify-between" dir={dir}>
              <div className="flex gap-3">
                <Icon icon="lucide:shield" className="mt-1 h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col gap-1">
                  <div className="text-sm font-medium">Sandbox Data</div>
                  <p className="text-xs text-muted-foreground">Clear browser sandbox data.</p>
                </div>
              </div>
              <AlertDialog open={isClearSandboxDialogOpen} onOpenChange={setIsClearSandboxDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="w-full shrink-0 lg:w-56" disabled={isClearingSandbox} dir={dir}>
                    <Icon
                      icon={isClearingSandbox ? "lucide:loader-2" : "lucide:trash-2"}
                      className={`h-4 w-4 text-muted-foreground ${isClearingSandbox ? "animate-spin" : ""}`}
                    />
                    <span className="text-sm font-medium">{isClearingSandbox ? "Clearing..." : "Clear Sandbox"}</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Clear Sandbox Data</AlertDialogTitle>
                    <AlertDialogDescription>This will clear all sandbox browser data.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction disabled={isClearingSandbox} onClick={() => void handleClearSandboxData()}>
                      {isClearingSandbox ? "Clearing..." : "Confirm"}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>

        <ProviderConfigImportDialog
          open={isProviderImportDialogOpen}
          onOpenChange={setIsProviderImportDialogOpen}
          onImportComplete={(result: ProviderImportApplyResult) => {
            toast({
              title: "Import complete",
              description: `${result.summary.imported} provider(s) imported`,
            });
          }}
        />
      </div>
    </SettingsPageShell>
  );
}
