import type { AcpConfigOption } from "@argos/shared/presenter";

/**
 * What an ACP config option controls. Drives both chip order in the composer
 * (model → reasoning → permission/mode → collaboration → other) and the chip
 * icon. Matches on the ACP `category` first (`model`, `thought_level`,
 * `mode`), then on id / label for agents using custom categories.
 */
export type AcpOptionKind = "model" | "reasoning" | "mode" | "collaboration" | "other";

const KIND_ORDER: AcpOptionKind[] = ["model", "reasoning", "mode", "collaboration", "other"];

const KIND_ICONS: Record<AcpOptionKind, string> = {
  model: "lucide:box",
  reasoning: "lucide:brain",
  mode: "lucide:shield",
  collaboration: "lucide:users",
  other: "lucide:sliders-horizontal",
};

export const getAcpOptionKind = (option: Pick<AcpConfigOption, "id" | "label" | "category">): AcpOptionKind => {
  const text = `${option.category ?? ""} ${option.id} ${option.label}`.toLowerCase().replace(/[_-]+/g, " ");
  if (option.category === "model" || /\bmodels?\b/.test(text)) return "model";
  if (option.category === "thought_level" || /reason|effort|thought|thinking/.test(text)) return "reasoning";
  // Before "mode": "collaboration mode" also contains "mode".
  if (/collab/.test(text)) return "collaboration";
  if (option.category === "mode" || /permission|approval|access|sandbox|\bmode\b/.test(text)) return "mode";
  return "other";
};

export const getAcpOptionIcon = (option: Pick<AcpConfigOption, "id" | "label" | "category">): string =>
  KIND_ICONS[getAcpOptionKind(option)];

/** Stable sort by kind; the agent's order is kept within a kind. */
export const sortAcpOptions = <T extends Pick<AcpConfigOption, "id" | "label" | "category">>(options: T[]): T[] =>
  options
    .map((option, index) => ({ option, index, rank: KIND_ORDER.indexOf(getAcpOptionKind(option)) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ option }) => option);
