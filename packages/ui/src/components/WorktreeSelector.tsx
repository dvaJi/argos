import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { Badge } from "#shadcn/components/ui/badge";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "#shadcn/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#shadcn/components/ui/select";
import { Spinner } from "#shadcn/components/ui/spinner";
import { createWorkspaceClient } from "#api/WorkspaceClient";
import { useToast } from "#/components/use-toast";
import type { WorktreeDraftConfig } from "./worktreeConfig";
type BranchInfo = {
  name: string;
  kind: "local" | "remote";
  isDefault: boolean;
  isHead: boolean;
  worktreePath: string | null;
};
type WorktreeInfo = {
  path: string;
  branch: string | null;
  head: string;
  isMain: boolean;
  isManaged: boolean;
};
interface WorktreeSelectorProps {
  /** Selected project directory; must be a git repository for worktrees. */
  workspacePath: string | null;
  value: WorktreeDraftConfig;
  onChange: (next: WorktreeDraftConfig) => void;
  disabled?: boolean;
}
const workspaceClient = createWorkspaceClient();
function abbreviatePath(targetPath: string): string {
  const parts = targetPath.split(/[/\\]/);
  if (parts.length <= 3) return targetPath;
  return `…${parts.slice(-3).join("/")}`;
}

/** Loads branch + worktree data for a repo (module-level: safe for the React Compiler). */
async function fetchGitSummary(workspacePath: string): Promise<{
  isRepo: boolean;
  branches: BranchInfo[];
  worktrees: WorktreeInfo[];
}> {
  await workspaceClient.registerWorkspace(workspacePath);
  const [branchResult, worktreeList] = await Promise.all([
    workspaceClient.gitListBranches(workspacePath),
    workspaceClient.gitListWorktrees(workspacePath),
  ]);
  return {
    isRepo: branchResult.isRepo !== false,
    branches: branchResult.branches ?? [],
    worktrees: worktreeList ?? [],
  };
}

/** Removes one worktree through the daemon (module-level for the compiler). */
async function removeWorktreeViaDaemon(input: {
  workspacePath: string;
  worktreePath: string;
  deleteBranch: boolean;
}): Promise<void> {
  await workspaceClient.gitRemoveWorktree({
    ...input,
    force: false,
  });
}

/** Picks the default base branch: origin default, then any origin, then local default. */
function resolveDefaultBaseBranch(branches: BranchInfo[]): { name: string; fromRemote: boolean } | null {
  if (branches.length === 0) return null;
  const defaultRemote = branches.find((b) => b.kind === "remote" && b.isDefault && b.name.startsWith("origin/"));
  if (defaultRemote)
    return {
      name: defaultRemote.name.slice("origin/".length),
      fromRemote: true,
    };
  const anyOrigin = branches.find((b) => b.kind === "remote" && b.name.startsWith("origin/"));
  if (anyOrigin)
    return {
      name: anyOrigin.name.slice("origin/".length),
      fromRemote: true,
    };
  const localDefault = branches.find((b) => b.kind === "local" && b.isDefault);
  if (localDefault)
    return {
      name: localDefault.name,
      fromRemote: false,
    };
  return null;
}

/**
 * Worktree selector with T3 parity: workspace mode first, then searchable branch origin.
 * The worktree itself is created at submit time — current checkout is never touched.
 */
export default function WorktreeSelector({ workspacePath, value, onChange, disabled }: WorktreeSelectorProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [isRepo, setIsRepo] = useState(true);
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [removingPath, setRemovingPath] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const loadSeqRef = useRef(0);
  const refresh = async () => {
    if (!workspacePath) return;
    const seq = ++loadSeqRef.current;
    setLoading(true);
    const result = await fetchGitSummary(workspacePath).catch(() => null);
    if (seq !== loadSeqRef.current) return;
    if (result) {
      setBranches(result.branches);
      setIsRepo(result.isRepo);
      setWorktrees(result.worktrees);
    } else {
      console.warn("[WorktreeSelector] Failed to load git branches/worktrees");
      setIsRepo(false);
      setBranches([]);
      setWorktrees([]);
    }
    setLoading(false);
  };
  useEffect(() => {
    if (!open || !workspacePath) return;
    let cancelled = false;
    void (async () => {
      const seq = ++loadSeqRef.current;
      setLoading(true);
      const result = await fetchGitSummary(workspacePath).catch(() => null);
      if (cancelled || seq !== loadSeqRef.current) return;
      if (result) {
        setBranches(result.branches);
        setIsRepo(result.isRepo);
        setWorktrees(result.worktrees);
      } else {
        console.warn("[WorktreeSelector] Failed to load git branches/worktrees");
        setIsRepo(false);
        setBranches([]);
        setWorktrees([]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, workspacePath]);
  const defaultBaseBranch = resolveDefaultBaseBranch(branches);
  useEffect(() => {
    if (!open || !defaultBaseBranch || value.baseBranch) return;
    // Only auto-apply default when in New worktree mode (enabled) and no previous reuse
    if (!value.enabled || value.reuseWorktreePath) return;
    onChange({
      ...value,
      baseBranch: defaultBaseBranch.name,
      fromRemote: defaultBaseBranch.fromRemote,
    });
  }, [open, defaultBaseBranch, value, onChange]);
  const managedWorktrees = worktrees.filter((w) => w.isManaged);
  const mode = ((): "current" | "new" | "previous" => {
    if (value.reuseWorktreePath) return "previous";
    if (value.enabled) return "new";
    return "current";
  })();
  const baseRefLabel = value.baseBranch ? (value.fromRemote ? `origin/${value.baseBranch}` : value.baseBranch) : "";
  const triggerLabel = (() => {
    if (mode === "previous" && value.reuseWorktreePath) {
      const wt = managedWorktrees.find((w) => w.path === value.reuseWorktreePath);
      return wt?.branch ? `Previous · ${wt.branch}` : "Previous worktree";
    }
    if (mode === "new" && baseRefLabel) return `Worktree · ${baseRefLabel}`;
    if (mode === "new") return "New worktree";
    return "Worktree";
  })();
  const handleModeChange = (nextMode: "current" | "new" | "previous" | null) => {
    if (nextMode === "current") {
      onChange({
        ...value,
        enabled: false,
        reuseWorktreePath: null,
      });
    } else if (nextMode === "new") {
      onChange({
        ...value,
        enabled: true,
        reuseWorktreePath: null,
      });
    } else if (nextMode === "previous") {
      // Pick the most recent managed worktree by default, user can change below
      const first = managedWorktrees[0]?.path ?? null;
      onChange({
        ...value,
        enabled: true,
        reuseWorktreePath: first,
      });
    }
  };
  const allBranchesForSearch = (() => {
    // Merge remote and local for searchable list, remote first
    const remote = branches.filter((b) => b.kind === "remote");
    const local = branches.filter((b) => b.kind === "local");
    return [...remote, ...local];
  })();
  const filteredBranches = (() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allBranchesForSearch;
    return allBranchesForSearch.filter((b) => b.name.toLowerCase().includes(q));
  })();
  const handleSelectBranch = (selected: string) => {
    if (selected.startsWith("origin/")) {
      onChange({
        ...value,
        baseBranch: selected.slice("origin/".length),
        fromRemote: true,
        reuseWorktreePath: null,
      });
    } else {
      onChange({
        ...value,
        baseBranch: selected,
        fromRemote: false,
        reuseWorktreePath: null,
      });
    }
  };
  const selectedValue = value.baseBranch
    ? value.fromRemote && branches.some((b) => b.name === `origin/${value.baseBranch}`)
      ? `origin/${value.baseBranch}`
      : value.baseBranch
    : "";
  const handleSelectWorktree = (worktreePath: string) => {
    onChange({
      ...value,
      enabled: true,
      reuseWorktreePath: worktreePath,
    });
  };
  const handleRemoveWorktree = async (worktree: WorktreeInfo) => {
    if (!workspacePath || !worktree.branch) return;
    setRemovingPath(worktree.path);
    const removed = await removeWorktreeViaDaemon({
      workspacePath,
      worktreePath: worktree.path,
      deleteBranch: worktree.branch.startsWith("argos/"),
    })
      .then(() => true)
      .catch((error: unknown) => {
        toast({
          title: "Failed to remove worktree",
          description: error instanceof Error ? error.message : String(error),
          variant: "destructive",
        });
        return false;
      });
    if (removed) {
      await refresh();
      // If the removed worktree was the selected "Previous worktree",
      // drop the selection so the draft falls back to current checkout.
      if (value.reuseWorktreePath === worktree.path) {
        onChange({
          ...value,
          enabled: false,
          reuseWorktreePath: null,
        });
      }
    }
    setRemovingPath(null);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant={mode !== "current" ? "secondary" : "ghost"}
            size="sm"
            disabled={disabled || !workspacePath}
            data-testid="worktree-selector-trigger"
            className="h-7 px-2 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          />
        }
      >
        <Icon icon="lucide:git-branch" className="size-3.5" />
        <span>{triggerLabel}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3 text-xs" data-testid="worktree-selector-content">
        <WorktreeModeSection mode={mode} managedCount={managedWorktrees.length} onModeChange={handleModeChange} />

        {loading ? (
          <div className="mt-3 flex items-center gap-2 text-muted-foreground">
            <Spinner className="size-3.5" />
            <span>Loading repository…</span>
          </div>
        ) : !isRepo ? (
          <div className="mt-3 rounded-md border border-border/60 bg-muted/40 px-2.5 py-2 text-[11px] text-muted-foreground">
            Not a git repository (or no branches).
          </div>
        ) : mode === "current" ? null : mode === "previous" ? (
          <PreviousWorktreePicker
            worktrees={managedWorktrees}
            selectedPath={value.reuseWorktreePath}
            removingPath={removingPath}
            onSelect={handleSelectWorktree}
            onRemove={handleRemoveWorktree}
          />
        ) : (
          <>
            <BranchPickerSection
              branches={filteredBranches}
              selectedValue={selectedValue}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              onSelectBranch={handleSelectBranch}
            />

            <BranchNameField
              branchName={value.branchName}
              onChange={(branchName) =>
                onChange({
                  ...value,
                  branchName,
                })
              }
            />
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
interface WorktreeModeSectionProps {
  mode: "current" | "new" | "previous";
  managedCount: number;
  onModeChange: (mode: "current" | "new" | "previous" | null) => void;
}

/** Workspace-mode select plus its explainer copy. */
function WorktreeModeSection({ mode, managedCount, onModeChange }: WorktreeModeSectionProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[11px] text-muted-foreground">Workspace</Label>
      <Select value={mode} onValueChange={onModeChange}>
        <SelectTrigger className="h-8 text-xs" data-testid="worktree-mode-select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="current" className="text-xs">
            <span className="flex items-center gap-1.5">
              <Icon icon="lucide:folder" className="size-3.5" />
              Current checkout
            </span>
          </SelectItem>
          <SelectItem value="new" className="text-xs">
            <span className="flex items-center gap-1.5">
              <Icon icon="lucide:git-branch-plus" className="size-3.5" />
              New worktree
            </span>
          </SelectItem>
          <SelectItem value="previous" className="text-xs" disabled={managedCount === 0}>
            <span className="flex items-center gap-1.5">
              <Icon icon="lucide:history" className="size-3.5" />
              Previous worktree
              {managedCount > 0 && <span className="text-[10px] text-muted-foreground">· {managedCount}</span>}
            </span>
          </SelectItem>
        </SelectContent>
      </Select>
      <span className="text-[11px] leading-snug text-muted-foreground">
        {mode === "current"
          ? "Run in your current checkout."
          : "The agent works in an isolated checkout created from the selected branch. Your current checkout is never touched."}
      </span>
    </div>
  );
}
interface PreviousWorktreePickerProps {
  worktrees: WorktreeInfo[];
  selectedPath: string | null | undefined;
  removingPath: string | null;
  onSelect: (worktreePath: string) => void;
  onRemove: (worktree: WorktreeInfo) => void;
}

/** List of managed worktrees to reuse for the "Previous" mode. */
function PreviousWorktreePicker({
  worktrees,
  selectedPath,
  removingPath,
  onSelect,
  onRemove,
}: PreviousWorktreePickerProps) {
  return (
    <div className="mt-3 flex flex-col gap-1">
      <span className="text-[11px] font-medium text-muted-foreground">Select previous worktree</span>
      {worktrees.length === 0 ? (
        <span className="text-[11px] text-muted-foreground">No previous worktrees.</span>
      ) : (
        <ul className="flex max-h-36 flex-col gap-1 overflow-y-auto" data-testid="worktree-list">
          {worktrees.map((worktree) => (
            <PreviousWorktreeItem
              key={worktree.path}
              worktree={worktree}
              isSelected={selectedPath === worktree.path}
              isRemoving={removingPath === worktree.path}
              onSelect={onSelect}
              onRemove={onRemove}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
interface PreviousWorktreeItemProps {
  worktree: WorktreeInfo;
  isSelected: boolean;
  isRemoving: boolean;
  onSelect: (worktreePath: string) => void;
  onRemove: (worktree: WorktreeInfo) => void;
}

/** One selectable managed worktree row with a remove action. */
function PreviousWorktreeItem({ worktree, isSelected, isRemoving, onSelect, onRemove }: PreviousWorktreeItemProps) {
  return (
    <li
      data-testid="worktree-item"
      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${isSelected ? "border-primary bg-primary/5" : "border-border/60"}`}
    >
      <button
        type="button"
        aria-pressed={isSelected}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => onSelect(worktree.path)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(worktree.path);
          }
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-mono text-[11px]">{worktree.branch ?? "(detached)"}</span>
          <span className="truncate text-[10px] text-muted-foreground" title={worktree.path}>
            {abbreviatePath(worktree.path)}
          </span>
        </div>
        {isSelected && <Icon icon="lucide:check" className="size-3.5 text-primary" />}
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="size-6 text-muted-foreground hover:text-destructive"
        disabled={isRemoving}
        aria-label={`Remove worktree ${worktree.branch ?? worktree.path}`}
        onClick={(e) => {
          e.stopPropagation();
          void onRemove(worktree);
        }}
      >
        {isRemoving ? <Spinner className="size-3" /> : <Icon icon="lucide:trash-2" className="size-3.5" />}
      </Button>
    </li>
  );
}
interface BranchPickerSectionProps {
  branches: BranchInfo[];
  selectedValue: string;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  onSelectBranch: (branchName: string) => void;
}

/** Searchable remote/local ref picker for the "New worktree" mode. */
function BranchPickerSection({
  branches,
  selectedValue,
  searchQuery,
  onSearchQueryChange,
  onSelectBranch,
}: BranchPickerSectionProps) {
  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <Label className="text-[11px] text-muted-foreground">Search refs…</Label>
      <div className="relative">
        <Icon
          icon="lucide:search"
          className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          placeholder="Search refs…"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange(e.target.value)}
          className="h-8 pl-8 text-xs"
          autoFocus
        />
      </div>
      <div className="max-h-48 overflow-y-auto rounded-md border border-border/60">
        {branches.length === 0 ? (
          <div className="px-2.5 py-2 text-[11px] text-muted-foreground">No refs found</div>
        ) : (
          branches.map((branch) => (
            <BranchPickerRow
              key={branch.name}
              branch={branch}
              isSelected={selectedValue === branch.name}
              onSelect={onSelectBranch}
            />
          ))
        )}
      </div>
    </div>
  );
}
interface BranchPickerRowProps {
  branch: BranchInfo;
  isSelected: boolean;
  onSelect: (branchName: string) => void;
}

/** One selectable ref row with default/worktree/current markers. */
function BranchPickerRow({ branch, isSelected, onSelect }: BranchPickerRowProps) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs hover:bg-muted ${isSelected ? "bg-muted font-medium" : ""}`}
      onClick={() => onSelect(branch.name)}
    >
      <span className="flex-1 truncate">{branch.name}</span>
      {branch.isDefault && (
        <Badge variant="outline" className="h-4 px-1 text-[10px]">
          default
        </Badge>
      )}
      {branch.worktreePath && <span className="text-[10px] text-muted-foreground">worktree</span>}
      {branch.isHead && <span className="text-[10px] text-muted-foreground">current</span>}
      {isSelected && <Icon icon="lucide:check" className="size-3.5 text-primary" />}
    </button>
  );
}
interface BranchNameFieldProps {
  branchName: string;
  onChange: (branchName: string) => void;
}

/** Optional custom branch name for the new worktree. */
function BranchNameField({ branchName, onChange }: BranchNameFieldProps) {
  return (
    <div className="mt-2.5 flex flex-col gap-1.5">
      <Label htmlFor="worktree-branch-name" className="text-[11px] text-muted-foreground">
        Branch name (optional)
      </Label>
      <Input
        id="worktree-branch-name"
        value={branchName}
        placeholder="argos/<auto>"
        className="h-8 text-xs"
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
