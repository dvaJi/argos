import zod from "zod";
import { defineRouteContract } from "../common";
import {
  WorkspaceFileNodeSchema,
  WorkspaceFilePreviewSchema,
  WorkspaceGitDiffSchema,
  WorkspaceGitStateSchema,
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
