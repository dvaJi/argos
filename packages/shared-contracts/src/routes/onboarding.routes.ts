import zod from "zod";
import { defineRouteContract } from "../common";
import { GUIDED_ONBOARDING_STEP_IDS, GUIDED_ONBOARDING_VERSION } from "@argos/shared/guidedOnboarding";

export const guidedOnboardingVersion = GUIDED_ONBOARDING_VERSION;
export const guidedOnboardingStepIds = GUIDED_ONBOARDING_STEP_IDS;

export const guidedOnboardingStepIdSchema = zod.enum(guidedOnboardingStepIds);

export const guidedOnboardingStepStatusSchema = zod.enum(["pending", "in_progress", "completed", "skipped"]);

export const guidedOnboardingStatusSchema = zod.enum(["idle", "active", "completed"]);

export const guidedOnboardingStepStateSchema = zod.object({
  id: guidedOnboardingStepIdSchema,
  required: zod.boolean(),
  status: guidedOnboardingStepStatusSchema,
  startedAt: zod.number().int().nonnegative().nullable(),
  completedAt: zod.number().int().nonnegative().nullable(),
  skippedAt: zod.number().int().nonnegative().nullable(),
});

export const guidedOnboardingStateSchema = zod.object({
  version: zod.literal(guidedOnboardingVersion),
  status: guidedOnboardingStatusSchema,
  startedAt: zod.number().int().nonnegative().nullable(),
  completedAt: zod.number().int().nonnegative().nullable(),
  lastActiveAt: zod.number().int().nonnegative(),
  currentStepId: guidedOnboardingStepIdSchema.nullable(),
  steps: zod.array(guidedOnboardingStepStateSchema),
});

export const onboardingGetStateRoute = defineRouteContract({
  name: "onboarding.getState",
  input: zod.object({}),
  output: zod.object({
    state: guidedOnboardingStateSchema,
  }),
});

export const onboardingStartRoute = defineRouteContract({
  name: "onboarding.start",
  input: zod.object({
    force: zod.boolean().optional(),
    stepId: guidedOnboardingStepIdSchema.optional(),
  }),
  output: zod.object({
    state: guidedOnboardingStateSchema,
  }),
});

export const onboardingSetStepStatusRoute = defineRouteContract({
  name: "onboarding.setStepStatus",
  input: zod.object({
    stepId: guidedOnboardingStepIdSchema,
    status: zod.enum(["in_progress", "completed", "skipped"]),
  }),
  output: zod.object({
    state: guidedOnboardingStateSchema,
  }),
});

export const onboardingCompleteRoute = defineRouteContract({
  name: "onboarding.complete",
  input: zod.object({
    force: zod.boolean().optional(),
  }),
  output: zod.object({
    state: guidedOnboardingStateSchema,
  }),
});

export const onboardingResetRoute = defineRouteContract({
  name: "onboarding.reset",
  input: zod.object({}),
  output: zod.object({
    state: guidedOnboardingStateSchema,
  }),
});

export type GuidedOnboardingStepId = zod.infer<typeof guidedOnboardingStepIdSchema>;
export type GuidedOnboardingStepStatus = zod.infer<typeof guidedOnboardingStepStatusSchema>;
export type GuidedOnboardingStatus = zod.infer<typeof guidedOnboardingStatusSchema>;
export type GuidedOnboardingStepState = zod.infer<typeof guidedOnboardingStepStateSchema>;
export type GuidedOnboardingState = zod.infer<typeof guidedOnboardingStateSchema>;
