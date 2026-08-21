/** Draft worktree configuration held by the new-thread page until submit. */
export type WorktreeDraftConfig = {
  enabled: boolean;
  /** Plain branch name the worktree is based on (e.g. `main`). */
  baseBranch: string;
  /** Base the worktree on the fetched `origin/<baseBranch>` tip instead of the local ref. */
  fromRemote: boolean;
  /** Custom branch name for the worktree; empty means auto `argos/<8hex>`. */
  branchName: string;
};

export const emptyWorktreeDraft: WorktreeDraftConfig = {
  enabled: false,
  baseBranch: "",
  fromRemote: true,
  branchName: "",
};
