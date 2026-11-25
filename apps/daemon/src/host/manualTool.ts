import type { MCPToolDefinition } from "@argos/shared/types/core/mcp";
import zod from "zod";

export const MANUAL_TOOL_NAME = "manual_search";

export const manualSearchInputSchema = zod.object({
  query: zod.string().min(1).max(500),
  limit: zod.number().int().min(1).max(10).default(5),
});

export const MANUAL_TOOL_DEFINITION: MCPToolDefinition = {
  type: "function",
  source: "agent",
  function: {
    name: MANUAL_TOOL_NAME,
    description:
      "Search Argos documentation (docs/**) for capabilities, routes, commands, and configuration. Use before answering questions about what Argos can do.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What to look up." },
        limit: { type: "number", description: "Maximum number of sections (1-10, default 5)." },
      },
      required: ["query"],
    },
  },
  server: {
    name: "argos-manual",
    icons: "",
    description: "Argos documentation search",
  },
};

export interface ManualSection {
  path: string;
  heading: string;
  body: string;
}

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "how",
  "what",
  "where",
  "when",
  "why",
  "does",
  "do",
  "can",
  "are",
  "is",
  "i",
  "my",
  "me",
  "we",
  "you",
  "a",
  "an",
  "of",
  "to",
  "in",
  "on",
]);

export function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9_-]+/)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

export function rankSections(sections: ManualSection[], query: string, limit: number): ManualSection[] {
  const terms = tokenize(query);
  if (terms.length === 0) return [];
  return sections
    .map((section) => {
      const heading = section.heading.toLowerCase();
      const body = section.body.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (heading.includes(term)) score += 8;
        const occurrences = body.split(term).length - 1;
        score += Math.min(occurrences, 12) * 2;
      }
      return { section, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((entry) => entry.section);
}
