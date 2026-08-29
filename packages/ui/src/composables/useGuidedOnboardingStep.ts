import { useState, useEffect, useRef } from "react";
import { createOnboardingClient } from "#api/OnboardingClient";
import { GUIDED_ONBOARDING_RESUME_REQUESTED_EVENT, requestGuidedOnboardingResume } from "#/lib/onboardingResume";
import { getNextGuidedOnboardingStepId, getPreviousGuidedOnboardingStepId } from "@argos/shared/guidedOnboarding";
import type {
  GuidedOnboardingState,
  GuidedOnboardingStepId,
  GuidedOnboardingStepStatus,
} from "@argos/shared-contracts/routes";
const onboardingClient = createOnboardingClient();
export function useGuidedOnboardingStep(stepId: GuidedOnboardingStepId) {
  const [onboardingState, setOnboardingState] = useState<GuidedOnboardingState | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const stepState = onboardingState?.steps.find((step) => step.id === stepId) ?? null;
  const currentStepId = (() => {
    if (onboardingState?.currentStepId) {
      return onboardingState.currentStepId;
    }
    return onboardingState?.steps.find((step) => step.status === "pending")?.id ?? null;
  })();

  // Clear the dismissal whenever the guided flow moves to another step — adjusted during render.
  const [dismissedForStepId, setDismissedForStepId] = useState(currentStepId);
  if (dismissedForStepId !== currentStepId) {
    setDismissedForStepId(currentStepId);
    setDismissed(false);
  }
  const stepIndex = (() => {
    const index = onboardingState?.steps.findIndex((step) => step.id === stepId) ?? -1;
    return index >= 0 ? index + 1 : 1;
  })();
  const totalSteps = onboardingState?.steps.length ?? 1;
  const previousStepId = getPreviousGuidedOnboardingStepId(stepId);
  const nextStepIdVal = getNextGuidedOnboardingStepId(stepId);
  const isRequired = stepState?.required ?? false;
  const canSkip = Boolean(stepState && !stepState.required);
  const canGoPrevious = Boolean(previousStepId);
  const canGoNext = Boolean(nextStepIdVal);
  const showGuide = onboardingState?.status === "active" && currentStepId === stepId && !dismissed;
  const recoverStateFromBackend = async (context: string): Promise<GuidedOnboardingState | null> => {
    try {
      const refreshed = await onboardingClient.getState();
      setOnboardingState(refreshed);
      return refreshed;
    } catch (error) {
      console.warn(`[GuidedOnboarding] Failed to recover state after ${context}:`, error);
      return onboardingState;
    }
  };
  const finalizeIfNeeded = async (state: GuidedOnboardingState | null) => {
    if (state?.status === "active" && (state.currentStepId === null || state.currentStepId === undefined)) {
      try {
        const result = await onboardingClient.complete();
        setOnboardingState(result);
        return result;
      } catch (error) {
        console.warn(`[GuidedOnboarding] Failed to finalize onboarding from step ${stepId}:`, error);
      }
    }
    return onboardingState;
  };
  const notifySiblingGuides = () => {
    requestGuidedOnboardingResume("step-completed");
  };
  const setStepStatus = async (status: Extract<GuidedOnboardingStepStatus, "completed" | "skipped">) => {
    try {
      const result = await onboardingClient.setStepStatus({
        stepId,
        status,
      });
      setOnboardingState(result);
      setDismissed(false);
      notifySiblingGuides();
      return finalizeIfNeeded(result);
    } catch (error) {
      console.warn(`[GuidedOnboarding] Failed to set step ${stepId} status to ${status}:`, error);
      return recoverStateFromBackend(`setStepStatus(${stepId}, ${status})`);
    }
  };
  const activateStep = async (targetStepId: GuidedOnboardingStepId) => {
    try {
      const result = await onboardingClient.start({
        stepId: targetStepId,
      });
      setOnboardingState(result);
      setDismissed(false);
      notifySiblingGuides();
      return result;
    } catch (error) {
      console.warn(`[GuidedOnboarding] Failed to activate step ${targetStepId}:`, error);
      return recoverStateFromBackend(`activateStep(${targetStepId})`);
    }
  };
  const activatePreviousStep = async () => {
    if (!previousStepId) {
      return onboardingState;
    }
    return activateStep(previousStepId);
  };
  const activateNextStep = async () => {
    if (!nextStepIdVal) {
      return onboardingState;
    }
    return activateStep(nextStepIdVal);
  };
  const forceComplete = async () => {
    try {
      const result = await onboardingClient.complete({
        force: true,
      });
      setOnboardingState(result);
      setDismissed(false);
      notifySiblingGuides();
      return result;
    } catch (error) {
      console.warn(`[GuidedOnboarding] Failed to force complete onboarding from ${stepId}:`, error);
      return recoverStateFromBackend(`forceComplete(${stepId})`);
    }
  };
  const completeStep = () => setStepStatus("completed");
  const skipStep = async () => {
    if (!canSkip) {
      return onboardingState;
    }
    return setStepStatus("skipped");
  };
  const syncState = async () => {
    try {
      const result = await onboardingClient.getState();
      setOnboardingState(result);
    } catch (error) {
      console.warn(`[GuidedOnboarding] Failed to sync step ${stepId}:`, error);
    }
  };
  useEffect(() => {
    const prevCurrentStepId = {
      value: currentStepId,
    };
    return () => {
      prevCurrentStepId.value = currentStepId;
    };
  }, [currentStepId]);
  useEffect(() => {
    void onboardingClient
      .getState()
      .then((result) => setOnboardingState(result))
      .catch((error) => console.warn(`[GuidedOnboarding] Failed to sync step ${stepId}:`, error));
    const handleResumeRequested = () => {
      void syncState();
    };
    window.addEventListener(GUIDED_ONBOARDING_RESUME_REQUESTED_EVENT, handleResumeRequested as EventListener);
    return () => {
      window.removeEventListener(GUIDED_ONBOARDING_RESUME_REQUESTED_EVENT, handleResumeRequested as EventListener);
    };
  }, [stepId, syncState]);
  return {
    onboardingState,
    currentStepId,
    stepState,
    stepIndex,
    totalSteps,
    previousStepId,
    nextStepId: nextStepIdVal,
    isRequired,
    canSkip,
    canGoPrevious,
    canGoNext,
    showGuide,
    dismissGuide: () => setDismissed(true),
    completeStep,
    skipStep,
    activateStep,
    activatePreviousStep,
    activateNextStep,
    forceComplete,
    setStepStatus,
    syncState,
  };
}
