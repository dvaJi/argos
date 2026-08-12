import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EditProvider, File, type CreateEditor } from "@pierre/diffs/react";
import { Editor } from "@pierre/diffs/edit";
import { Icon } from "@iconify/react";
import { toast } from "sonner";
import { Button } from "#shadcn/components/ui/button";
import { createWorkspaceClient } from "#api/WorkspaceClient";
import { useDiffsBaseOptions } from "./diffsOptions";

interface DiffsEditorPaneProps {
  filePath: string;
  initialContent: string;
  language?: string | null;
  onSaved?: () => void;
}

/**
 * Writable code editor backed by `@pierre/diffs` (`EditProvider` + `Editor` +
 * `<File edit>`). Same Shiki rendering as the read-only viewer and the diff
 * surfaces, so view/edit/diff share one pipeline. Saves via `workspace.writeFile`;
 * dirty indicator + Cmd/Ctrl+S.
 *
 * Mount this component keyed by file path so each file gets a fresh editor.
 */
export function DiffsEditorPane({ filePath, initialContent, language, onSaved }: DiffsEditorPaneProps) {
  const base = useDiffsBaseOptions();
  const workspaceClient = createWorkspaceClient();

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const originalRef = useRef<string>(initialContent);
  const editorRef = useRef<Editor<undefined> | null>(null);

  const fileBasename = useMemo(() => {
    const segments = filePath.split(/[\\/]+/).filter(Boolean);
    return segments[segments.length - 1] ?? filePath;
  }, [filePath]);

  // `language` is a hint; Shiki infers from the filename, so we don't force it.
  void language;

  const file = useMemo(() => ({ name: fileBasename, contents: initialContent }), [fileBasename, initialContent]);

  const options = useMemo(
    () => ({ ...base, disableLineNumbers: false, overflow: "scroll" as const, stickyHeader: false }),
    [base],
  );

  const createEditor = useCallback<CreateEditor<undefined>>((editorOptions) => {
    const editor = new Editor<undefined>({
      ...editorOptions,
      onChange: (changedFile, lineAnnotations, event) => {
        editorOptions.onChange?.(changedFile, lineAnnotations, event);
        setDirty(editor.getText() !== originalRef.current);
      },
    });
    editorRef.current = editor;
    return editor;
  }, []);

  const handleSave = useCallback(async () => {
    const editor = editorRef.current;
    if (!editor || !dirty || saving) return;
    setSaving(true);
    try {
      const text = editor.getText();
      await workspaceClient.writeFile(filePath, text);
      originalRef.current = text;
      setDirty(false);
      onSaved?.();
    } catch (error) {
      console.error("[DiffsEditorPane] save failed", error);
      toast.error(`Failed to save ${fileBasename}`);
    } finally {
      setSaving(false);
    }
  }, [dirty, saving, editorRef, workspaceClient, filePath, onSaved, fileBasename]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const isSave = (event.metaKey || event.ctrlKey) && (event.key === "s" || event.key === "S");
      if (isSave) {
        event.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background" data-testid="diffs-editor-pane">
      <div className="flex h-8 shrink-0 items-center justify-between border-b px-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate font-medium text-foreground">{fileBasename}</span>
          {dirty && <span className="text-amber-500">● unsaved</span>}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-xs"
          disabled={!dirty || saving}
          onClick={handleSave}
        >
          <Icon icon="lucide:save" className="mr-1 h-3 w-3" />
          {saving ? "Saving..." : "Save"}
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <EditProvider createEditor={createEditor}>
          <File file={file} options={options} edit disableWorkerPool style={{ height: "100%" }} />
        </EditProvider>
      </div>
    </div>
  );
}
