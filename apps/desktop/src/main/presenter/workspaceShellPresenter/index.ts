import path from "path";
import { shell } from "electron";

/**
 * Desktop-only workspace shell actions.
 *
 * All other `workspace.*` routes (tree, git, file edit, preview, search) are
 * daemon-owned and served by `daemonWorkspacePresenter`; the desktop main
 * process only exposes these two Electron `shell` integrations, which are
 * registered as desktop-only routes in `@argos/shared-contracts/desktop-only`.
 */
export interface WorkspaceShellPresenter {
  revealFileInFolder(filePath: string): Promise<void>;
  openFile(filePath: string): Promise<void>;
}

export class ElectronWorkspaceShellPresenter implements WorkspaceShellPresenter {
  async revealFileInFolder(filePath: string): Promise<void> {
    const normalizedPath = path.resolve(filePath);
    try {
      shell.showItemInFolder(normalizedPath);
    } catch (error) {
      console.error(`[WorkspaceShell] Failed to reveal path: ${normalizedPath}`, error);
    }
  }

  async openFile(filePath: string): Promise<void> {
    const normalizedPath = path.resolve(filePath);
    try {
      const errorMessage = await shell.openPath(normalizedPath);
      if (errorMessage) {
        console.error(`[WorkspaceShell] Failed to open path: ${normalizedPath}`, errorMessage);
      }
    } catch (error) {
      console.error(`[WorkspaceShell] Failed to open path: ${normalizedPath}`, error);
    }
  }
}
