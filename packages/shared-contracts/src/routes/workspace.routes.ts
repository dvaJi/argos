import zod from "zod";
import { defineRouteContract } from "../common";
import {
  WorkspaceFileNodeSchema,
  WorkspaceFilePreviewSchema,
  WorkspaceGitBranchSchema,
  WorkspaceGitDiffSchema,
  WorkspaceGitStateSchema,
  WorkspaceGitWorktreeCreationSchema,
  WorkspaceGitWorktreeSchema,
  WorkspaceLinkedFileResolutionSchema,
} from "../domainSchemas";

const WorkspaceRegistrationModeSchema = zod.enum(["workspace", "workdir"]);

export const workspaceRegisterRoute = defineRouteContract({
  name: "workspace.register",
  input: zod.object({
    workspacePath: zod.string().min(1),
    mode: WorkspaceRegistrationModeSchema.default("workspace"),
  }),
  output: zod.object({
    registered: zod.boolean(),
  }),
});

export const workspaceUnregisterRoute = defineRouteContract({
  name: "workspace.unregister",
  input: zod.object({
    workspacePath: zod.string().min(1),
    mode: WorkspaceRegistrationModeSchema.default("workspace"),
  }),
  output: zod.object({
    unregistered: zod.boolean(),
  }),
});

export const workspaceWatchRoute = defineRouteContract({
  name: "workspace.watch",
  input: zod.object({
    workspacePath: zod.string().min(1),
  }),
  output: zod.object({
    watching: zod.boolean(),
  }),
});

export const workspaceUnwatchRoute = defineRouteContract({
  name: "workspace.unwatch",
  input: zod.object({
    workspacePath: zod.string().min(1),
  }),
  output: zod.object({
    watching: zod.boolean(),
  }),
});

export const workspaceReadDirectoryRoute = defineRouteContract({
  name: "workspace.readDirectory",
  input: zod.object({
    path: zod.string().min(1),
  }),
  output: zod.object({
    nodes: zod.array(WorkspaceFileNodeSchema),
  }),
});

export const workspaceExpandDirectoryRoute = defineRouteContract({
  name: "workspace.expandDirectory",
  input: zod.object({
    path: zod.string().min(1),
  }),
  output: zod.object({
    nodes: zod.array(WorkspaceFileNodeSchema),
  }),
});

export const workspaceRevealFileInFolderRoute = defineRouteContract({
  name: "workspace.revealFileInFolder",
  input: zod.object({
    path: zod.string().min(1),
  }),
  output: zod.object({
    revealed: zod.boolean(),
  }),
});

export const workspaceOpenFileRoute = defineRouteContract({
  name: "workspace.openFile",
  input: zod.object({
    path: zod.string().min(1),
  }),
  output: zod.object({
    opened: zod.boolean(),
  }),
});

export const workspaceReadFilePreviewRoute = defineRouteContract({
  name: "workspace.readFilePreview",
  input: zod.object({
    path: zod.string().min(1),
  }),
  output: zod.object({
    preview: WorkspaceFilePreviewSchema.nullable(),
  }),
});

export const workspaceResolveMarkdownLinkedFileRoute = defineRouteContract({
  name: "workspace.resolveMarkdownLinkedFile",
  input: zod.object({
    workspacePath: zod.string().nullable(),
    href: zod.string().min(1),
    sourceFilePath: zod.string().nullable().optional(),
  }),
  output: zod.object({
    resolution: WorkspaceLinkedFileResolutionSchema.nullable(),
  }),
});

export const workspaceGetGitStatusRoute = defineRouteContract({
  name: "workspace.getGitStatus",
  input: zod.object({
    workspacePath: zod.string().min(1),
  }),
  output: zod.object({
    state: WorkspaceGitStateSchema.nullable(),
  }),
});

export const workspaceGetGitDiffRoute = defineRouteContract({
  name: "workspace.getGitDiff",
  input: zod.object({
    workspacePath: zod.string().min(1),
    filePath: zod.string().optional(),
  }),
  output: zod.object({
    diff: WorkspaceGitDiffSchema.nullable(),
  }),
});

/**
 * List local and remote-tracking branches of the repository containing
 * `workspacePath`. Powers the worktree base-branch picker: `origin/…` refs
 * first, then local branches, marking the default branch, the main checkout's
 * HEAD branch, and branches already checked out in some worktree.
 */
export const workspaceGitListBranchesRoute = defineRouteContract({
  name: "workspace.gitListBranches",
  input: zod.object({
    workspacePath: zod.string().min(1),
  }),
  output: zod.object({
    isRepo: zod.boolean(),
    defaultBranch: zod.string().nullable(),
    branches: zod.array(WorkspaceGitBranchSchema),
  }),
});

/** List the git worktrees registered for the repository containing `workspacePath`. */
export const workspaceGitListWorktreesRoute = defineRouteContract({
  name: "workspace.gitListWorktrees",
  input: zod.object({
    workspacePath: zod.string().min(1),
  }),
  output: zod.object({
    worktrees: zod.array(WorkspaceGitWorktreeSchema),
  }),
});

/**
 * Create an isolated git worktree for agent work, modeled on t3code's
 * `createWorktree`. The worktree is always based on an explicit start point —
 * the named base branch, or (when `fromRemote` is set and `origin` exists) the
 * fetched `origin/<baseBranch>` tip resolved to a commit SHA — never on the
 * current checkout. A new branch (auto `argos/<8hex>` unless `branchName` is
 * given) is created for the worktree inside the daemon-managed worktrees
 * directory, so the user's checkout is never touched or switched.
 */
export const workspaceGitCreateWorktreeRoute = defineRouteContract({
  name: "workspace.gitCreateWorktree",
  input: zod.object({
    workspacePath: zod.string().min(1),
    baseBranch: zod.string().min(1),
    /** Base the worktree on `origin/<baseBranch>` (fetch + resolve to a SHA) instead of the local ref. */
    fromRemote: zod.boolean().default(true),
    /** Optional branch name to create for the worktree; auto-generated as `argos/<8hex>` when omitted. */
    branchName: zod.string().optional(),
  }),
  output: zod.object({
    worktree: WorkspaceGitWorktreeCreationSchema,
  }),
});

/**
 * Remove a git worktree registered under the repository containing
 * `workspacePath`. The path must belong to that repo's worktree list and must
 * not be the main worktree. `deleteBranch` additionally deletes the branch that
 * was checked out in the removed worktree (refused for the main checkout's HEAD
 * branch and the default remote branch).
 */
export const workspaceGitRemoveWorktreeRoute = defineRouteContract({
  name: "workspace.gitRemoveWorktree",
  input: zod.object({
    workspacePath: zod.string().min(1),
    worktreePath: zod.string().min(1),
    force: zod.boolean().default(false),
    deleteBranch: zod.boolean().default(false),
  }),
  output: zod.object({
    removed: zod.boolean(),
  }),
});

export const workspaceSearchFilesRoute = defineRouteContract({
  name: "workspace.searchFiles",
  input: zod.object({
    workspacePath: zod.string().min(1),
    query: zod.string(),
  }),
  output: zod.object({
    nodes: zod.array(WorkspaceFileNodeSchema),
  }),
});

/**
 * Browse a directory on the host filesystem (daemon-side). Powers the web-mode
 * FolderPicker: the user navigates the real filesystem (which only the daemon
 * can see) by typing a path and stepping through subdirectories — the same
 * model t3code's web app uses. Desktop falls back to its native dialog; this
 * route is the web/headless path. Returns the resolved absolute path, its
 * parent, and the child entries (directories only, for navigation).
 */
export const workspaceBrowseDirectoryRoute = defineRouteContract({
  name: "workspace.browseDirectory",
  input: zod
    .object({
      path: zod.string().optional(),
    })
    .default({}),
  output: zod.object({
    path: zod.string(),
    parent: zod.string().nullable(),
    home: zod.string(),
    separator: zod.enum(["/", "\\"]),
    entries: zod.array(
      zod.object({
        name: zod.string(),
        path: zod.string(),
        isDirectory: zod.boolean(),
      }),
    ),
  }),
});

/**
 * Read raw UTF-8 text for editing. Distinct from `readFilePreview`, which
 * normalizes content for preview rendering. Returns null content when the file
 * is binary, non-text, or above the size cap.
 */
export const workspaceReadFileTextRoute = defineRouteContract({
  name: "workspace.readFileText",
  input: zod.object({
    path: zod.string().min(1),
  }),
  output: zod.object({
    content: zod.string().nullable(),
    exists: zod.boolean(),
  }),
});

/** Write file content to disk (overwrites). */
export const workspaceWriteFileRoute = defineRouteContract({
  name: "workspace.writeFile",
  input: zod.object({
    path: zod.string().min(1),
    content: zod.string(),
  }),
  output: zod.object({
    written: zod.boolean(),
  }),
});

/** Create a new file or directory. */
export const workspaceCreateEntryRoute = defineRouteContract({
  name: "workspace.createEntry",
  input: zod.object({
    parentDir: zod.string().min(1),
    name: zod.string().min(1),
    isDirectory: zod.boolean(),
  }),
  output: zod.object({
    path: zod.string(),
  }),
});

/** Delete a file or directory (recursive). */
export const workspaceDeletePathRoute = defineRouteContract({
  name: "workspace.deletePath",
  input: zod.object({
    path: zod.string().min(1),
  }),
  output: zod.object({
    deleted: zod.boolean(),
  }),
});

/** Rename or move a file/directory. */
export const workspaceRenameOrMovePathRoute = defineRouteContract({
  name: "workspace.renameOrMovePath",
  input: zod.object({
    fromPath: zod.string().min(1),
    toPath: zod.string().min(1),
  }),
  output: zod.object({
    path: zod.string(),
  }),
});
