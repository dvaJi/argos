import { ElectronAPI } from "@electron-toolkit/preload";
import type { ArgosBridge } from "@argos/shared-contracts/bridge";

declare global {
  interface Window {
    electron: ElectronAPI;
    argos: ArgosBridge;
    api: {
      copyText(text: string): void;
      copyImage(image: string): void;
      readClipboardText(): string;
      getPathForFile(file: File): string;
      getWindowId(): number | null;
      getWebContentsId(): number;
      getArch(): string;
      openExternal?(url: string): Promise<void>;
      toRelativePath?(filePath: string, baseDir?: string): string;
      formatPathForInput?(filePath: string): string;
    };
    __argosDev?: {
      goToWelcome(): boolean;
      clearWelcomeOverride(): boolean;
    };
    floatingButtonAPI: typeof floatingButtonAPI;
  }
}
