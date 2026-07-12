import { useState, useEffect, useRef, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "#shadcn/components/ui/dialog";
import { Button } from "#shadcn/components/ui/button";
import { Icon } from "@iconify/react";
import { useToast } from "#/components/use-toast";

interface ExternalDependency {
  name: string;
  description: string;
  platform?: string[];
  checkCommand?: string;
  checkPaths?: string[];
  installCommands?: { winget?: string; chocolatey?: string; scoop?: string };
  downloadUrl?: string;
  requiredFor?: string[];
}

interface AcpTerminalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose?: () => void;
  onDependenciesRequired?: (dependencies: ExternalDependency[]) => void;
}

export default function AcpTerminalDialog({
  open,
  onOpenChange,
  onClose,
  onDependenciesRequired,
}: AcpTerminalDialogProps) {
  const { toast } = useToast();
  const terminalContainerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [status, setStatus] = useState<"idle" | "running" | "completed" | "error">("idle");

  const statusColor = () => {
    switch (status) {
      case "running":
        return "bg-yellow-500 animate-pulse";
      case "completed":
        return "bg-green-500";
      case "error":
        return "bg-red-500";
      default:
        return "bg-zinc-500";
    }
  };

  const statusText = () => {
    switch (status) {
      case "running":
        return "Running";
      case "completed":
        return "Completed";
      case "error":
        return "Error";
      default:
        return "Idle";
    }
  };

  const ensureTerminal = useCallback(() => {
    if (!terminalContainerRef.current) return;
    if (terminalRef.current) return;

    const term = new Terminal({
      convertEol: true,
      fontSize: 13,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: { background: "#000000", foreground: "#ffffff", cursor: "#ffffff" },
      cursorBlink: true,
      cursorStyle: "block",
      allowProposedApi: true,
      scrollback: 5000,
    });

    term.open(terminalContainerRef.current);
    term.onData((data) => {
      window.electron?.ipcRenderer.send("acp-terminal:input", data);
    });
    terminalRef.current = term;
  }, []);

  const cleanupTerminal = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.dispose();
      terminalRef.current = null;
    }
  }, []);

  const handleOutput = useCallback((_event: unknown, data: string | { type: string; data: string }) => {
    const term = terminalRef.current;
    if (!term) return;

    let text: string;
    if (typeof data === "string") {
      text = data;
    } else if (data && typeof data === "object" && "data" in data) {
      text = data.data;
    } else return;

    if (!text || text.length === 0) return;

    try {
      const normalized = text.replace(/\r?\n/g, "\r\n");
      term.write(normalized);
    } catch {
      try {
        const normalized = text.replace(/\r?\n/g, "\r\n");
        for (let i = 0; i < normalized.length; i++) {
          term.write(normalized[i]);
        }
      } catch {}
    }
  }, []);

  const handleStart = useCallback(() => {
    setIsRunning(true);
    setStatus("running");
    terminalRef.current?.clear();
  }, []);

  const handleExit = useCallback((_event: unknown, data: { code: number | null; signal: string | null }) => {
    setIsRunning(false);
    setStatus(data.code === 0 ? "completed" : "error");
    if (terminalRef.current && data.code !== 0) {
      terminalRef.current.writeln(`\r\n\x1b[31mProcess exited with code ${data.code}\x1b[0m`);
    }
  }, []);

  const handleError = useCallback((_event: unknown, data: { message: string }) => {
    setStatus("error");
    terminalRef.current?.writeln(`\r\n\x1b[31mError: ${data.message}\x1b[0m`);
  }, []);

  const handleExternalDepsRequired = useCallback(
    (_event: unknown, data: { agentId: string; missingDeps: ExternalDependency[] }) => {
      if (!data.missingDeps?.length) return;
      onDependenciesRequired?.(data.missingDeps);
      onOpenChange(false);
      onClose?.();
    },
    [onDependenciesRequired, onOpenChange, onClose],
  );

  const setupIpcListeners = useCallback(() => {
    if (!window.electron) return;
    window.electron.ipcRenderer.on("acp-init:start", handleStart);
    window.electron.ipcRenderer.on("acp-init:output", handleOutput);
    window.electron.ipcRenderer.on("acp-init:exit", handleExit);
    window.electron.ipcRenderer.on("acp-init:error", handleError);
    window.electron.ipcRenderer.on("external-deps-required", handleExternalDepsRequired);
  }, [handleStart, handleOutput, handleExit, handleError, handleExternalDepsRequired]);

  const removeIpcListeners = useCallback(() => {
    if (!window.electron) return;
    window.electron.ipcRenderer.removeAllListeners("acp-init:start");
    window.electron.ipcRenderer.removeAllListeners("acp-init:output");
    window.electron.ipcRenderer.removeAllListeners("acp-init:exit");
    window.electron.ipcRenderer.removeAllListeners("acp-init:error");
    window.electron.ipcRenderer.removeAllListeners("external-deps-required");
  }, []);

  const handlePaste = async () => {
    try {
      if (!window.api || typeof window.api.readClipboardText !== "function") return;
      const text = window.api.readClipboardText();
      if (text && window.electron) {
        window.electron.ipcRenderer.send("acp-terminal:input", text);
      }
    } catch (error) {
      toast({ title: "Paste failed", description: String(error), variant: "destructive" });
    }
  };

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        ensureTerminal();
        setupIpcListeners();
        setStatus("idle");
        setIsRunning(false);
      }, 150);
    } else {
      if (isRunning && window.electron) {
        window.electron.ipcRenderer.send("acp-terminal:kill");
      }
      removeIpcListeners();
      cleanupTerminal();
    }
  }, [open]);

  useEffect(() => {
    return () => {
      removeIpcListeners();
      cleanupTerminal();
    };
  }, []);

  const handleOpenUpdate = (val: boolean) => {
    if (!val) {
      onOpenChange(false);
      onClose?.();
    } else {
      onOpenChange(val);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenUpdate}>
      <DialogContent
        className="sm:max-w-5xl h-[85vh] flex flex-col gap-0 p-2 overflow-hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Terminal</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-2 px-4 py-2 border-b shrink-0">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
            <div className={`w-1.5 h-1.5 rounded-full ${statusColor()}`} />
            {statusText()}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={!isRunning}
            onClick={handlePaste}
            title="Paste"
          >
            <Icon icon="lucide:clipboard" className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 relative w-full h-full bg-black p-0 overflow-hidden">
          <div
            ref={terminalContainerRef}
            className="h-full w-full [&_.xterm]:!h-full [&_.xterm]:!w-full [&_.xterm]:p-5 [&_.xterm]:box-border [&_.xterm-viewport]:!overflow-y-auto [&_.xterm-viewport]:scrollbar-thin [&_.xterm-viewport]:bg-black"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
