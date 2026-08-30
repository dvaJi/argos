/**
 * Workspace Types
 * Types for the unified right sidepanel workspace experience.
 */

export type SidePanelTab = "workspace" | "browser" | "diffs" | "terminal";

export type WorkspaceNavSection = "artifacts" | "files" | "git" | "subagents";

export type WorkspaceViewMode = "preview" | "code";

/**
 * File tree node
 */
export type WorkspaceFileNode = {
  /** File/directory name */
  name: string;
  /** Full path */
  path: string;
  /** Whether it's a directory */
  isDirectory: boolean;
  /** Child nodes (directories only) */
  children?: WorkspaceFileNode[];
  /** Whether expanded (frontend state) */
  expanded?: boolean;
};

export type WorkspaceFilePreviewKind = "text" | "markdown" | "html" | "pdf" | "svg" | "image" | "binary";

export type WorkspaceFileMetadata = {
  fileName: string;
  fileSize: number;
  fileDescription?: string;
  fileCreated: Date;
  fileModified: Date;
};

export type WorkspaceFilePreview = {
  path: string;
  relativePath: string;
  name: string;
  mimeType: string;
  kind: WorkspaceFilePreviewKind;
  content: string;
  previewUrl?: string;
  thumbnail?: string;
  language?: string | null;
  metadata: WorkspaceFileMetadata;
};

export type WorkspaceGitChangeType =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "copied"
  | "untracked"
  | "ignored"
  | "unmerged";

export type WorkspaceGitFileChange = {
  path: string;
  relativePath: string;
  previousPath?: string | null;
  stagedStatus: string | null;
  unstagedStatus: string | null;
  type: WorkspaceGitChangeType;
};

export type WorkspaceGitState = {
  workspacePath: string;
  branch: string | null;
  ahead: number;
  behind: number;
  changes: WorkspaceGitFileChange[];
};

export type WorkspaceGitDiff = {
  workspacePath: string;
  filePath: string | null;
  relativePath: string | null;
  staged: string;
  unstaged: string;
};

export type WorkspaceGitBranchKind = "local" | "remote";

export type WorkspaceGitBranch = {
  /** Branch name without the `refs/heads/` or `refs/remotes/` prefix (e.g. `main`, `origin/main`). */
  name: string;
  kind: WorkspaceGitBranchKind;
  /** True for the repo's default branch (from `origin/HEAD`, falling back to the main checkout HEAD). */
  isDefault: boolean;
  /** True for the branch currently checked out in the main checkout. */
  isHead: boolean;
  /** Absolute path of the worktree that has this branch checked out, when any. */
  worktreePath: string | null;
};

export type WorkspaceGitWorktree = {
  /** Absolute path of the worktree directory. */
  path: string;
  /** Checked-out branch name (null for bare/detached worktrees). */
  branch: string | null;
  /** HEAD commit SHA of the worktree. */
  head: string;
  /** True for the repository's main worktree (never removable via worktree routes). */
  isMain: boolean;
  /** True for worktrees the daemon created under its managed root (the only ones removable via routes). */
  isManaged: boolean;
};

export type WorkspaceGitWorktreeCreation = {
  /** Absolute path of the created worktree directory. */
  worktreePath: string;
  /** Branch created and checked out in the new worktree. */
  branch: string;
  /** Ref the worktree was based on (e.g. `main`, `origin/main`, or a commit SHA). */
  baseRef: string;
};

export type WorkspaceInvalidationKind = "fs" | "git" | "full";

export type WorkspaceInvalidationSource = "watcher" | "fallback" | "lifecycle";

export type WorkspaceInvalidationEvent = {
  workspacePath: string;
  kind: WorkspaceInvalidationKind;
  source: WorkspaceInvalidationSource;
};

export type ResolveMarkdownLinkedFileInput = {
  workspacePath: string | null;
  href: string;
  sourceFilePath?: string | null;
};

export type WorkspaceLinkedFileResolution = {
  path: string;
  name: string;
  relativePath: string;
  workspaceRoot: string | null;
};

/**
 * Workspace Presenter interface
 */
export interface IWorkspacePresenter {
  /**
   * Register a workspace path as allowed for reading (security boundary)
   * @param workspacePath Workspace directory path
   */
  registerWorkspace(workspacePath: string): Promise<void>;

  /**
   * Register a workdir path as allowed for reading (ACP alias)
   * @param workdir Workspace directory path
   */
  registerWorkdir(workdir: string): Promise<void>;

  /**
   * Unregister a workspace path
   * @param workspacePath Workspace directory path
   */
  unregisterWorkspace(workspacePath: string): Promise<void>;

  /**
   * Unregister a workdir path (ACP alias)
   * @param workdir Workspace directory path
   */
  unregisterWorkdir(workdir: string): Promise<void>;

  /**
   * Start watching a workspace for file-system and git invalidation events.
   * @param workspacePath Workspace directory path
   */
  watchWorkspace(workspacePath: string): Promise<void>;

  /**
   * Stop watching a workspace.
   * @param workspacePath Workspace directory path
   */
  unwatchWorkspace(workspacePath: string): Promise<void>;

  /**
   * Read directory (shallow, only first level)
   * Use expandDirectory to load subdirectory contents
   * @param dirPath Directory path
   * @returns Array of file tree nodes (directories have children = undefined)
   */
  readDirectory(dirPath: string): Promise<WorkspaceFileNode[]>;

  /**
   * Expand a directory to load its children (lazy loading)
   * @param dirPath Directory path to expand
   * @returns Array of child file tree nodes
   */
  expandDirectory(dirPath: string): Promise<WorkspaceFileNode[]>;

  /**
   * Reveal a file or directory in the system file manager
   * @param filePath Path to reveal
   */
  revealFileInFolder(filePath: string): Promise<void>;

  /**
   * Open a file or directory using the system default application
   * @param filePath Path to open
   */
  openFile(filePath: string): Promise<void>;

  /**
   * Read a workspace file and normalize it to a preview-friendly payload.
   * @param filePath Absolute file path
   */
  readFilePreview(filePath: string): Promise<WorkspaceFilePreview | null>;

  /**
   * Resolve a markdown file link against the current workspace or source file.
   * Authorizes the resolved file for subsequent preview/open operations.
   */
  resolveMarkdownLinkedFile(input: ResolveMarkdownLinkedFileInput): Promise<WorkspaceLinkedFileResolution | null>;

  /**
   * Read git status for the provided workspace path.
   * Returns null when git is unavailable or the workspace is not a git repo.
   * @param workspacePath Workspace directory path
   */
  getGitStatus(workspacePath: string): Promise<WorkspaceGitState | null>;

  /**
   * Read git diff for the provided workspace path and optional file path.
   * Returns null when git is unavailable or the workspace is not a git repo.
   * @param workspacePath Workspace directory path
   * @param filePath Optional absolute file path within the workspace
   */
  getGitDiff(workspacePath: string, filePath?: string): Promise<WorkspaceGitDiff | null>;

  /**
   * List local and remote-tracking branches for the repo containing `workspacePath`.
   * Returns `isRepo: false` with an empty list when the path is not a git repository.
   */
  listGitBranches(workspacePath: string): Promise<{
    isRepo: boolean;
    defaultBranch: string | null;
    branches: WorkspaceGitBranch[];
  }>;

  /** List the git worktrees registered for the repo containing `workspacePath`. */
  listGitWorktrees(workspacePath: string): Promise<WorkspaceGitWorktree[]>;

  /**
   * Create an isolated git worktree based on an explicit branch ref (`baseBranch`,
   * or the fetched `origin/<baseBranch>` tip when `fromRemote` is set). Never
   * touches the current checkout: `git worktree add -b <branch> <dir> <startPoint>`
   * with a server-derived directory under the daemon worktrees root.
   */
  createGitWorktree(input: {
    workspacePath: string;
    baseBranch: string;
    fromRemote: boolean;
    branchName?: string;
  }): Promise<WorkspaceGitWorktreeCreation>;

  /**
   * Remove a worktree registered under the repo containing `workspacePath`.
   * Refuses the main worktree and (with `deleteBranch`) protected branches.
   */
  removeGitWorktree(input: {
    workspacePath: string;
    worktreePath: string;
    force: boolean;
    deleteBranch: boolean;
  }): Promise<void>;

  /**
   * Search workspace files by query (query does not include @)
   * @param workspacePath Workspace directory path
   * @param query Search query (plain string)
   */
  searchFiles(workspacePath: string, query: string): Promise<WorkspaceFileNode[]>;

  /**
   * Read raw UTF-8 text of a file for editing. Returns null content for binary,
   * non-text, or oversized files.
   * @param filePath Absolute file path
   */
  readFileText(filePath: string): Promise<{ content: string | null; exists: boolean }>;

  /**
   * Write file content to disk (overwrites existing content).
   * @param filePath Absolute file path
   * @param content File content
   */
  writeFile(filePath: string, content: string): Promise<void>;

  /**
   * Create a new file (empty) or directory.
   * @param parentDir Absolute parent directory path
   * @param name Entry name
   * @param isDirectory Whether to create a directory
   * @returns The created absolute path
   */
  createEntry(parentDir: string, name: string, isDirectory: boolean): Promise<string>;

  /**
   * Delete a file or directory (recursive).
   * @param targetPath Absolute path to delete
   */
  deletePath(targetPath: string): Promise<void>;

  /**
   * Rename or move a file/directory.
   * @param fromPath Absolute source path
   * @param toPath Absolute destination path
   * @returns The resolved destination path
   */
  renameOrMovePath(fromPath: string, toPath: string): Promise<string>;
}
