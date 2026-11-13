import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { useSelector } from "@tanstack/react-store";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Switch } from "#shadcn/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "#shadcn/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "#shadcn/components/ui/select";
import { normalizeProjectKey } from "@argos/shared/projectKey";
import { refreshEnvironmentData, useProjectStore } from "#/stores/ui/project";
import {
  ensureCheckouts,
  loadProjectSettings,
  projectSettingsStore,
  updateProjectSettings,
} from "#/stores/ui/projectSettings";
import {
  PROJECT_ICON_CHOICES,
  presentProject,
  resolveProjectPath,
  type ProjectIconValue,
} from "#/stores/ui/projectIdentity";
import { getChatSelectableModelGroups, initialize as initializeModels, modelStore } from "#/stores/modelStore";
import ProjectIcon from "#/components/projects/ProjectIcon";
import SettingsPageShell from "./control-center/SettingsPageShell";

const MAX_ICON_BYTES = 256 * 1024;
const ICON_SIZE_PX = 64;
const AGENT_DEFAULT = "agent-default";

/** Downscale an uploaded image to a 64 px PNG data URL (module-level for the React Compiler). */
async function fileToIconDataUrl(file: File): Promise<string> {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Unsupported image"));
    element.src = source;
  });
  const canvas = document.createElement("canvas");
  canvas.width = ICON_SIZE_PX;
  canvas.height = ICON_SIZE_PX;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas unavailable");
  // Cover-crop to a square.
  const side = Math.min(image.naturalWidth || ICON_SIZE_PX, image.naturalHeight || ICON_SIZE_PX);
  const sx = ((image.naturalWidth || side) - side) / 2;
  const sy = ((image.naturalHeight || side) - side) / 2;
  context.drawImage(image, sx, sy, side, side, 0, 0, ICON_SIZE_PX, ICON_SIZE_PX);
  const dataUrl = canvas.toDataURL("image/png");
  if (dataUrl.length > MAX_ICON_BYTES) throw new Error("Icon is too large after resizing");
  return dataUrl;
}

/**
 * Settings → Projects (docs/features/project-settings), t3code-style:
 *
 *   Applying settings for [BR bankledger ▾]
 *   ┌ Name ............................ [bankledger      ]
 *   │ Project icon (Automatic) ........ [BR] [Choose icon] [Choose file]
 *   │ Pin ............................. (o )
 *   └ Archive ......................... [Archive]
 *   New threads
 *   ┌ Model ........................... [Agent default ▾]
 *   └ Workspace ....................... [Current checkout ▾]
 */
export default function ProjectsSettings() {
  const projectState = useProjectStore();
  const byKey = useSelector(projectSettingsStore, (state) => state.byKey);
  const checkoutByKey = useSelector(projectSettingsStore, (state) => state.checkoutByKey);
  const settingsLoaded = useSelector(projectSettingsStore, (state) => state.loaded);
  const focus = useSelector(projectSettingsStore, (state) => state.focus);
  useSelector(modelStore, (state) => state.enabledModels);
  const [selectedKey, setSelectedKey] = useState<string | null>(() => (focus ? normalizeProjectKey(focus.path) : null));
  // Each "Project settings" request (nonce) selects its project exactly once;
  // afterwards the user's own picks stick.
  const [consumedFocusNonce, setConsumedFocusNonce] = useState(() => focus?.nonce ?? 0);
  const [nameDraft, setNameDraft] = useState("");
  const [nameDraftSource, setNameDraftSource] = useState<{ key: string; saved: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (focus && focus.nonce !== consumedFocusNonce) {
    setConsumedFocusNonce(focus.nonce);
    setSelectedKey(normalizeProjectKey(focus.path));
  }

  useEffect(() => {
    void refreshEnvironmentData();
    void loadProjectSettings();
    void initializeModels();
  }, []);

  const environmentPaths = useMemo(
    () => projectState.environments.filter((env) => !env.isTemp).map((env) => env.path),
    [projectState.environments],
  );
  const environmentKey = environmentPaths.join("\n");
  useEffect(() => {
    if (environmentKey) void ensureCheckouts(environmentKey.split("\n"));
  }, [environmentKey]);

  // Every known project: session dirs resolved to their repository (worktrees
  // fold into the main checkout), plus anything with saved settings.
  const projects = useMemo(() => {
    const byProjectKey = new Map<string, ReturnType<typeof presentProject>>();
    for (const path of environmentPaths) {
      const projectPath = resolveProjectPath(path, checkoutByKey[normalizeProjectKey(path)]);
      const identity = presentProject(projectPath, byKey);
      if (!byProjectKey.has(identity.key)) byProjectKey.set(identity.key, identity);
    }
    for (const settings of Object.values(byKey)) {
      if (!byProjectKey.has(settings.key)) byProjectKey.set(settings.key, presentProject(settings.path, byKey));
    }
    return Array.from(byProjectKey.values()).sort(
      (a, b) =>
        Number(a.archived) - Number(b.archived) || Number(b.pinned) - Number(a.pinned) || a.name.localeCompare(b.name),
    );
  }, [environmentPaths, checkoutByKey, byKey]);

  const selected = projects.find((project) => project.key === selectedKey) ?? projects[0] ?? null;
  const settings = selected ? byKey[selected.key] : undefined;

  // Keep the name draft in sync with the selected project and its saved name
  // (settings may load after the page): a stale empty draft must never be
  // committed over a saved name.
  const savedName = settings?.name ?? "";
  if (selected && (nameDraftSource?.key !== selected.key || nameDraftSource.saved !== savedName)) {
    setNameDraftSource({ key: selected.key, saved: savedName });
    setNameDraft(savedName);
  }

  const save = async (patch: Parameters<typeof updateProjectSettings>[1]) => {
    if (!selected) return;
    setError(null);
    try {
      await updateProjectSettings(selected.path, patch);
    } catch (saveError) {
      setError(`Failed to save project settings: ${String(saveError)}`);
    }
  };

  const commitName = () => {
    if (!settingsLoaded) return;
    const next = nameDraft.trim();
    if (next === (settings?.name ?? "")) return;
    void save({ name: next || null });
  };

  const chooseIcon = (icon: ProjectIconValue | null) => void save({ icon });

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      chooseIcon({ kind: "image", value: await fileToIconDataUrl(file) });
    } catch (fileError) {
      setError(fileError instanceof Error ? fileError.message : "Could not use that image.");
    }
  };

  const modelGroups = getChatSelectableModelGroups();
  const modelValue = settings?.defaultModel
    ? `${settings.defaultModel.providerId}::${settings.defaultModel.modelId}`
    : AGENT_DEFAULT;

  return (
    <SettingsPageShell
      title="Projects"
      eyebrow="Agent Settings"
      description="Name, icon and defaults for each project. Projects come from the folders your threads use."
      data-testid="settings-projects-page"
    >
      {projects.length === 0 || !selected ? (
        <div className="flex flex-col items-center gap-2 px-4 py-12 text-center text-sm text-muted-foreground">
          <Icon icon="lucide:folder-open" className="size-6 text-muted-foreground/50" />
          No projects yet — start a thread in a folder and it will show up here.
        </div>
      ) : (
        <div className="flex w-full flex-col gap-5 px-2 py-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            Applying settings for
            <Select
              value={selected.key}
              onValueChange={(next) => {
                if (next) setSelectedKey(next);
              }}
            >
              <SelectTrigger className="h-8 w-auto min-w-48" data-testid="projects-picker">
                <span className="flex items-center gap-2">
                  <ProjectIcon name={selected.name} icon={selected.icon} />
                  <span className="truncate text-foreground">{selected.name}</span>
                </span>
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.key} value={project.key}>
                    <span className="flex items-center gap-2">
                      <ProjectIcon name={project.name} icon={project.icon} />
                      <span className="truncate">{project.name}</span>
                      {project.pinned && <Icon icon="lucide:pin" className="size-3 text-muted-foreground" />}
                      {project.archived && <span className="text-[10px] text-muted-foreground">archived</span>}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="-mt-3 truncate text-xs text-muted-foreground" title={selected.path}>
            {selected.path}
          </p>

          {error && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <section className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card/50">
            <SettingRow title="Name" hint="The name shown in the sidebar and project pickers. Empty = folder name.">
              <Input
                data-testid="project-name-input"
                value={nameDraft}
                disabled={!settingsLoaded}
                placeholder={presentProject(selected.path, {}).name}
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={commitName}
                onKeyDown={(event) => {
                  if (event.key === "Enter") commitName();
                }}
                className="h-8 w-60"
              />
            </SettingRow>
            <SettingRow title="Project icon" hint={selected.icon ? "Custom" : "Automatic"}>
              <div className="flex items-center gap-2">
                <ProjectIcon name={selected.name} icon={selected.icon} className="size-7 text-[0.7rem]" />
                <Popover>
                  <PopoverTrigger render={<Button variant="outline" size="sm" data-testid="project-choose-icon" />}>
                    Choose icon
                  </PopoverTrigger>
                  <PopoverContent className="w-72">
                    <div className="grid grid-cols-8 gap-1">
                      {PROJECT_ICON_CHOICES.map((name) => (
                        <button
                          key={name}
                          type="button"
                          title={name.replace("lucide:", "")}
                          aria-label={name.replace("lucide:", "")}
                          onClick={() => chooseIcon({ kind: "icon", value: name })}
                          className="flex size-7 items-center justify-center rounded-md hover:bg-accent"
                        >
                          <Icon icon={name} className="size-4" />
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  Choose file
                </Button>
                {selected.icon && (
                  <Button variant="ghost" size="sm" onClick={() => chooseIcon(null)}>
                    Reset
                  </Button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
                  className="hidden"
                  onChange={(event) => {
                    void handleFile(event.target.files?.[0]);
                    event.target.value = "";
                  }}
                />
              </div>
            </SettingRow>
            <SettingRow title="Pin" hint="Pinned projects come first in project pickers.">
              <Switch
                data-testid="project-pin-switch"
                checked={selected.pinned}
                onCheckedChange={(pinned) => void save({ pinned })}
              />
            </SettingRow>
            <SettingRow title="Archive" hint="Hides the project from project pickers. Threads and files are kept.">
              <Button
                variant="outline"
                size="sm"
                data-testid="project-archive-button"
                onClick={() => void save({ archived: !selected.archived })}
              >
                {selected.archived ? "Unarchive" : "Archive"}
              </Button>
            </SettingRow>
          </section>

          <h2 className="-mb-3 text-sm font-semibold">New threads</h2>
          <section className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card/50">
            <SettingRow title="Model" hint="Model for new threads in this project (non-ACP agents).">
              <Select
                value={modelValue}
                onValueChange={(next) => {
                  if (!next) return;
                  if (next === AGENT_DEFAULT) {
                    void save({ defaultModel: null });
                    return;
                  }
                  const [providerId, ...rest] = next.split("::");
                  void save({ defaultModel: { providerId: providerId!, modelId: rest.join("::") } });
                }}
              >
                <SelectTrigger className="h-8 w-60" data-testid="project-model-select">
                  <SelectValue>
                    {modelValue === AGENT_DEFAULT
                      ? "Agent default"
                      : `${settings?.defaultModel?.providerId}/${settings?.defaultModel?.modelId}`}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AGENT_DEFAULT}>Agent default</SelectItem>
                  {modelGroups.map((group) => (
                    <SelectGroup key={group.providerId}>
                      <SelectLabel>{group.providerName}</SelectLabel>
                      {group.models.map((model) => (
                        <SelectItem key={model.id} value={`${group.providerId}::${model.id}`}>
                          {model.name || model.id}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
            <SettingRow title="Workspace" hint="Where new threads in this project start.">
              <Select
                value={settings?.defaultWorkspace ?? "current"}
                onValueChange={(next) => {
                  if (next === "current" || next === "worktree") void save({ defaultWorkspace: next });
                }}
              >
                <SelectTrigger className="h-8 w-60" data-testid="project-workspace-select">
                  <SelectValue>
                    {(settings?.defaultWorkspace ?? "current") === "worktree" ? "New worktree" : "Current checkout"}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current">Current checkout</SelectItem>
                  <SelectItem value="worktree">New worktree</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
          </section>
        </div>
      )}
    </SettingsPageShell>
  );
}

function SettingRow({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{hint}</span>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
