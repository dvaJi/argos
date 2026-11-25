import type { MCPToolDefinition } from "@argos/shared/types/core/mcp";
import zod from "zod";

export const PLAN_TOOL_NAME = "submit_plan";

export const planInputSchema = zod.object({
  objective: zod.string().min(1).max(4000),
  steps: zod.array(zod.string().min(1).max(2000)).min(1).max(40),
  files: zod.array(zod.string().max(1000)).max(100).default([]),
  risks: zod.array(zod.string().max(1000)).max(40).default([]),
  verification: zod.array(zod.string().max(1000)).max(40).default([]),
});

export type PlanInput = zod.infer<typeof planInputSchema>;

export const PLAN_TOOL_DEFINITION: MCPToolDefinition = {
  type: "function",
  source: "agent",
  function: {
    name: PLAN_TOOL_NAME,
    description:
      "Submit an implementation plan. In plan mode this is the only action allowed; the user must approve it before code is changed.",
    parameters: {
      type: "object",
      properties: {
        objective: { type: "string", description: "What the plan will achieve." },
        steps: {
          type: "array",
          items: { type: "string" },
          description: "Ordered implementation steps.",
        },
        files: {
          type: "array",
          items: { type: "string" },
          description: "Files likely to change.",
        },
        risks: {
          type: "array",
          items: { type: "string" },
          description: "Risks or unknowns.",
        },
        verification: {
          type: "array",
          items: { type: "string" },
          description: "How the result will be verified.",
        },
      },
      required: ["objective", "steps"],
    },
  },
  server: {
    name: "argos-plan",
    icons: "",
    description: "Argos plan mode",
  },
};

export function formatPlanForPrompt(plan: PlanInput): string {
  const lines = [`Objective: ${plan.objective}`, "", "Steps:"];
  plan.steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
  if (plan.files.length > 0) lines.push("", `Files: ${plan.files.join(", ")}`);
  if (plan.risks.length > 0) lines.push("", "Risks:", ...plan.risks.map((risk) => `- ${risk}`));
  if (plan.verification.length > 0) {
    lines.push("", "Verification:", ...plan.verification.map((item) => `- ${item}`));
  }
  return lines.join("\n");
}
