import type { FC } from "react";
import { Icon } from "@iconify/react";

type TabId = "servers" | "prompts" | "resources";

interface McpTabHeaderProps {
  activeTab: TabId;
  onActiveTabChange: (value: TabId) => void;
}

const tabs: Array<{ id: TabId; label: string; icon: string }> = [
  { id: "servers", label: "Servers", icon: "lucide:server" },
  { id: "prompts", label: "Prompts", icon: "lucide:message-square" },
  { id: "resources", label: "Resources", icon: "lucide:folder" },
];

export const McpTabHeader: FC<McpTabHeaderProps> = ({ activeTab, onActiveTabChange }) => {
  return (
    <div className="sticky top-0 z-10 backdrop-blur-sm border-b border-border/50">
      <div className="px-4 py-1">
        <nav className="flex items-center justify-center">
          <div className="flex items-center space-x-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={[
                  "group flex items-center px-1 py-1.5 text-xs font-medium transition-all duration-300 ease-out",
                  "hover:text-foreground",
                  activeTab === tab.id ? "text-foreground" : "text-muted-foreground/70 hover:text-muted-foreground",
                ].join(" ")}
                onClick={() => onActiveTabChange(tab.id)}
              >
                <Icon
                  icon={tab.icon}
                  className={[
                    "mr-2 h-3.5 w-3.5 transition-all duration-300",
                    activeTab === tab.id ? "text-primary" : "group-hover:text-foreground",
                  ].join(" ")}
                />
                <span className="relative">
                  {tab.label}
                  <div
                    className={[
                      "absolute -bottom-1.5 left-0 h-0.5 bg-primary transition-all duration-300 ease-out",
                      activeTab === tab.id
                        ? "w-full opacity-100"
                        : "w-0 opacity-0 group-hover:w-full group-hover:opacity-50",
                    ].join(" ")}
                  />
                </span>
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
};

export default McpTabHeader;
