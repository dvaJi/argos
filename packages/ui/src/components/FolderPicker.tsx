import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "#shadcn/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "#shadcn/components/ui/dialog";
import { ScrollArea } from "#shadcn/components/ui/scroll-area";
import { createWorkspaceClient } from "#api/WorkspaceClient";

interface FolderPickerEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

interface BrowseResult {
  path: string;
  parent: string | null;
  home: string;
  separator: "/" | "\\";
  entries: FolderPickerEntry[];
}

const workspaceClient = createWorkspaceClient();

/** Shared browse state + navigation logic for the folder picker. */
function useFolderBrowse(initialPath: string | undefined) {
  const [draft, setDraft] = useState(initialPath ?? "");
  const [result, setResult] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const browse = useCallback(async (path: string | undefined) => {
    setLoading(true);
    setError(null);
    try {
      const res = (await workspaceClient.browseDirectory(path)) as unknown as BrowseResult;
      setResult(res);
      setDraft(res.path);
      setLoading(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to browse directory");
      setResult(null);
      setLoading(false);
    }
  }, []);

  return { draft, setDraft, result, loading, error, browse };
}

interface FolderPickerBodyProps {
  initialPath?: string;
  confirmLabel?: string;
  /** Max height of the directory listing (CSS value). */
  maxHeight?: string;
  onConfirm: (path: string) => void;
  onCancel: () => void;
  autoFocus?: boolean;
}

/** The inner picker UI (path input + nav + listing + confirm), container-agnostic. */
function FolderPickerBody({
  initialPath,
  confirmLabel = "Select",
  maxHeight = "14rem",
  onConfirm,
  onCancel,
  autoFocus,
}: FolderPickerBodyProps) {
  const { draft, setDraft, result, loading, error, browse } = useFolderBrowse(initialPath);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void browse(initialPath);
  }, [browse, initialPath]);

  useEffect(() => {
    if (!autoFocus) return;
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    return () => clearTimeout(t);
  }, [autoFocus]);

  const navigateInto = useCallback(
    (entry: FolderPickerEntry) => {
      if (entry.isDirectory) void browse(entry.path);
    },
    [browse],
  );
  const goParent = useCallback(() => {
    if (result?.parent) void browse(result.parent);
  }, [result, browse]);
  const goHome = useCallback(() => {
    void browse(result?.home || undefined);
  }, [result, browse]);
  const submitDraft = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed) void browse(trimmed);
  }, [draft, browse]);
  const confirm = useCallback(() => {
    onConfirm((draft || result?.path || "").trim());
  }, [draft, result, onConfirm]);

  return (
    <div className="flex flex-col gap-2">
      <form
        className="flex items-center gap-1"
        onSubmit={(e) => {
          e.preventDefault();
          submitDraft();
        }}
      >
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={result?.path || "/"}
          className="h-8 font-mono text-xs"
          spellCheck={false}
          autoComplete="off"
        />
        <Button type="submit" variant="secondary" size="sm" className="h-8 shrink-0" disabled={loading}>
          <Icon icon="lucide:arrow-right" className="h-4 w-4" />
        </Button>
      </form>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={goHome}
          disabled={!result || loading}
          title="Home"
        >
          <Icon icon="lucide:home" className="mr-1 h-3.5 w-3.5" /> Home
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={goParent}
          disabled={!result?.parent || loading}
          title="Parent directory"
        >
          <Icon icon="lucide:arrow-up" className="mr-1 h-3.5 w-3.5" /> Up
        </Button>
        {result && (
          <span className="ml-auto truncate px-1 font-mono text-[11px] text-muted-foreground" title={result.path}>
            {result.path}
          </span>
        )}
      </div>

      <ScrollArea className="rounded-md border" style={{ height: maxHeight }}>
        {error ? (
          <div className="p-3 text-xs text-destructive">{error}</div>
        ) : loading ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            <Icon icon="lucide:loader-circle" className="mr-2 h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !result || result.entries.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">No subdirectories.</div>
        ) : (
          <ul className="py-1">
            {result.entries.map((entry) => (
              <li key={entry.path}>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent"
                  onClick={() => navigateInto(entry)}
                  onDoubleClick={confirm}
                  title={entry.path}
                >
                  <Icon icon="lucide:folder" className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{entry.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" size="sm" onClick={confirm} disabled={!draft && !result}>
          <Icon icon="lucide:check" className="mr-1 h-4 w-4" /> {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

interface FolderPickerProps {
  /** Current path value (controlled). */
  value: string;
  /** Called with the selected absolute path when the user confirms. */
  onChange: (path: string) => void;
  placeholder?: string;
  confirmLabel?: string;
  startAtHome?: boolean;
  /** Max height of the directory listing (CSS value). */
  maxHeight?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * A filesystem folder picker for web/daemon mode (Popover variant). The host
 * filesystem is only visible to the daemon, so — like t3code's web app — this
 * navigates by typing a path and stepping through the subdirectories the daemon
 * lists (`workspace.browseDirectory`). See `FolderPickerDialog` for a modal
 * variant (e.g. the chat page "open folder" action).
 */
export default function FolderPicker({
  value,
  onChange,
  placeholder = "Select folder",
  confirmLabel = "Select",
  startAtHome = true,
  maxHeight = "14rem",
  className,
  disabled,
}: FolderPickerProps) {
  const [open, setOpen] = useState(false);
  const displayValue = useMemo(() => value || placeholder, [value, placeholder]);
  const initialPath = value?.trim() || (startAtHome ? undefined : undefined) || undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            role="combobox"
            className={`justify-start font-normal ${value ? "text-foreground" : "text-muted-foreground"} ${className ?? ""}`}
            disabled={disabled}
          />
        }
      >
        <Icon icon="lucide:folder" className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="truncate">{displayValue}</span>
      </PopoverTrigger>
      <PopoverContent className="w-[460px] p-2" align="start">
        <FolderPickerBody
          initialPath={initialPath}
          confirmLabel={confirmLabel}
          maxHeight={maxHeight}
          autoFocus
          onConfirm={(path) => {
            onChange(path);
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}

interface FolderPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the selected absolute path when the user confirms. */
  onSelect: (path: string) => void;
  initialPath?: string;
  title?: string;
  confirmLabel?: string;
  maxHeight?: string;
}

/** Modal variant of the folder picker — for actions like the chat page "open folder". */
export function FolderPickerDialog({
  open,
  onOpenChange,
  onSelect,
  initialPath,
  title = "Select folder",
  confirmLabel = "Select",
  maxHeight = "16rem",
}: FolderPickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <FolderPickerBody
          key={open ? "open" : "closed"}
          initialPath={initialPath}
          confirmLabel={confirmLabel}
          maxHeight={maxHeight}
          autoFocus
          onConfirm={(path) => {
            onSelect(path);
            onOpenChange(false);
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
