import { useState, useEffect, useMemo, useRef } from "react";
import { mcpStore, getVisibleTools, getPluginTools, getVisibleResources, getVisiblePrompts } from "@/stores/mcp";
import { sessionStore, getActiveSession } from "@/stores/ui/session";
import { createConfigClient } from "@api/ConfigClient";
import { useStore } from "@tanstack/react-store";

const CUSTOM_PROMPTS_CLIENT = "deepchat/custom-prompts-server";

export function useAgentMcpData() {
  const configClient = createConfigClient();
  const [activeSelections, setActiveSelections] = useState<string[] | null>(null);
  const requestSeqRef = useRef(0);

  const activeSession = useStore(sessionStore, getActiveSession);
  const mcpTools = useStore(mcpStore, (s) => s.tools);
  const mcpResources = useStore(mcpStore, (s) => s.resources);
  const mcpPrompts = useStore(mcpStore, (s) => s.prompts);

  const isAcpMode = activeSession?.providerId === "acp";
  const activeAcpAgentId = isAcpMode ? (activeSession?.modelId?.trim() ?? "") : "";

  useEffect(() => {
    const seq = ++requestSeqRef.current;
    if (!isAcpMode || !activeAcpAgentId) {
      setActiveSelections(null);
      return;
    }

    let cancelled = false;
    configClient
      .getAgentMcpSelections(activeAcpAgentId)
      .then((selections) => {
        if (cancelled || seq !== requestSeqRef.current) return;
        setActiveSelections(Array.isArray(selections) ? selections : []);
      })
      .catch((error) => {
        if (cancelled || seq !== requestSeqRef.current) return;
        console.warn("[useAgentMcpData] Failed to load ACP agent MCP selections:", error);
        setActiveSelections([]);
      });

    return () => {
      cancelled = true;
    };
  }, [isAcpMode, activeAcpAgentId]);

  const selectionSet = useMemo(() => {
    if (!isAcpMode || !activeSelections?.length) return null;
    return new Set(activeSelections);
  }, [isAcpMode, activeSelections]);

  const visibleTools = useMemo(() => getVisibleTools(), [mcpTools]);
  const pluginTools = useMemo(() => getPluginTools(), [mcpTools]);
  const visibleResources = useMemo(() => getVisibleResources(), [mcpResources]);
  const visiblePrompts = useMemo(() => getVisiblePrompts(), [mcpPrompts]);

  const tools = useMemo(() => {
    if (!isAcpMode) return [...visibleTools, ...pluginTools];
    if (!selectionSet) return [];
    return visibleTools.filter((tool) => selectionSet.has(tool.server.name));
  }, [isAcpMode, selectionSet, visibleTools, pluginTools]);

  const resources = useMemo(() => {
    if (!isAcpMode) return visibleResources;
    if (!selectionSet) return [];
    return visibleResources.filter((resource) => selectionSet.has(resource.client.name));
  }, [isAcpMode, selectionSet, visibleResources]);

  const prompts = useMemo(() => {
    if (!isAcpMode) return visiblePrompts;
    if (!selectionSet) return visiblePrompts.filter((prompt) => prompt.client?.name === CUSTOM_PROMPTS_CLIENT);
    return visiblePrompts.filter(
      (prompt) => prompt.client?.name === CUSTOM_PROMPTS_CLIENT || selectionSet.has(prompt.client?.name),
    );
  }, [isAcpMode, selectionSet, visiblePrompts]);

  return {
    tools,
    resources,
    prompts,
    selectionSet,
  };
}
