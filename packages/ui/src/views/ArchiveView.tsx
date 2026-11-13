import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Icon } from "@iconify/react";
import { createSessionClient } from "#api/SessionClient";
import { Button } from "#shadcn/components/ui/button";
import { Input } from "#shadcn/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#shadcn/components/ui/dialog";
import { useAgentStore } from "#/stores/ui/agent";
import { deleteSession, mapToUISession, selectSession, unarchiveSession, type UISession } from "#/stores/ui/session";
import { notifySessionDeleted } from "#/stores/ui/threadSidebar";
import AgentAvatar from "#/components/icons/AgentAvatar";
import DeleteConversationDialog from "#/components/DeleteConversationDialog";
import {
  filterByTitle,
  formatAge,
  highlightSegments,
  isSidebarVisibleSession,
} from "#/components/threads/threadSidebarLogic";

const sessionClient = createSessionClient();

/** The full list (not a page): search and "Delete all" must cover every archived thread. */
async function loadArchivedSessions(): Promise<UISession[]> {
  const { sessions } = await sessionClient.list({});
  return sessions
    .map(mapToUISession)
    .filter((session) => Boolean(session.archivedAt) && isSidebarVisibleSession(session))
    .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0));
}

/**
 * Archived threads (docs/features/thread-archive): newest-archived first,
 * searchable. Restore returns a thread to the sidebar's Active inbox; clicking
 * a row restores and opens it.
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ Archived threads (42)           [Delete all] │
 *   │ [🔎 Search archived threads              ]   │
 *   │ [◎] Fix login redirect   archived 3d  ↺  🗑  │
 *   └──────────────────────────────────────────────┘
 */
export default function ArchiveView() {
  const { enabledAgents } = useAgentStore();
  const navigate = useNavigate();
  // While a batch action runs, its own per-item session events are ignored;
  // the list reloads once when the batch ends.
  const batchRunningRef = useRef(false);
  const [archived, setArchived] = useState<UISession[] | null>(null);
  const [query, setQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<UISession | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now] = useState(() => Date.now());

  const loadInto = useCallback((isCancelled: () => boolean = () => false) => {
    loadArchivedSessions().then(
      (sessions) => {
        if (!isCancelled()) setArchived(sessions);
      },
      (loadError: unknown) => {
        if (isCancelled()) return;
        setError(`Failed to load archived threads: ${String(loadError)}`);
        setArchived([]);
      },
    );
  }, []);

  // Load once, then refetch on session events (archive/restore/delete from any window).
  useEffect(() => {
    let cancelled = false;
    const isCancelled = () => cancelled;
    loadInto(isCancelled);
    const unsubscribe = sessionClient.onUpdated(() => {
      if (!batchRunningRef.current) loadInto(isCancelled);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [loadInto]);

  const visible = useMemo(() => filterByTitle(archived ?? [], query), [archived, query]);

  const run = async (action: () => Promise<void>, failure: string) => {
    setBusy(true);
    setError(null);
    batchRunningRef.current = true;
    try {
      await action();
    } catch {
      setError(failure);
    }
    batchRunningRef.current = false;
    setBusy(false);
    loadInto();
  };

  const restore = (session: UISession) =>
    run(() => unarchiveSession(session.id), `Failed to restore "${session.title || "Untitled session"}".`);
  const open = (session: UISession) =>
    run(
      async () => {
        await unarchiveSession(session.id);
        await selectSession(session.id);
        // selectSession only updates the in-app page store; leave /archive explicitly.
        await navigate({ to: "/chat" });
      },
      `Failed to open "${session.title || "Untitled session"}".`,
    );
  const remove = async (session: UISession) => {
    await deleteSession(session.id);
    notifySessionDeleted(session.id);
  };
  const removeAll = () =>
    run(async () => {
      for (const session of archived ?? []) await remove(session);
    }, "Failed to delete some archived threads.");

  return (
    <div data-testid="archive-view" className="mx-auto flex h-full w-full max-w-3xl flex-col gap-4 overflow-hidden p-6">
      <div className="flex items-center gap-3">
        <Icon icon="lucide:archive" className="size-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Archived threads</h1>
        {archived && <span className="text-sm tabular-nums text-muted-foreground">{archived.length}</span>}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto text-red-600 dark:text-red-400"
          disabled={busy || !archived || archived.length === 0}
          onClick={() => setConfirmDeleteAll(true)}
          data-testid="archive-delete-all"
        >
          Delete all
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Archived threads are hidden from the sidebar. Restore one to move it back to Active, or open it to restore and
        continue the conversation.
      </p>

      <div className="relative">
        <Icon
          icon="lucide:search"
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70"
        />
        <Input
          data-testid="archive-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search archived threads"
          aria-label="Search archived threads"
          className="h-8 pl-8 text-xs"
        />
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {archived === null ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Loading…</p>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-12 text-center">
            <Icon icon={query ? "lucide:search-x" : "lucide:archive"} className="size-5 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground/70">
              {query ? `No archived threads match "${query.trim()}"` : "No archived threads"}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-px">
            {visible.map((session) => {
              const agent = enabledAgents.find((candidate) => candidate.id === session.agentId) ?? null;
              return (
                <li key={session.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    data-testid="archive-row"
                    onClick={() => void open(session)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        void open(session);
                      }
                    }}
                    className="group flex h-9 items-center gap-2 rounded-md px-2 text-[13px] outline-none transition-colors hover:bg-accent/40 focus-visible:ring-1 focus-visible:ring-primary/40"
                  >
                    {agent ? (
                      <AgentAvatar agent={agent} className="size-3.5 shrink-0" />
                    ) : (
                      <Icon icon="lucide:message-square" className="size-3.5 shrink-0 text-muted-foreground/60" />
                    )}
                    <span className="min-w-0 flex-1 truncate">
                      {highlightSegments(session.title || "Untitled session", query).map((segment, index) =>
                        segment.match ? (
                          <mark key={index} className="rounded-sm bg-primary/20 px-0.5 text-foreground">
                            {segment.text}
                          </mark>
                        ) : (
                          <span key={index}>{segment.text}</span>
                        ),
                      )}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground/60">
                      archived {formatAge(session.archivedAt ?? now, now)}
                    </span>
                    <button
                      type="button"
                      title="Restore"
                      aria-label="Restore thread"
                      disabled={busy}
                      onClick={(event) => {
                        event.stopPropagation();
                        void restore(session);
                      }}
                      className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                    >
                      <Icon icon="lucide:archive-restore" className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Delete"
                      aria-label="Delete thread"
                      disabled={busy}
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteTarget(session);
                      }}
                      className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                    >
                      <Icon icon="lucide:trash-2" className="size-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <DeleteConversationDialog
        open={deleteTarget !== null}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (target) void run(() => remove(target), `Failed to delete "${target.title || "Untitled session"}".`);
        }}
      />

      <Dialog open={confirmDeleteAll} onOpenChange={setConfirmDeleteAll}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete all archived threads?</DialogTitle>
            <DialogDescription>
              This permanently deletes {archived?.length ?? 0} archived thread
              {archived?.length === 1 ? "" : "s"} and their conversation history. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteAll(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmDeleteAll(false);
                void removeAll();
              }}
            >
              Delete all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
