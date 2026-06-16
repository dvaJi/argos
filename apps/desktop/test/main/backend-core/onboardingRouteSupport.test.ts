import { describe, it, expect, vi } from "vitest";
import {
  readGuidedOnboardingState,
  startGuidedOnboarding,
  setGuidedOnboardingStepStatus,
  completeGuidedOnboarding,
  resetGuidedOnboarding,
} from "@argos/backend-core/dispatch/onboarding/onboardingRouteSupport";

function createMockConfigPresenter() {
  const store: Record<string, unknown> = {};
  return {
    getSetting: vi.fn<(...args: any[]) => any>((key: string) => store[key]),
    setSetting: vi.fn<(...args: any[]) => any>((key: string, value: unknown) => {
      store[key] = value;
    }),
  };
}

describe("Onboarding route support", () => {
  it("reads default state when no stored state", () => {
    const config = createMockConfigPresenter();
    const state = readGuidedOnboardingState(config);
    expect(state.status).toBe("idle");
    expect(state.steps).toBeDefined();
    expect(state.steps.length).toBeGreaterThan(0);
  });

  it("starts onboarding", () => {
    const config = createMockConfigPresenter();
    const state = startGuidedOnboarding(config);
    expect(state.status).toBe("active");
    expect(state.currentStepId).toBeDefined();
  });

  it("sets step status", () => {
    const config = createMockConfigPresenter();
    startGuidedOnboarding(config);
    const state = setGuidedOnboardingStepStatus(config, {
      stepId: "select-provider",
      status: "completed",
    });
    expect(state.steps.find((s) => s.id === "select-provider")?.status).toBe("completed");
  });

  it("resets onboarding", () => {
    const config = createMockConfigPresenter();
    startGuidedOnboarding(config);
    const state = resetGuidedOnboarding(config);
    expect(state.status).toBe("idle");
  });

  it("cannot skip required steps", () => {
    const config = createMockConfigPresenter();
    startGuidedOnboarding(config);
    expect(() =>
      setGuidedOnboardingStepStatus(config, {
        stepId: "select-provider",
        status: "skipped",
      }),
    ).toThrow("Cannot skip required onboarding step");
  });

  it("persists state via config presenter", () => {
    const config = createMockConfigPresenter();
    startGuidedOnboarding(config);
    expect(config.setSetting).toHaveBeenCalled();
  });
});
