import type { ArgosBridge } from "@argos/shared-contracts/bridge";
import { workspaceInvalidatedEvent } from "@argos/shared-contracts/events";
import {
  workspaceExpandDirectoryRoute,
  workspaceGetGitDiffRoute,
  workspaceGetGitStatusRoute,
  workspaceOpenFileRoute,
  workspaceReadDirectoryRoute,
  workspaceReadFilePreviewRoute,
  workspaceReadFileTextRoute,
  workspaceRegisterRoute,
  workspaceRenameOrMovePathRoute,
  workspaceResolveMarkdownLinkedFileRoute,
  workspaceRevealFileInFolderRoute,
  workspaceSearchFilesRoute,
  workspaceBrowseDirectoryRoute,
  workspaceCreateEntryRoute,
  workspaceDeletePathRoute,
  workspaceUnregisterRoute,
  workspaceUnwatchRoute,
  workspaceWatchRoute,
  workspaceWriteFileRoute,
} from "@argos/shared-contracts/routes";
import { getArgosBridge } from "./core";

type WorkspaceRegistrationMode = "workspace" | "workdir";

export function createWorkspaceClient(bridge: ArgosBridge = getArgosBridge()) {
  async function registerWorkspace(workspacePath: string, mode: WorkspaceRegistrationMode = "workspace") {
    return await bridge.invoke(workspaceRegisterRoute.name, { workspacePath, mode });
  }

  async function unregisterWorkspace(workspacePath: string, mode: WorkspaceRegistrationMode = "workspace") {
    return await bridge.invoke(workspaceUnregisterRoute.name, { workspacePath, mode });
  }

  async function watchWorkspace(workspacePath: string) {
    return await bridge.invoke(workspaceWatchRoute.name, { workspacePath });
  }

  async function unwatchWorkspace(workspacePath: string) {
    return await bridge.invoke(workspaceUnwatchRoute.name, { workspacePath });
  }

  async function readDirectory(path: string) {
    const result = await bridge.invoke(workspaceReadDirectoryRoute.name, { path });
    return result.nodes;
  }

  async function expandDirectory(path: string) {
    const result = await bridge.invoke(workspaceExpandDirectoryRoute.name, { path });
    return result.nodes;
  }

  async function revealFileInFolder(path: string) {
    return await bridge.invoke(workspaceRevealFileInFolderRoute.name, { path });
  }

  async function openFile(path: string) {
    return await bridge.invoke(workspaceOpenFileRoute.name, { path });
  }

  async function readFilePreview(path: string) {
    const result = await bridge.invoke(workspaceReadFilePreviewRoute.name, { path });
    return result.preview;
  }

  async function resolveMarkdownLinkedFile(input: {
    workspacePath: string | null;
    href: string;
    sourceFilePath?: string | null;
  }) {
    const result = await bridge.invoke(workspaceResolveMarkdownLinkedFileRoute.name, input);
    return result.resolution;
  }

  async function getGitStatus(workspacePath: string) {
    const result = await bridge.invoke(workspaceGetGitStatusRoute.name, { workspacePath });
    return result.state;
  }

  async function getGitDiff(workspacePath: string, filePath?: string) {
    const result = await bridge.invoke(workspaceGetGitDiffRoute.name, {
      workspacePath,
      filePath,
    });
    return result.diff;
  }

  async function searchFiles(workspacePath: string, query: string) {
    const result = await bridge.invoke(workspaceSearchFilesRoute.name, {
      workspacePath,
      query,
    });
    return result.nodes;
  }

  /** Browse a host directory (daemon-side) for the web-mode FolderPicker. */
  async function browseDirectory(path?: string) {
    return await bridge.invoke(workspaceBrowseDirectoryRoute.name, path ? { path } : {});
  }

  /** Read raw UTF-8 text for editing (null content for binary/non-text/oversized). */
  async function readFileText(path: string) {
    return await bridge.invoke(workspaceReadFileTextRoute.name, { path });
  }

  async function writeFile(path: string, content: string) {
    return await bridge.invoke(workspaceWriteFileRoute.name, { path, content });
  }

  async function createEntry(parentDir: string, name: string, isDirectory: boolean) {
    return await bridge.invoke(workspaceCreateEntryRoute.name, { parentDir, name, isDirectory });
  }

  async function deletePath(path: string) {
    return await bridge.invoke(workspaceDeletePathRoute.name, { path });
  }

  async function renameOrMovePath(fromPath: string, toPath: string) {
    return await bridge.invoke(workspaceRenameOrMovePathRoute.name, { fromPath, toPath });
  }

  function onInvalidated(
    listener: (payload: {
      workspacePath: string;
      kind: "fs" | "git" | "full";
      source: "watcher" | "fallback" | "lifecycle";
      version: number;
    }) => void,
  ) {
    return bridge.on(workspaceInvalidatedEvent.name, listener);
  }

  return {
    registerWorkspace,
    unregisterWorkspace,
    watchWorkspace,
    unwatchWorkspace,
    readDirectory,
    expandDirectory,
    revealFileInFolder,
    openFile,
    readFilePreview,
    resolveMarkdownLinkedFile,
    getGitStatus,
    getGitDiff,
    searchFiles,
    browseDirectory,
    readFileText,
    writeFile,
    createEntry,
    deletePath,
    renameOrMovePath,
    onInvalidated,
  };
}

type WorkspaceClient = ReturnType<typeof createWorkspaceClient>;
