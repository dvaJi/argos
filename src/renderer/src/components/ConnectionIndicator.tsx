import { useState, useEffect } from "react";
import { Icon } from "@iconify/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@shadcn/components/ui/tooltip";

type ConnectionMode = "local" | "remote";
type ConnectionStatus = "connected" | "connecting" | "disconnected" | "error";

const STORAGE_KEY = "argos-server-config";

function getServerConfig(): { mode: ConnectionMode; remoteUrl: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { mode: "local", remoteUrl: "" };
}

export default function ConnectionIndicator() {
  const [mode, setMode] = useState<ConnectionMode>("local");
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");

  useEffect(() => {
    const config = getServerConfig();
    setMode(config.mode);

    if (config.mode === "local") {
      setStatus("connected");
      return;
    }

    async function checkRemote() {
      if (!config.remoteUrl) {
        setStatus("disconnected");
        return;
      }

      setStatus("connecting");
      try {
        const url = config.remoteUrl.replace(/\/$/, "");
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${url}/health`, { signal: controller.signal });
        clearTimeout(timeout);

        if (res.ok) {
          const body = await res.json();
          setStatus(body.status === "ok" ? "connected" : "error");
        } else {
          setStatus("error");
        }
      } catch {
        setStatus("error");
      }
    }

    checkRemote();
    const interval = setInterval(checkRemote, 30000);
    return () => clearInterval(interval);
  }, []);

  const statusConfig = {
    connected: { color: "bg-green-500", icon: "lucide:wifi", label: "Connected" },
    connecting: { color: "bg-yellow-500", icon: "lucide:wifi-off", label: "Connecting..." },
    disconnected: { color: "bg-gray-400", icon: "lucide:wifi-off", label: "Disconnected" },
    error: { color: "bg-red-500", icon: "lucide:wifi-off", label: "Connection error" },
  };

  const config = statusConfig[status];
  const label = mode === "local" ? "Local daemon" : `Remote: ${config.label}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center justify-center w-9 h-9 cursor-default">
          <span className={`w-2.5 h-2.5 rounded-full ${config.color}`} />
        </div>
      </TooltipTrigger>
      <TooltipContent side="right">
        <div className="flex items-center gap-2">
          <Icon icon={config.icon} className="w-3.5 h-3.5" />
          <span>{label}</span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
