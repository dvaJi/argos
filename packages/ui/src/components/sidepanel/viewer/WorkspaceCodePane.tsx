import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useMonaco } from "stream-monaco";
import { useThemeStore } from "#/stores/theme";
import { useUiSettingsStore, getFormattedCodeFontFamily } from "#/stores/uiSettingsStore";

type WorkspaceCodeSource = {
  id: string;
  content: string;
  language?: string | null;
  type?: string;
};

interface WorkspaceCodePaneProps {
  source: WorkspaceCodeSource;
}

const LANGUAGE_ALIASES: Record<string, string> = {
  md: "markdown",
  mdx: "markdown",
  txt: "plaintext",
  text: "plaintext",
  plain: "plaintext",
  htm: "html",
  xhtml: "html",
  js: "javascript",
  jsx: "javascript",
  cjs: "javascript",
  mjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  rb: "ruby",
  rs: "rust",
  yml: "yaml",
  sh: "shell",
  shell: "shell",
  bash: "shell",
  zsh: "shell",
  ps1: "powershell",
  docker: "dockerfile",
  svg: "xml",
};

const sanitizeLanguage = (language: string | undefined | null): string => {
  if (!language) return "";
  const normalized = language.trim().toLowerCase();
  return LANGUAGE_ALIASES[normalized] ?? normalized;
};

const resolveLanguage = (source: WorkspaceCodeSource): string => {
  const explicit = sanitizeLanguage(source.language);
  if (explicit) return explicit;

  const type = source.type?.trim().toLowerCase() ?? "";
  if (!type) return "plaintext";

  switch (type) {
    case "application/vnd.ant.code":
      return "plaintext";
    case "text/markdown":
      return "markdown";
    case "text/html":
    case "application/xhtml+xml":
      return "html";
    case "image/svg+xml":
      return "xml";
    case "application/vnd.ant.mermaid":
      return "plaintext";
    case "application/vnd.ant.react":
      return "javascript";
    case "application/json":
    case "application/ld+json":
      return "json";
    case "application/xml":
      return "xml";
    case "application/x-yaml":
    case "application/yaml":
      return "yaml";
    default:
      if (type.endsWith("+json")) return "json";
      if (type.endsWith("+xml")) return "xml";
      if (type.startsWith("text/")) return "plaintext";
      return sanitizeLanguage(type) || "plaintext";
  }
};

export function WorkspaceCodePane({ source }: WorkspaceCodePaneProps) {
  const uiSettingsStore = useUiSettingsStore();
  const themeStore = useThemeStore();
  const editorRef = useRef<HTMLDivElement>(null);
  const [editorInitialized, setEditorInitialized] = useState(false);
  const createEditorTaskRef = useRef<Promise<void> | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const resolvedTheme = useMemo(() => (themeStore.isDark ? "vitesse-dark" : "vitesse-light"), [themeStore.isDark]);
  const resolvedLanguage = useMemo(() => resolveLanguage(source), [source]);

  const { createEditor, updateCode, cleanupEditor, getEditorView, getEditor } = useMonaco({
    readOnly: true,
    domReadOnly: true,
    automaticLayout: true,
    wordWrap: "on",
    wrappingIndent: "same",
    scrollBeyondLastLine: false,
    minimap: { enabled: false },
    lineNumbers: "on",
    renderLineHighlight: "none",
    contextmenu: false,
    themes: ["vitesse-dark", "vitesse-light"],
    theme: resolvedTheme,
    fontFamily: getFormattedCodeFontFamily(),
    padding: { top: 12, bottom: 12 },
  });

  const applyFontFamily = useCallback(
    (fontFamily: string) => {
      getEditorView()?.updateOptions({ fontFamily });
    },
    [getEditorView],
  );

  const applyTheme = useCallback(async () => {
    try {
      getEditor().setTheme(resolvedTheme);
    } catch (error) {
      console.warn("[WorkspaceCodePane] Failed to apply Monaco theme:", error);
    }
  }, [getEditor, resolvedTheme]);

  const layoutEditor = useCallback(() => {
    try {
      getEditorView()?.layout();
    } catch (error) {
      console.warn("[WorkspaceCodePane] Failed to layout Monaco editor:", error);
    }
  }, [getEditorView]);

  useEffect(() => {
    const editorElement = editorRef.current;
    if (!editorElement) return;

    const nextContent = source.content ?? "";
    const nextLanguage = resolvedLanguage;
    const hasEditor = Boolean(editorElement.querySelector(".monaco-editor"));

    if (!hasEditor || !editorInitialized) {
      if (createEditorTaskRef.current) return;

      createEditorTaskRef.current = (async () => {
        await createEditor(editorElement, nextContent, nextLanguage);
        setEditorInitialized(true);
        await applyTheme();
        applyFontFamily(getFormattedCodeFontFamily());
        layoutEditor();
      })();

      createEditorTaskRef.current.finally(() => {
        createEditorTaskRef.current = null;
      });
      return;
    }

    updateCode(nextContent, nextLanguage);
    layoutEditor();
  }, [source.id, source.content, resolvedLanguage, editorInitialized]);

  useEffect(() => {
    applyFontFamily(getFormattedCodeFontFamily());
  }, [getFormattedCodeFontFamily()]);

  useEffect(() => {
    if (editorInitialized) {
      applyTheme();
    }
  }, [resolvedTheme, editorInitialized]);

  useEffect(() => {
    const element = editorRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      layoutEditor();
    });
    observer.observe(element);
    resizeObserverRef.current = observer;

    return () => {
      observer.disconnect();
      resizeObserverRef.current = null;
      cleanupEditor();
      setEditorInitialized(false);
      createEditorTaskRef.current = null;
    };
  }, []);

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-background">
      <div
        ref={editorRef}
        className="workspace-code-editor-host h-full min-h-0 w-full flex-1"
        data-language={resolvedLanguage}
        data-testid="workspace-code-pane"
      />
      <style>{`
        .workspace-code-editor-host {
          display: flex;
          height: 100% !important;
          min-height: 0 !important;
          max-height: none !important;
          overflow: hidden !important;
        }
        .workspace-code-editor-host .monaco-editor,
        .workspace-code-editor-host .overflow-guard,
        .workspace-code-editor-host .monaco-scrollable-element {
          height: 100% !important;
          min-height: 0 !important;
          max-height: none !important;
        }
      `}</style>
    </div>
  );
}
