const PROVIDER_COLORS: Record<string, string> = {
  codex: "#a1a1aa",
  "claude-code": "#d97757",
  opencode: "#60a5fa",
  gemini: "#8b5cf6",
  argos: "#34d399",
  pi: "#34d399",
};

const HARNESS_LABELS: Record<string, string> = {
  codex: "Codex",
  "claude-code": "Claude Code",
  opencode: "OpenCode",
  gemini: "Gemini",
  argos: "Argos agent",
  pi: "Argos agent",
};

export function providerColor(providerId: string): string {
  return PROVIDER_COLORS[providerId] ?? "var(--chart-1)";
}

export function harnessLabel(providerId: string): string {
  return HARNESS_LABELS[providerId] ?? providerId;
}

export const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const compactTokens = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatTokens(value: number): string {
  return compactTokens.format(value);
}

export function formatPercent(share: number): string {
  return `${(share * 100).toFixed(share > 0 && share < 0.01 ? 1 : 0)}%`;
}
