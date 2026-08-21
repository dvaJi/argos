import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { Badge } from "#shadcn/components/ui/badge";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Label } from "#shadcn/components/ui/label";
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
import { Spinner } from "#shadcn/components/ui/spinner";
import { Switch } from "#shadcn/components/ui/switch";
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
async function fetchGitSummary(
  workspacePath: string,
): Promise<{ isRepo: boolean; branches: BranchInfo[]; worktrees: WorktreeInfo[] }> {
  // The project dir is not necessarily registered yet (registration usually
  // happens when a session runs in it) — register before querying git.
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
  await workspaceClient.gitRemoveWorktree({ ...input, force: false });
}

/**
 * Base-branch picker for isolated git worktree sessions (t3code-style).
 * The worktree itself is created at submit time from the selected base ref —
 * the user's current checkout is never touched.
 */
export default function WorktreeSelector({ workspacePath, value, onChange, disabled }: WorktreeSelectorProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [isRepo, setIsRepo] = useState(true);
  const [worktrees, setWorktrees] = useState<WorktreeInfo[]>([]);
  const [removingPath, setRemovingPath] = useState<string | null>(null);
  const loadSeqRef = useRef(0);

  const refresh = useCallback(async () => {
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
  }, [workspacePath]);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  // Pick a sensible default base branch once branches load: prefer the
  // default branch's origin ref, then any origin ref, then the local default.
  const defaultBaseBranch = useMemo(() => {
    if (branches.length === 0) return null;
    const defaultRemote = branches.find((b) => b.kind === "remote" && b.isDefault && b.name.startsWith("origin/"));
    if (defaultRemote) return { name: defaultRemote.name.slice("origin/".length), fromRemote: true };
    const anyOrigin = branches.find((b) => b.kind === "remote" && b.name.startsWith("origin/"));
    if (anyOrigin) return { name: anyOrigin.name.slice("origin/".length), fromRemote: true };
    const localDefault = branches.find((b) => b.kind === "local" && b.isDefault);
    if (localDefault) return { name: localDefault.name, fromRemote: false };
    return null;
  }, [branches]);

  // Apply the default selection only when the user hasn't picked one yet —
  // derived state applied on user intent, not live parent sync.
  useEffect(() => {
    if (!open || !defaultBaseBranch || value.baseBranch) return;
    onChange({ ...value, baseBranch: defaultBaseBranch.name, fromRemote: defaultBaseBranch.fromRemote });
  }, [open, defaultBaseBranch, value, onChange]);

  const remoteBranches = useMemo(() => branches.filter((b) => b.kind === "remote"), [branches]);
  const localBranches = useMemo(() => branches.filter((b) => b.kind === "local"), [branches]);
  // Only daemon-managed worktrees are listed/removable here.
  const managedWorktrees = useMemo(() => worktrees.filter((w) => w.isManaged), [worktrees]);

  const selectedValue = value.baseBranch
    ? value.fromRemote && remoteBranches.some((b) => b.name === `origin/${value.baseBranch}`)
      ? `origin/${value.baseBranch}`
      : value.baseBranch
    : "";

  const handleSelectBranch = (selected: string) => {
    if (selected.startsWith("origin/")) {
      onChange({ ...value, baseBranch: selected.slice("origin/".length), fromRemote: true });
    } else {
      onChange({ ...value, baseBranch: selected, fromRemote: false });
    }
  };

  const handleRemoveWorktree = async (worktree: WorktreeInfo) => {
    if (!workspacePath || !worktree.branch) return;
    setRemovingPath(worktree.path);
    const removed = await removeWorktreeViaDaemon({
      workspacePath,
      worktreePath: worktree.path,
      // Only auto-managed `argos/…` branches are safe to drop with the tree.
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
    if (removed) await refresh();
    setRemovingPath(null);
  };

  const baseRefLabel = value.baseBranch ? (value.fromRemote ? `origin/${value.baseBranch}` : value.baseBranch) : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant={value.enabled ? "secondary" : "ghost"}
            size="sm"
            disabled={disabled || !workspacePath}
            data-testid="worktree-selector-trigger"
            className="h-7 px-2 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          />
        }
      >
        <Icon icon="lucide:git-branch" className="size-3.5" />
        <span>{value.enabled && baseRefLabel ? `Worktree · ${baseRefLabel}` : "Worktree"}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3 text-xs" data-testid="worktree-selector-content">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-foreground">Run in a git worktree</span>
            <span className="text-[11px] leading-snug text-muted-foreground">
              The agent works in an isolated checkout created from the selected branch. Your current checkout is never
              touched.
            </span>
          </div>
          <Switch
            checked={value.enabled}
            disabled={!isRepo || disabled}
            aria-label="Run in a git worktree"
            data-testid="worktree-enabled-switch"
            onCheckedChange={(checked) => onChange({ ...value, enabled: checked })}
          />
        </div>

        {loading ? (
          <div className="mt-3 flex items-center gap-2 text-muted-foreground">
            <Spinner className="size-3.5" />
            <span>Loading repository…</span>
          </div>
        ) : !isRepo ? (
          <div className="mt-3 rounded-md border border-border/60 bg-muted/40 px-2.5 py-2 text-[11px] text-muted-foreground">
            Not a git repository (or no branches).
          </div>
        ) : (
          <>
            <div className="mt-3 flex flex-col gap-1.5">
              <Label htmlFor="worktree-base-branch" className="text-[11px] text-muted-foreground">
                Base branch
              </Label>
              <Select value={selectedValue} onValueChange={(v) => handleSelectBranch(v ?? "")}>
                <SelectTrigger id="worktree-base-branch" className="h-8 text-xs" disabled={!value.enabled}>
                  <SelectValue placeholder="Select base branch" />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {remoteBranches.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="text-[11px]">Remote (origin)</SelectLabel>
                      {remoteBranches.map((branch) => (
                        <SelectItem key={branch.name} value={branch.name} className="text-xs">
                          <span className="flex items-center gap-1.5">
                            {branch.name}
                            {branch.isDefault && (
                              <Badge variant="outline" className="h-4 px-1 text-[10px]">
                                default
                              </Badge>
                            )}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  <SelectGroup>
                    <SelectLabel className="text-[11px]">Local</SelectLabel>
                    {localBranches.map((branch) => (
                      <SelectItem key={branch.name} value={branch.name} className="text-xs">
                        <span className="flex items-center gap-1.5">
                          {branch.name}
                          {branch.isDefault && (
                            <Badge variant="outline" className="h-4 px-1 text-[10px]">
                              default
                            </Badge>
                          )}
                          {branch.worktreePath && (
                            <span className="text-[10px] text-muted-foreground">(in a worktree)</span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>

            <div className="mt-2.5 flex flex-col gap-1.5">
              <Label htmlFor="worktree-branch-name" className="text-[11px] text-muted-foreground">
                Branch name (optional)
              </Label>
              <Input
                id="worktree-branch-name"
                value={value.branchName}
                disabled={!value.enabled}
                placeholder="argos/<auto>"
                className="h-8 text-xs"
                onChange={(event) => onChange({ ...value, branchName: event.target.value })}
              />
            </div>

            <div className="mt-3 flex flex-col gap-1">
              <span className="text-[11px] font-medium text-muted-foreground">Existing worktrees</span>
              {managedWorktrees.length === 0 ? (
                <span className="text-[11px] text-muted-foreground">None yet.</span>
              ) : (
                <ul className="flex max-h-36 flex-col gap-1 overflow-y-auto" data-testid="worktree-list">
                  {managedWorktrees.map((worktree) => (
                    <li
                      key={worktree.path}
                      className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5"
                    >
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-mono text-[11px]">{worktree.branch ?? "(detached)"}</span>
                        <span className="truncate text-[10px] text-muted-foreground" title={worktree.path}>
                          {abbreviatePath(worktree.path)}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-6 text-muted-foreground hover:text-destructive"
                        disabled={removingPath === worktree.path}
                        aria-label={`Remove worktree ${worktree.branch ?? worktree.path}`}
                        onClick={() => void handleRemoveWorktree(worktree)}
                      >
                        {removingPath === worktree.path ? (
                          <Spinner className="size-3" />
                        ) : (
                          <Icon icon="lucide:trash-2" className="size-3.5" />
                        )}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
