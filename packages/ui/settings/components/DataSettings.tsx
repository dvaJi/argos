import { useState, useEffect, useRef } from "react";
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
import { createDeviceClient } from "#api/DeviceClient";
import { createProviderClient } from "#api/ProviderClient";
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
const deviceClient = createDeviceClient();
const providerClient = createProviderClient();
const PUBLIC_PROVIDER_CONF_URL = "https://github.com/dvaJi/PublicProviderConf";
const CLOUDFLARE_R2_S3_DOCS_URL = "https://developers.cloudflare.com/r2/api/s3/api/";
function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${value.toFixed(value >= 100 || exponent === 0 ? 0 : 1)} ${units[exponent]}`;
}
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
type CloudSyncForm = ReturnType<typeof createDefaultCloudSyncForm>;
const normalizeCloudEndpoint = (value: string) => value.trim();
const normalizeCloudBucket = (value: string) => value.trim();
const normalizeCloudRegion = (value: string) => value.trim() || CLOUD_SYNC_DEFAULTS.region;
const normalizeCloudPrefix = (value: string) => value.trim() || CLOUD_SYNC_DEFAULTS.prefix;
const normalizeCloudAccessKeyId = (value: string) => value.trim();
const normalizeCloudSecret = (value: string) => value.trim();
const validateCloudSyncForm = (
  form: ReturnType<typeof createDefaultCloudSyncForm>,
  options: {
    providerMode: CloudSyncProviderMode;
    hasStoredSecret: boolean;
  },
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

const useCloudSyncSettings = (deps: {
  syncStore: ReturnType<typeof useSyncStore>;
  toast: ReturnType<typeof useToast>["toast"];
}) => {
  const { syncStore, toast } = deps;
  const [cloudProviderMode, setCloudProviderMode] = useState<CloudSyncProviderMode>("r2");
  const [cloudPullMode, setCloudPullMode] = useState<"increment" | "overwrite">("increment");
  const [cloudForm, setCloudForm] = useState(() => createDefaultCloudSyncForm());
  const cloudConfig = syncStore.cloudConfig;
  const isCloudBusy = syncStore.isCloudBusy;
  const setCloudProvider = (mode: CloudSyncProviderMode) => {
    setCloudProviderMode(mode);
    if (mode === "r2") {
      setCloudForm((prev) => ({
        ...prev,
        region: prev.region.trim() || CLOUD_SYNC_DEFAULTS.region,
        prefix: prev.prefix.trim() || CLOUD_SYNC_DEFAULTS.prefix,
      }));
    }
  };
  const hasStoredCloudSecret = Boolean(cloudConfig?.hasSecret);
  const cloudValidation = validateCloudSyncForm(cloudForm, {
    providerMode: cloudProviderMode,
    hasStoredSecret: hasStoredCloudSecret,
  });
  const isCloudSecretWriteUnavailable =
    Boolean(cloudForm.secretAccessKey.trim()) && cloudConfig?.safeStorageAvailable === false;
  const isCloudSaveDisabled = Boolean(isCloudBusy) || !cloudValidation.canSave || isCloudSecretWriteUnavailable;
  const hasUsableCloudConfig = Boolean(
    cloudConfig?.endpoint?.trim() &&
    cloudConfig?.bucket?.trim() &&
    cloudConfig?.accessKeyId?.trim() &&
    cloudConfig?.hasSecret,
  );
  const isCloudOperationDisabled = Boolean(isCloudBusy) || !hasUsableCloudConfig;
  const cloudSecretPlaceholder = hasStoredCloudSecret ? "Configured" : "";
  const cloudSecretStatusText = (() => {
    if (hasStoredCloudSecret && !cloudForm.secretAccessKey) {
      return "Secret is stored securely. Leave blank to keep the current secret.";
    }
    return "Enter a secret to save or replace the stored cloud credential.";
  })();
  const setCloudFormField = (field: keyof CloudSyncForm, value: string) => {
    setCloudForm((p) => ({
      ...p,
      [field]: value,
    }));
  };
  const persistCloudConfig = async (): Promise<boolean> => {
    if (isCloudSaveDisabled) return false;
    await saveCloudConfig({
      endpoint: cloudValidation.normalized.endpoint,
      bucket: cloudValidation.normalized.bucket,
      region: cloudValidation.normalized.region,
      prefix: cloudValidation.normalized.prefix,
      accessKeyId: cloudValidation.normalized.accessKeyId,
      secretAccessKey: cloudValidation.normalized.secretAccessKey || undefined,
    });
    setCloudForm((prev) => ({
      ...prev,
      secretAccessKey: "",
    }));
    return true;
  };
  const handleSaveCloud = async () => {
    const saved = await persistCloudConfig();
    if (!saved) return;
    toast({
      title: "Cloud config saved",
      duration: 3000,
    });
  };
  const handleTestCloud = async () => {
    const result = await testCloud();
    if (!result) return;
    toast({
      title: result.success ? "Test successful" : "Test failed",
      description: result.success ? undefined : result.message,
      variant: result.success ? "default" : "destructive",
      duration: 4000,
    });
  };
  const handleSaveAndTestCloud = async () => {
    const saved = await persistCloudConfig();
    if (!saved) return;
    await handleTestCloud();
  };
  const handleUploadToCloud = async () => {
    const result = await uploadToCloud();
    if (!result) return;
    toast({
      title: result.success ? "Upload successful" : "Upload failed",
      description: result.success ? undefined : result.message,
      variant: result.success ? "default" : "destructive",
      duration: 4000,
    });
  };
  const handlePullFromCloud = async () => {
    const result = await pullFromCloud(cloudPullMode);
    if (!result) return;
    if (result.success) {
      toast({
        title: "Pull successful",
        description: `${result.count ?? 0} item(s) imported`,
        duration: 4000,
      });
    }
  };

  // Mirror the cloud config coming from the sync store into the editable form
  // whenever the store publishes a different config (adjusted during render so the
  // React Compiler can track the reset).
  const [syncedCloudConfig, setSyncedCloudConfig] = useState(cloudConfig);
  if (syncedCloudConfig !== cloudConfig) {
    setSyncedCloudConfig(cloudConfig);
    if (cloudConfig) {
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
    }
  }
  return {
    cloudConfig,
    cloudProviderMode,
    setCloudProvider,
    cloudPullMode,
    setCloudPullMode,
    cloudForm,
    setCloudFormField,
    cloudValidation,
    hasStoredCloudSecret,
    cloudSecretPlaceholder,
    cloudSecretStatusText,
    isCloudBusy,
    isCloudSaveDisabled,
    hasUsableCloudConfig,
    isCloudOperationDisabled,
    handleSaveCloud,
    handleSaveAndTestCloud,
    handleUploadToCloud,
    handlePullFromCloud,
  };
};
export default function DataSettings() {
  const { toast } = useToast();
  const languageStore = useLanguageStore();
  const syncStore = useSyncStore();
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
  const cloud = useCloudSyncSettings({ syncStore, toast });
  const dir = languageStore.dir;
  const isBackupActive = syncStore.isBackingUp;
  const isImporting = syncStore.isImporting;
  const availableBackups = syncStore.backups ?? [];
  const openExternalLink = (url: string) => {
    openRuntimeExternal(url).catch(() => {
      window.open(url, "_blank", "noopener,noreferrer");
    });
  };
  const isRepairActionDisabled = isRepairing || isBackupActive || isImporting;
  const isResetActionDisabled = isResetting || isBackupActive || isImporting;

  // The effective backup selection falls back to the most recent backup whenever the
  // stored selection no longer exists (deleted, list refreshed) or nothing is selected.
  const activeSelectedBackup =
    availableBackups.find((b) => b.fileName === selectedBackup)?.fileName ?? availableBackups[0]?.fileName ?? "";
  const formatBackupLabel = (fileName: string, createdAt: number, size: number) => {
    const date = new Date(createdAt);
    return Number.isFinite(createdAt)
      ? `${date.toLocaleString()} (${formatBytes(size)})`
      : `${fileName} (${formatBytes(size)})`;
  };
  const handleSyncEnabledChange = (value: boolean) => setSyncEnabled(value);
  const handleBackup = async () => {
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
  };
  const handleImport = async () => {
    if (!activeSelectedBackup) return;
    const result = await importData(activeSelectedBackup, importMode as "increment" | "overwrite");
    if (result?.success) {
      toast({
        title: "Import successful",
        description: `Import completed`,
        duration: 4000,
      });
    }
    setIsImportDialogOpen(false);
    setImportMode("increment");
  };
  const handleRefreshProviderDb = async () => {
    if (isUpdatingModelConfig) return;
    setIsUpdatingModelConfig(true);
    try {
      const result = await providerClient.refreshProviderDb(true);
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
      toast({
        title: "Update failed",
        variant: "destructive",
        duration: 4000,
      });
      setIsUpdatingModelConfig(false);
    }
    setIsUpdatingModelConfig(false);
  };
  const handleReset = async () => {
    if (isResetActionDisabled) return;
    setIsResetting(true);
    try {
      await deviceClient.resetDataByType(resetType);
      setIsResetDialogOpen(false);
      setResetType("chat");
    } catch (error) {
      console.error("Failed to reset data:", error);
    }
    setIsResetting(false);
  };
  const handleClearSandboxData = async () => {
    if (isClearingSandbox) return;
    setIsClearingSandbox(true);
    try {
      await browserClient.clearSandboxData();
      toast({
        title: "Sandbox data cleared",
        duration: 4000,
      });
    } catch {
      toast({
        title: "Failed to clear",
        variant: "destructive",
        duration: 4000,
      });
    }
    setIsClearingSandbox(false);
    setIsClearSandboxDialogOpen(false);
  };
  const handleRepairSchema = async () => {
    if (isRepairActionDisabled) return;
    setIsRepairing(true);
    try {
      const result = await databaseSecurityClient.repairSchema();
      toast({
        title: "Repair completed",
        duration: 4000,
      });
    } catch {
      toast({
        title: "Repair failed",
        variant: "destructive",
      });
    }
    setIsRepairing(false);
  };
  useEffect(() => {
    void (async () => {
      await initializeSync();
    })();
  }, []);
  return (
    <SettingsPageShell
      data-testid="settings-data-page"
      title="Data & Privacy"
      description="Manage your data, backups, and privacy settings"
    >
      <div className="flex w-full flex-col gap-4">
        <div className="rounded-xl border border-border bg-card/30 p-4">
          <div className="flex flex-col gap-4">
            <SyncStatusRows dir={dir} syncStore={syncStore} onSyncEnabledChange={handleSyncEnabledChange} />

            <BackupActionsRow
              dir={dir}
              syncStore={syncStore}
              isImportDialogOpen={isImportDialogOpen}
              onImportDialogOpenChange={setIsImportDialogOpen}
              importMode={importMode}
              onImportModeChange={setImportMode}
              activeSelectedBackup={activeSelectedBackup}
              onSelectedBackupChange={setSelectedBackup}
              availableBackups={availableBackups}
              formatBackupLabel={formatBackupLabel}
              onBackup={() => void handleBackup()}
              onImport={() => void handleImport()}
              onCancelImport={() => {
                setIsImportDialogOpen(false);
                setImportMode("increment");
              }}
            />

            <CloudSyncSection
              dir={dir}
              cloud={cloud}
              onFieldChange={cloud.setCloudFormField}
              onOpenExternal={openExternalLink}
            />
          </div>
        </div>

        <PrivacySettingsSection />

        <div className="rounded-xl border border-border bg-card/30 p-4">
          <div className="flex flex-col divide-y divide-border" dir={dir}>
            <ProviderImportRow dir={dir} onOpen={() => setIsProviderImportDialogOpen(true)} />

            <DatabaseRepairRow
              dir={dir}
              disabled={isRepairActionDisabled}
              repairing={isRepairing}
              onRepair={() => void handleRepairSchema()}
            />

            <ModelConfigUpdateRow
              dir={dir}
              updating={isUpdatingModelConfig}
              onUpdate={() => void handleRefreshProviderDb()}
            />

            <DangerZoneRow
              dir={dir}
              disabled={isResetActionDisabled}
              resetting={isResetting}
              resetType={resetType}
              onResetTypeChange={setResetType}
              dialogOpen={isResetDialogOpen}
              onDialogOpenChange={setIsResetDialogOpen}
              onReset={() => void handleReset()}
            />

            <SandboxDataRow
              dir={dir}
              clearing={isClearingSandbox}
              dialogOpen={isClearSandboxDialogOpen}
              onDialogOpenChange={setIsClearSandboxDialogOpen}
              onClear={() => void handleClearSandboxData()}
            />
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
const SyncStatusRows = ({
  dir,
  syncStore,
  onSyncEnabledChange,
}: {
  dir: string;
  syncStore: ReturnType<typeof useSyncStore>;
  onSyncEnabledChange: (value: boolean) => void;
}) => (
  <>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" dir={dir}>
      <span className="flex flex-row items-center gap-2">
        <Icon icon="lucide:refresh-cw" className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Sync</span>
      </span>
      <div className="shrink-0">
        <Switch checked={syncStore.syncEnabled} onCheckedChange={onSyncEnabledChange} />
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
  </>
);
const ImportDataDialog = ({
  dir,
  syncStore,
  open,
  onOpenChange,
  importMode,
  onImportModeChange,
  activeSelectedBackup,
  onSelectedBackupChange,
  availableBackups,
  formatBackupLabel,
  onImport,
  onCancel,
}: {
  dir: string;
  syncStore: ReturnType<typeof useSyncStore>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importMode: string;
  onImportModeChange: (mode: string) => void;
  activeSelectedBackup: string;
  onSelectedBackupChange: (value: string) => void;
  availableBackups: Array<{ fileName: string; createdAt: number; size: number }>;
  formatBackupLabel: (fileName: string, createdAt: number, size: number) => string;
  onImport: () => void;
  onCancel: () => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogTrigger
      render={<Button variant="outline" className="w-full sm:w-auto" disabled={!syncStore.syncEnabled} dir={dir} />}
    >
      <Icon icon="lucide:download" className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm font-medium">Import Data</span>
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
            value={activeSelectedBackup}
            onValueChange={(v) => onSelectedBackupChange(v ?? "")}
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
        <RadioGroup value={importMode} onValueChange={onImportModeChange} className="flex flex-col gap-2">
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
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="default" disabled={syncStore.isImporting || !activeSelectedBackup} onClick={onImport}>
          {syncStore.isImporting ? "Importing..." : "Import"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
const BackupActionsRow = ({
  dir,
  syncStore,
  isImportDialogOpen,
  onImportDialogOpenChange,
  importMode,
  onImportModeChange,
  activeSelectedBackup,
  onSelectedBackupChange,
  availableBackups,
  formatBackupLabel,
  onBackup,
  onImport,
  onCancelImport,
}: {
  dir: string;
  syncStore: ReturnType<typeof useSyncStore>;
  isImportDialogOpen: boolean;
  onImportDialogOpenChange: (open: boolean) => void;
  importMode: string;
  onImportModeChange: (mode: string) => void;
  activeSelectedBackup: string;
  onSelectedBackupChange: (value: string) => void;
  availableBackups: Array<{ fileName: string; createdAt: number; size: number }>;
  formatBackupLabel: (fileName: string, createdAt: number, size: number) => string;
  onBackup: () => void;
  onImport: () => void;
  onCancelImport: () => void;
}) => (
  <div className="flex flex-col gap-2 sm:flex-row">
    <Button
      variant="outline"
      className="w-full sm:w-auto"
      dir={dir}
      disabled={!syncStore.syncEnabled || syncStore.isBackingUp}
      onClick={onBackup}
    >
      <Icon
        icon={syncStore.isBackingUp ? "lucide:loader-2" : "lucide:save"}
        className={`h-4 w-4 text-muted-foreground ${syncStore.isBackingUp ? "animate-spin" : ""}`}
      />
      <span className="text-sm font-medium">{syncStore.isBackingUp ? "Backing up..." : "Backup Now"}</span>
    </Button>

    <ImportDataDialog
      dir={dir}
      syncStore={syncStore}
      open={isImportDialogOpen}
      onOpenChange={onImportDialogOpenChange}
      importMode={importMode}
      onImportModeChange={onImportModeChange}
      activeSelectedBackup={activeSelectedBackup}
      onSelectedBackupChange={onSelectedBackupChange}
      availableBackups={availableBackups}
      formatBackupLabel={formatBackupLabel}
      onImport={onImport}
      onCancel={onCancelImport}
    />
  </div>
);
const CloudProviderToggle = ({
  mode,
  onChange,
}: {
  mode: CloudSyncProviderMode;
  onChange: (mode: CloudSyncProviderMode) => void;
}) => (
  <div className="grid w-full gap-1 rounded-lg border border-border bg-muted/30 p-1 sm:w-fit sm:grid-cols-2">
    <button
      type="button"
      data-testid="cloud-provider-r2"
      className={cn(
        "flex h-8 items-center justify-center gap-2 rounded-md px-3 text-xs font-medium transition-colors",
        mode === "r2" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
      onClick={() => onChange("r2")}
    >
      <Icon icon="lucide:cloud" className="h-3.5 w-3.5" />
      <span>Cloudflare R2</span>
    </button>
    <button
      type="button"
      data-testid="cloud-provider-custom"
      className={cn(
        "flex h-8 items-center justify-center gap-2 rounded-md px-3 text-xs font-medium transition-colors",
        mode === "custom" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
      onClick={() => onChange("custom")}
    >
      <Icon icon="lucide:server-cog" className="h-3.5 w-3.5" />
      <span>Custom S3</span>
    </button>
  </div>
);
const CloudR2Guide = ({ onOpenExternal }: { onOpenExternal: (url: string) => void }) => (
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
            onOpenExternal(CLOUDFLARE_R2_S3_DOCS_URL);
          }}
        >
          Cloudflare R2 S3 docs
          <Icon icon="lucide:external-link" className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  </div>
);
const CloudFormFields = ({
  cloudForm,
  onFieldChange,
  providerMode,
  validationErrors,
  validationWarnings,
  secretPlaceholder,
  secretStatusText,
}: {
  cloudForm: CloudSyncForm;
  onFieldChange: (field: keyof CloudSyncForm, value: string) => void;
  providerMode: CloudSyncProviderMode;
  validationErrors: string[];
  validationWarnings: string[];
  secretPlaceholder: string;
  secretStatusText: string;
}) => (
  <div className="grid gap-3 sm:grid-cols-2">
    <div className="flex flex-col gap-1.5 sm:col-span-2">
      <Label className="text-xs">Endpoint</Label>
      <Input
        value={cloudForm.endpoint}
        className="h-8!"
        placeholder="https://<account>.r2.cloudflarestorage.com"
        onChange={(e) => onFieldChange("endpoint", e.target.value)}
      />
      <p className="text-xs text-muted-foreground">
        {providerMode === "r2"
          ? "R2 usually uses a Cloudflare account endpoint."
          : "Use the S3-compatible HTTPS endpoint for your provider."}
      </p>
    </div>
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">Bucket</Label>
      <Input value={cloudForm.bucket} className="h-8!" onChange={(e) => onFieldChange("bucket", e.target.value)} />
    </div>
    {providerMode === "custom" && (
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Region</Label>
        <Input
          value={cloudForm.region}
          className="h-8!"
          placeholder="auto"
          onChange={(e) => onFieldChange("region", e.target.value)}
        />
      </div>
    )}
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs">Access Key ID</Label>
      <Input
        value={cloudForm.accessKeyId}
        className="h-8!"
        autoComplete="off"
        onChange={(e) => onFieldChange("accessKeyId", e.target.value)}
      />
      {validationWarnings.includes("r2AccessKeyLooksLikeAccountId") && (
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
        aria-invalid={validationErrors.includes("r2SecretLooksLikeApiToken") ? "true" : undefined}
        placeholder={secretPlaceholder}
        onChange={(e) => onFieldChange("secretAccessKey", e.target.value)}
      />
      {validationErrors.includes("r2SecretLooksLikeApiToken") ? (
        <p data-testid="cloud-secret-token-error" className="text-xs text-destructive">
          This looks like an API token. Use the R2 S3 secret access key instead.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">{secretStatusText}</p>
      )}
    </div>
    {providerMode === "custom" && (
      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label className="text-xs">Prefix</Label>
        <Input
          value={cloudForm.prefix}
          className="h-8!"
          placeholder="argos-backups"
          onChange={(e) => onFieldChange("prefix", e.target.value)}
        />
      </div>
    )}
  </div>
);
const CloudR2AdvancedDetails = ({
  cloudForm,
  onFieldChange,
}: {
  cloudForm: CloudSyncForm;
  onFieldChange: (field: keyof CloudSyncForm, value: string) => void;
}) => (
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
          onChange={(e) => onFieldChange("region", e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Usually keep `auto` for R2 unless your setup needs otherwise.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Prefix</Label>
        <Input
          value={cloudForm.prefix}
          className="h-8!"
          placeholder="argos-backups"
          onChange={(e) => onFieldChange("prefix", e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Customize the cloud backup folder prefix if needed.</p>
      </div>
    </div>
  </details>
);
const CloudActionsRow = ({
  isCloudSaveDisabled,
  isCloudBusy,
  isCloudOperationDisabled,
  hasUsableCloudConfig,
  cloudPullMode,
  onPullModeChange,
  onSaveAndTest,
  onSaveOnly,
  onUpload,
  onPull,
}: {
  isCloudSaveDisabled: boolean;
  isCloudBusy: boolean;
  isCloudOperationDisabled: boolean;
  hasUsableCloudConfig: boolean;
  cloudPullMode: "increment" | "overwrite";
  onPullModeChange: (mode: "increment" | "overwrite") => void;
  onSaveAndTest: () => void;
  onSaveOnly: () => void;
  onUpload: () => void;
  onPull: () => void;
}) => (
  <>
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button
        variant="default"
        className="w-full sm:w-auto"
        data-testid="cloud-save-test"
        disabled={isCloudSaveDisabled}
        onClick={onSaveAndTest}
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
        onClick={onSaveOnly}
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
        onClick={onUpload}
      >
        <Icon icon="lucide:cloud-upload" className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Upload</span>
      </Button>
      <Button
        variant="outline"
        className="w-full sm:w-auto"
        disabled={isCloudOperationDisabled}
        title={!hasUsableCloudConfig ? "Save and test your cloud configuration first." : ""}
        onClick={onPull}
      >
        <Icon icon="lucide:cloud-download" className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Pull</span>
      </Button>
      <RadioGroup
        value={cloudPullMode}
        onValueChange={(v) => onPullModeChange(v as "increment" | "overwrite")}
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
      <p className="text-xs text-muted-foreground">Save and test your cloud configuration before upload or pull.</p>
    )}
  </>
);
const CloudSyncSection = ({
  dir,
  cloud,
  onFieldChange,
  onOpenExternal,
}: {
  dir: string;
  cloud: ReturnType<typeof useCloudSyncSettings>;
  onFieldChange: (field: keyof CloudSyncForm, value: string) => void;
  onOpenExternal: (url: string) => void;
}) => (
  <div className="flex flex-col gap-3 border-t border-border pt-4" dir={dir}>
    <div className="flex flex-col gap-1">
      <span className="flex flex-row items-center gap-2">
        <Icon icon="lucide:cloud" className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Cloud Sync</span>
      </span>
      <p className="text-xs text-muted-foreground">S3-compatible cloud backup</p>
    </div>
    <CloudProviderToggle mode={cloud.cloudProviderMode} onChange={cloud.setCloudProvider} />

    {cloud.cloudProviderMode === "r2" && <CloudR2Guide onOpenExternal={onOpenExternal} />}

    <CloudFormFields
      cloudForm={cloud.cloudForm}
      onFieldChange={onFieldChange}
      providerMode={cloud.cloudProviderMode}
      validationErrors={cloud.cloudValidation.errors}
      validationWarnings={cloud.cloudValidation.warnings}
      secretPlaceholder={cloud.cloudSecretPlaceholder}
      secretStatusText={cloud.cloudSecretStatusText}
    />
    {cloud.cloudProviderMode === "r2" && (
      <CloudR2AdvancedDetails cloudForm={cloud.cloudForm} onFieldChange={onFieldChange} />
    )}

    {cloud.cloudConfig && !cloud.cloudConfig.safeStorageAvailable && (
      <p className="text-xs text-amber-600 dark:text-amber-400">
        Secure system credential storage is unavailable, so saving a new cloud secret may be limited.
      </p>
    )}

    <CloudActionsRow
      isCloudSaveDisabled={cloud.isCloudSaveDisabled}
      isCloudBusy={cloud.isCloudBusy}
      isCloudOperationDisabled={cloud.isCloudOperationDisabled}
      hasUsableCloudConfig={cloud.hasUsableCloudConfig}
      cloudPullMode={cloud.cloudPullMode}
      onPullModeChange={cloud.setCloudPullMode}
      onSaveAndTest={() => void cloud.handleSaveAndTestCloud()}
      onSaveOnly={() => void cloud.handleSaveCloud()}
      onUpload={() => void cloud.handleUploadToCloud()}
      onPull={() => void cloud.handlePullFromCloud()}
    />
  </div>
);
const ProviderImportRow = ({ dir, onOpen }: { dir: string; onOpen: () => void }) => (
  <div className="flex flex-col gap-3 py-4 first:pt-0 lg:flex-row lg:items-center lg:justify-between">
    <div className="flex gap-3">
      <Icon icon="lucide:download" className="mt-1 h-4 w-4 text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <div className="text-sm font-medium">Provider Import</div>
        <p className="text-xs text-muted-foreground">Import providers from a config file.</p>
      </div>
    </div>
    <Button variant="outline" className="w-full shrink-0 lg:w-56" dir={dir} onClick={onOpen}>
      <Icon icon="lucide:download" className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm font-medium">Import Providers</span>
    </Button>
  </div>
);
const DatabaseRepairRow = ({
  dir,
  disabled,
  repairing,
  onRepair,
}: {
  dir: string;
  disabled: boolean;
  repairing: boolean;
  onRepair: () => void;
}) => (
  <div className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between" dir={dir}>
    <div className="flex gap-3">
      <Icon icon="lucide:database" className="mt-1 h-4 w-4 text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <div className="text-sm font-medium">Database Repair</div>
        <p className="text-xs text-muted-foreground">Check and repair database schema issues.</p>
      </div>
    </div>
    <Button variant="outline" className="w-full shrink-0 lg:w-56" disabled={disabled} dir={dir} onClick={onRepair}>
      <Icon
        icon={repairing ? "lucide:loader-2" : "lucide:wrench"}
        className={`h-4 w-4 text-muted-foreground ${repairing ? "animate-spin" : ""}`}
      />
      <span className="text-sm font-medium">{repairing ? "Repairing..." : "Repair"}</span>
    </Button>
  </div>
);
const ModelConfigUpdateRow = ({
  dir,
  updating,
  onUpdate,
}: {
  dir: string;
  updating: boolean;
  onUpdate: () => void;
}) => (
  <div className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between" dir={dir}>
    <div className="flex gap-3">
      <Icon icon="lucide:refresh-cw" className="mt-1 h-4 w-4 text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <div className="text-sm font-medium">Model Config Update</div>
        <p className="text-xs text-muted-foreground">Update provider model configuration from the public repository.</p>
      </div>
    </div>
    <Button variant="outline" className="w-full shrink-0 lg:w-40" disabled={updating} dir={dir} onClick={onUpdate}>
      <Icon
        icon={updating ? "lucide:loader-2" : "lucide:refresh-cw"}
        className={`h-4 w-4 text-muted-foreground ${updating ? "animate-spin" : ""}`}
      />
      <span className="text-sm font-medium">{updating ? "Updating..." : "Update"}</span>
    </Button>
  </div>
);
const RESET_OPTIONS = [
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
  {
    value: "all",
    label: "All Data",
    desc: "Delete everything",
  },
] as const;
type ResetType = (typeof RESET_OPTIONS)[number]["value"];
const DangerZoneRow = ({
  dir,
  disabled,
  resetting,
  resetType,
  onResetTypeChange,
  dialogOpen,
  onDialogOpenChange,
  onReset,
}: {
  dir: string;
  disabled: boolean;
  resetting: boolean;
  resetType: ResetType;
  onResetTypeChange: (value: ResetType) => void;
  dialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
  onReset: () => void;
}) => (
  <div className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between" dir={dir}>
    <div className="flex gap-3">
      <Icon icon="lucide:rotate-ccw" className="mt-1 h-4 w-4 text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <div className="text-sm font-medium">Danger Zone</div>
        <p className="text-xs text-muted-foreground">Reset or clear data permanently.</p>
      </div>
    </div>
    <AlertDialog open={dialogOpen} onOpenChange={onDialogOpenChange}>
      <Button
        variant="outline"
        className="w-full shrink-0 justify-center border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive lg:w-40"
        disabled={disabled}
        dir={dir}
        data-testid="danger-zone-reset-entry"
        onClick={() => {
          onResetTypeChange("chat");
          onDialogOpenChange(true);
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
            onValueChange={(v) => onResetTypeChange(v as ResetType)}
            className="flex flex-col gap-3"
          >
            {RESET_OPTIONS.map((opt) => (
              <div
                key={opt.value}
                className={`-m-2 flex cursor-pointer items-start space-x-3 rounded-lg border border-transparent p-2 transition-colors hover:bg-accent ${resetType === opt.value ? "border-destructive/25 bg-destructive/5" : ""}`}
                onClick={() => onResetTypeChange(opt.value)}
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
              onDialogOpenChange(false);
              onResetTypeChange("chat");
            }}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            className={cn("bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90")}
            disabled={disabled}
            onClick={onReset}
          >
            {resetting ? "Resetting..." : "Confirm Reset"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
);
const SandboxDataRow = ({
  dir,
  clearing,
  dialogOpen,
  onDialogOpenChange,
  onClear,
}: {
  dir: string;
  clearing: boolean;
  dialogOpen: boolean;
  onDialogOpenChange: (open: boolean) => void;
  onClear: () => void;
}) => (
  <div className="flex flex-col gap-3 pt-4 lg:flex-row lg:items-center lg:justify-between" dir={dir}>
    <div className="flex gap-3">
      <Icon icon="lucide:shield" className="mt-1 h-4 w-4 text-muted-foreground" />
      <div className="flex flex-col gap-1">
        <div className="text-sm font-medium">Sandbox Data</div>
        <p className="text-xs text-muted-foreground">Clear browser sandbox data.</p>
      </div>
    </div>
    <AlertDialog open={dialogOpen} onOpenChange={onDialogOpenChange}>
      <AlertDialogTrigger
        render={<Button variant="outline" className="w-full shrink-0 lg:w-56" disabled={clearing} dir={dir} />}
      >
        <Icon
          icon={clearing ? "lucide:loader-2" : "lucide:trash-2"}
          className={`h-4 w-4 text-muted-foreground ${clearing ? "animate-spin" : ""}`}
        />
        <span className="text-sm font-medium">{clearing ? "Clearing..." : "Clear Sandbox"}</span>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear Sandbox Data</AlertDialogTitle>
          <AlertDialogDescription>This will clear all sandbox browser data.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={clearing} onClick={onClear}>
            {clearing ? "Clearing..." : "Confirm"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
);
