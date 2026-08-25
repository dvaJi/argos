import type { GuidedOnboardingState, GuidedOnboardingStepId } from "@argos/shared-contracts/routes";
import { resolveGuidedOnboardingStepTarget } from "@argos/shared/guidedOnboarding";
import { createOnboardingClient } from "#api/OnboardingClient";
import { persistGuidedOnboardingResumeIntent } from "#/lib/onboardingResume";

const resolveGuidedOnboardingResumeStepId = (
  state: GuidedOnboardingState | null | undefined,
): GuidedOnboardingStepId | null => {
  if (state?.status === "active" && state.currentStepId) {
    return state.currentStepId;
  }

  if (state?.status === "completed") {
    return "first-chat";
  }

  return null;
};

export async function continueGuidedOnboardingFromSettings(options: {
  state: GuidedOnboardingState | null | undefined;
  router: {
    navigate: (opts: { to: string; params?: Record<string, string>; replace?: boolean }) => Promise<void>;
  };
  currentRoute?: {
    pathname?: string;
    params?: Record<string, unknown>;
  };
  windowClient: {
    focusMain?: () => Promise<boolean> | boolean;
  };
}) {
  const { router, currentRoute, windowClient } = options;
  let { state } = options;
  let stepId = resolveGuidedOnboardingResumeStepId(state);

  if (!stepId) {
    try {
      state = await createOnboardingClient().getState();
      stepId = resolveGuidedOnboardingResumeStepId(state);
    } catch (error) {
      console.warn("[GuidedOnboarding] Failed to refresh state from backend:", error);
    }
  }

  const target = resolveGuidedOnboardingStepTarget(stepId);

  if (target?.surface === "settings" && target.routeName) {
    const providerId = currentRoute?.params?.providerId;

    const params =
      target.routeName === "settings-provider" && typeof providerId === "string" ? { providerId } : undefined;

    await router.navigate({
      to: `/settings/${target.routeName}`,
      params,
    });
    return;
  }

  if (stepId) {
    persistGuidedOnboardingResumeIntent({
      stepId,
      trigger: "window-focus",
    });
  }

  await windowClient.focusMain?.();
}
