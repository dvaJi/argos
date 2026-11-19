import { type FC, useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { createSessionClient } from "#api/SessionClient";
import { fetchSessions, selectSession } from "#/stores/ui/session";

const sessionClient = createSessionClient();

type CursorView = {
  cursorId: string;
  forkable: boolean;
  anchorType: string;
  anchorId?: string;
  position?: string;
};

const describeCursor = (cursor: CursorView): string => {
  const anchorLabels: Record<string, string> = {
    user_message: "user message",
    agent_message: "agent message",
    agent_thought: "agent thought",
    session_message: "session message",
    tool_call: "tool call",
    compaction: "compaction",
  };
  const anchor = anchorLabels[cursor.anchorType] ?? cursor.anchorType.replace(/_/g, " ");
  const position = cursor.position && cursor.position !== "at" ? `${cursor.position} ` : "";
  const suffix = cursor.anchorId ? ` (${cursor.anchorId.slice(0, 8)}…)` : "";
  return `Fork ${position}${anchor}${suffix}`;
};

/**
 * Fork affordance for ACP sessions: lists the forkable session cursors the
 * agent announced (`cursor_update`) and forks the agent-side session via
 * `session/fork`. Hidden when the agent announced no forkable cursors.
 */
const AcpCursorForkMenu: FC<{ sessionId: string }> = ({ sessionId }) => {
  const [cursors, setCursors] = useState<CursorView[]>([]);
  const [open, setOpen] = useState(false);
  const [forking, setForking] = useState(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    sessionClient
      .getAcpCursors(sessionId)
      .then((list) => {
        if (mountedRef.current) setCursors(list.filter((cursor) => cursor.forkable));
      })
      .catch(() => {});
    return () => {
      mountedRef.current = false;
    };
  }, [sessionId]);

  if (cursors.length === 0) return null;

  const onFork = async (cursorId?: string) => {
    setForking(true);
    try {
      const forked = await sessionClient.forkAcpCursor(sessionId, cursorId);
      setOpen(false);
      await fetchSessions();
      await selectSession(forked.id);
    } catch (error) {
      console.error("[AcpCursorForkMenu] fork failed:", error);
    }
    setForking(false);
  };

  return (
    <div className="relative mb-2 self-start" data-testid="acp-cursor-fork-menu">
      <Button
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-[11px] text-muted-foreground"
        onClick={() => setOpen((prev) => !prev)}
      >
        <Icon icon="lucide:git-fork" className="h-3.5 w-3.5" />
        Fork session
        <Icon icon={open ? "lucide:chevron-up" : "lucide:chevron-down"} className="h-3 w-3" />
      </Button>
      {open && (
        <div className="absolute bottom-full left-0 z-30 mb-1 w-72 overflow-hidden rounded-lg border bg-popover p-1 shadow-md">
          {cursors.map((cursor) => (
            <button
              key={cursor.cursorId}
              type="button"
              disabled={forking}
              className="w-full truncate rounded px-2.5 py-1.5 text-left text-xs hover:bg-muted disabled:opacity-50"
              onClick={() => void onFork(cursor.cursorId)}
            >
              {describeCursor(cursor)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
export default AcpCursorForkMenu;
