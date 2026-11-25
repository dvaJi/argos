import { useEffect, useState } from "react";
import { useToast } from "#/components/use-toast";
import { createSessionClient } from "#api/SessionClient";
import { createChatClient } from "#api/ChatClient";
import { loadMessages } from "#/stores/ui/message";

const sessionClient = createSessionClient();
const chatClient = createChatClient();

type UndoState = Awaited<ReturnType<ReturnType<typeof createSessionClient>["getUndoState"]>>;

/**
 * Turn undo for the message toolbar. Only the latest completed turn can be
 * undone: undo restores the files that turn changed and removes it and every
 * later message, so undoing an older turn would leave later turns' file changes
 * behind. Redo is offered on the "Turn undone" toast.
 */
export function useTurnUndo({
  sessionId,
  isGenerating,
  onRestoreInput,
}: {
  sessionId: string;
  isGenerating: boolean;
  onRestoreInput: (text: string) => void;
}) {
  const { toast } = useToast();
  const [state, setState] = useState<{ sessionId: string; value: UndoState | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      setState({ sessionId, value: await sessionClient.getUndoState(sessionId) });
    } catch {
      setState({ sessionId, value: null });
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void sessionClient
        .getUndoState(sessionId)
        .then((value) => {
          if (!cancelled) setState({ sessionId, value });
        })
        .catch(() => {
          if (!cancelled) setState({ sessionId, value: null });
        });
    };
    load();
    const off = chatClient.onStreamCompleted((payload) => {
      if (payload.sessionId === sessionId) load();
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [sessionId]);

  const current = state?.sessionId === sessionId ? state.value : null;
  const undoMessageId = !isGenerating && !busy && current?.available ? current.userMessageId : null;

  const redo = async (userMessageId: string) => {
    setBusy(true);
    try {
      await sessionClient.redo(sessionId, userMessageId);
      onRestoreInput("");
      await loadMessages(sessionId).catch(() => null);
      toast({ title: "Turn restored" });
      await refresh();
    } catch (error) {
      toast({
        title: "Could not redo",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
    setBusy(false);
  };

  const undo = async (userMessageId: string) => {
    setBusy(true);
    try {
      const result = await sessionClient.undo(sessionId, userMessageId);
      onRestoreInput(result.inputText);
      await loadMessages(sessionId).catch(() => null);
      const files = result.restored.length + result.deleted.length;
      toast({
        title: "Turn undone",
        description:
          files > 0
            ? `${files} ${files === 1 ? "file" : "files"} reverted${
                result.skipped.length ? `, ${result.skipped.length} skipped` : ""
              }. Your message is back in the composer.`
            : "Your message is back in the composer.",
        duration: 10_000,
        action: { label: "Redo", onClick: () => void redo(result.userMessageId) },
      });
      await refresh();
    } catch (error) {
      toast({
        title: "Could not undo",
        description: error instanceof Error ? error.message : String(error),
        variant: "destructive",
      });
    }
    setBusy(false);
  };

  return { undoMessageId, undo };
}
