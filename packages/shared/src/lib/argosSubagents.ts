import { ArgosAgentConfig, ArgosSubagentSlot } from "../types/agent-interface";

export const ARGOS_SUBAGENT_SLOT_LIMIT = 5;
export const ARGOS_SELF_SUBAGENT_SLOT_ID = "self";
export const ARGOS_EXPLORER_SUBAGENT_SLOT_ID = "explorer";
export const ARGOS_IMPLEMENTER_SUBAGENT_SLOT_ID = "implementer";
export const ARGOS_REVIEWER_SUBAGENT_SLOT_ID = "reviewer";

export const createDefaultArgosSelfSubagentSlot = (): ArgosSubagentSlot => ({
  id: ARGOS_SELF_SUBAGENT_SLOT_ID,
  targetType: "self",
  displayName: "Self Clone",
  description: "Inherit the current parent session agent logic with an isolated context.",
});

export const createDefaultArgosSubagentSlots = (): ArgosSubagentSlot[] => [
  {
    id: ARGOS_EXPLORER_SUBAGENT_SLOT_ID,
    targetType: "self",
    displayName: "Explorer",
    description: "Investigate code, requirements, or evidence in an isolated context.",
  },
  {
    id: ARGOS_IMPLEMENTER_SUBAGENT_SLOT_ID,
    targetType: "self",
    displayName: "Implementer",
    description: "Implement a bounded code or content change in an isolated context.",
  },
  {
    id: ARGOS_REVIEWER_SUBAGENT_SLOT_ID,
    targetType: "self",
    displayName: "Reviewer",
    description: "Review changes, risks, and verification gaps in an isolated context.",
  },
];

const normalizeDisplayName = (value: string | undefined, fallback: string): string => {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
};

const normalizeDescription = (value: string | undefined, fallback: string): string => {
  const normalized = value?.trim();
  return normalized ? normalized : fallback;
};

export const normalizeArgosSubagentSlots = (slots?: ArgosSubagentSlot[] | null): ArgosSubagentSlot[] => {
  const normalized: ArgosSubagentSlot[] = [];
  const seenIds = new Set<string>();

  const pushSlot = (slot: ArgosSubagentSlot) => {
    if (normalized.length >= ARGOS_SUBAGENT_SLOT_LIMIT) {
      return;
    }

    const normalizedId = slot.id.trim();
    if (!normalizedId || seenIds.has(normalizedId)) {
      return;
    }

    seenIds.add(normalizedId);
    normalized.push(slot);
  };

  for (const slot of Array.isArray(slots) ? slots : []) {
    if (!slot || typeof slot !== "object") {
      continue;
    }

    const id = typeof slot.id === "string" ? slot.id.trim() : "";
    if (!id) {
      continue;
    }

    if (slot.targetType === "self") {
      pushSlot({
        id,
        targetType: "self",
        displayName: normalizeDisplayName(
          typeof slot.displayName === "string" ? slot.displayName : undefined,
          "Self Clone",
        ),
        description: normalizeDescription(typeof slot.description === "string" ? slot.description : undefined, ""),
      });
      continue;
    }

    if (slot.targetType !== "agent") {
      continue;
    }

    const targetAgentId = typeof slot.targetAgentId === "string" ? slot.targetAgentId.trim() : "";
    if (!targetAgentId) {
      continue;
    }

    pushSlot({
      id,
      targetType: "agent",
      targetAgentId,
      displayName: normalizeDisplayName(
        typeof slot.displayName === "string" ? slot.displayName : undefined,
        targetAgentId,
      ),
      description: normalizeDescription(typeof slot.description === "string" ? slot.description : undefined, ""),
    });
  }

  return normalized;
};

export const normalizeArgosSubagentConfig = (config?: ArgosAgentConfig | null): ArgosAgentConfig => {
  const hasConfiguredSlots = config?.subagents !== undefined && config.subagents !== null;

  return {
    ...config,
    subagentEnabled: config?.subagentEnabled !== false,
    subagents: hasConfiguredSlots ? normalizeArgosSubagentSlots(config?.subagents) : createDefaultArgosSubagentSlots(),
  };
};
