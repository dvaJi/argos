import { useCallback, useMemo } from "react";
import { createBrowserClient } from "#api/BrowserClient";
import { createWorkspaceClient } from "#api/WorkspaceClient";
import { sessionStore, getActiveSession } from "#/stores/ui/session";
import { openBrowser, openDiffs, selectFile, setDiffsSelection } from "#/stores/ui/sidepanel";
import { classifyMarkdownLink, type MarkdownLinkContext } from "./linkTypes";

const isPathWithinWorkspace = (filePath: string, workspacePath: string | null): boolean => {
  if (!workspacePath) return false;
  const normalize = (value: string) => value.replace(/[\\/]+$/, "").toLowerCase();
  const target = normalize(filePath);
  const root = normalize(workspacePath);
  return target === root || target.startsWith(`${root}/`) || target.startsWith(`${root}\\`);
};

interface UseMarkdownLinkNavigationOptions {
  linkContext?: MarkdownLinkContext | undefined;
}

type SessionContext = {
  sessionId: string | null;
  workspacePath: string | null;
  sourceFilePath: string | null;
};

function buildSafeAttributeSelector(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Normalize a local-file href from chat markdown so it resolves on disk:
 * - strip a leading "/" before a Windows drive letter (`/C:/...` -> `C:/...`)
 * - strip a trailing editor-style line/column suffix (`path:18` / `path:18:5`)
 * The line number is dropped (the file opens at the top); line-scrolling is future work.
 */
function normalizeLocalFilePathHref(rawHref: string): string {
  let href = rawHref.trim();
  href = href.replace(/^\/([a-zA-Z]:[\\/])/, "$1");
  href = href.replace(/:[0-9]+(?::[0-9]+)?$/, "");
  return href;
}

export function useMarkdownLinkNavigation(options: UseMarkdownLinkNavigationOptions = {}) {
  const browserClient = useMemo(() => createBrowserClient(), []);
  const workspaceClient = useMemo(() => createWorkspaceClient(), []);

  const sessionId = options.linkContext?.sessionId;
  const sourceFilePath = options.linkContext?.sourceFilePath;

  const navigateLink = useCallback(
    async (href: string, event?: MouseEvent | null): Promise<boolean> => {
      const linkContext = options.linkContext;

      // Degenerate hrefs (empty/whitespace) have no target; bail instead of
      // failing route validation downstream.
      if (!href.trim()) {
        return false;
      }

      const getSessionContext = (): SessionContext => {
        const resolvedSessionId = linkContext?.sessionId ?? sessionStore.state.activeSessionId;
        const session =
          sessionStore.state.sessions.find((item) => item.id === resolvedSessionId) ??
          (resolvedSessionId === sessionStore.state.activeSessionId ? getActiveSession() : undefined);
        const workspacePath = session?.projectDir?.trim() || null;

        return {
          sessionId: resolvedSessionId,
          workspacePath,
          sourceFilePath: linkContext?.sourceFilePath?.trim() || null,
        };
      };

      const openExternal = async (url: string): Promise<boolean> => {
        try {
          await browserClient.openExternal(url);
          return true;
        } catch (error) {
          console.warn("[markdown-links] Failed to open external link:", url, error);
          return false;
        }
      };

      const scrollToFragment = (fragment: string): boolean => {
        const decodedFragment = decodeURIComponent(fragment);
        if (!decodedFragment) {
          return true;
        }

        const byId = document.getElementById(decodedFragment);
        if (byId) {
          byId.scrollIntoView({ block: "start" });
          return true;
        }

        const byName = document.querySelector(
          `[name="${buildSafeAttributeSelector(decodedFragment)}"]`,
        ) as HTMLElement | null;
        if (byName) {
          byName.scrollIntoView({ block: "start" });
          return true;
        }

        return false;
      };

      const openInYoBrowser = async (url: string): Promise<boolean> => {
        const { sessionId: ctxSessionId } = getSessionContext();
        if (!ctxSessionId) {
          return openExternal(url);
        }

        try {
          openBrowser();
          await browserClient.loadUrl(ctxSessionId, url);
          return true;
        } catch (error) {
          console.warn("[markdown-links] Failed to open link in YoBrowser:", url, error);
          return openExternal(url);
        }
      };

      const openLocalFile = async (fileHref: string): Promise<boolean> => {
        const { sessionId: ctxSessionId, workspacePath, sourceFilePath: ctxSourceFilePath } = getSessionContext();
        const normalizedHref = normalizeLocalFilePathHref(fileHref);
        const resolution = await workspaceClient.resolveMarkdownLinkedFile({
          workspacePath,
          href: normalizedHref,
          sourceFilePath: ctxSourceFilePath,
        });

        if (!resolution) {
          console.warn("[markdown-links] Failed to resolve local markdown link:", fileHref);
          return false;
        }

        if (ctxSessionId) {
          // In-workspace files open in the Diffs tab (the diff is usually what
          // you want from a chat link); files outside the workspace fall back to
          // the workspace file viewer (no diff available for other projects).
          if (isPathWithinWorkspace(resolution.path, workspacePath)) {
            setDiffsSelection(resolution.path);
            openDiffs();
          } else {
            selectFile(ctxSessionId, resolution.path, {
              open: true,
              viewMode: "preview",
            });
          }
          return true;
        }

        await workspaceClient.openFile(resolution.path);
        return true;
      };

      const target = classifyMarkdownLink(href);

      switch (target.kind) {
        case "fragment":
          event?.preventDefault();
          scrollToFragment(target.fragment);
          return true;
        case "web":
          event?.preventDefault();
          if (event?.altKey) {
            return openExternal(target.url);
          }
          return openInYoBrowser(target.url);
        case "system":
        case "external":
          event?.preventDefault();
          return openExternal(target.url);
        case "local-file":
          event?.preventDefault();
          return openLocalFile(target.href);
        default:
          return false;
      }
    },
    [browserClient, workspaceClient, sessionId, sourceFilePath],
  );

  return {
    navigateLink,
  };
}
