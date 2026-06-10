import { useMemo } from "react";
import { Icon } from "@iconify/react";
import { useStore } from "@tanstack/react-store";
import { themeStore } from "@/stores/theme";
import type { UIAgent } from "@/stores/ui/agent";
import AcpAgentIcon from "./AcpAgentIcon";
import deepchatLogo from "@/assets/logo.png";

interface AgentAvatarProps {
  agent: Pick<UIAgent, "id" | "name" | "type" | "icon" | "avatar">;
  className?: string;
  fallbackClassName?: string;
  theme?: "dark" | "light";
}

export default function AgentAvatar({
  agent,
  className = "h-4 w-4",
  fallbackClassName = "rounded-md",
  theme,
}: AgentAvatarProps) {
  const isDark = useStore(themeStore, (s) => s.isDark);

  const isDarkTheme = theme ? theme === "dark" : isDark;

  const initials = useMemo(() => {
    const name = agent.name.trim();
    if (!name) return "?";
    const latin = name.match(/[A-Za-z]/g);
    if (latin && latin.length > 0) {
      return latin.slice(0, 2).join("").toUpperCase();
    }
    return name.slice(0, 1);
  }, [agent.name]);

  const monogramBackground = agent.avatar?.kind === "monogram" ? agent.avatar.backgroundColor : undefined;

  const lucideColor = useMemo(() => {
    if (agent.avatar?.kind !== "lucide") return undefined;
    return isDarkTheme ? agent.avatar.darkColor : agent.avatar.lightColor;
  }, [agent.avatar, isDarkTheme]);

  const showBuiltinDeepChatLogo = agent.id === "deepchat" && agent.type === "deepchat" && !agent.avatar && !agent.icon;

  const showAcpIcon = agent.type === "acp" && Boolean(agent.icon?.trim());

  const showImageIcon =
    Boolean(agent.icon?.trim()) && !showBuiltinDeepChatLogo && !showAcpIcon && agent.avatar?.kind !== "lucide";

  if (showAcpIcon) {
    return (
      <AcpAgentIcon
        agentId={agent.id}
        icon={agent.icon}
        alt={agent.name}
        fallbackText={agent.name}
        customClass={className}
      />
    );
  }

  if (showBuiltinDeepChatLogo || showImageIcon) {
    return (
      <img
        src={showBuiltinDeepChatLogo ? deepchatLogo : agent.icon}
        alt={agent.name}
        className={`object-contain ${className}`}
      />
    );
  }

  if (agent.avatar?.kind === "lucide") {
    return (
      <span
        className={`inline-flex items-center justify-center text-foreground ${className} ${fallbackClassName}`}
        style={lucideColor ? { color: lucideColor } : undefined}
      >
        <Icon icon={`lucide:${agent.avatar.icon}`} className="h-full w-full" />
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center bg-muted/70 text-[0.72em] font-semibold text-foreground ${className} ${fallbackClassName}`}
      style={monogramBackground ? { backgroundColor: monogramBackground } : undefined}
    >
      {agent.avatar?.kind === "monogram" ? agent.avatar.text : initials}
    </span>
  );
}
