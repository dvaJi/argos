import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { createOnboardingClient } from '@api/OnboardingClient'
import {
  GUIDED_ONBOARDING_RESUME_REQUESTED_EVENT,
  requestGuidedOnboardingResume
} from '@/lib/onboardingResume'
import {
  getNextGuidedOnboardingStepId,
  getPreviousGuidedOnboardingStepId
} from '@shared/guidedOnboarding'
import type {
  GuidedOnboardingState,
  GuidedOnboardingStepId,
  GuidedOnboardingStepStatus
} from '@shared/contracts/routes'

export function useGuidedOnboardingStep(stepId: GuidedOnboardingStepId) {
  const onboardingClientRef = useRef(createOnboardingClient())
  const [onboardingState, setOnboardingState] = useState<GuidedOnboardingState | null>(null)
  const [dismissed, setDismissed] = useState(false)

  const stepState = useMemo(
    () => onboardingState?.steps.find((step) => step.id === stepId) ?? null,
    [onboardingState, stepId]
  )

  const currentStepId = useMemo<GuidedOnboardingStepId | null>(() => {
    if (onboardingState?.currentStepId) {
      return onboardingState.currentStepId
    }

    return onboardingState?.steps.find((step) => step.status === 'pending')?.id ?? null
  }, [onboardingState])

  const stepIndex = useMemo(() => {
    const index = onboardingState?.steps.findIndex((step) => step.id === stepId) ?? -1
    return index >= 0 ? index + 1 : 1
  }, [onboardingState, stepId])

  const totalSteps = useMemo(() => onboardingState?.steps.length ?? 1, [onboardingState])
  const previousStepId = useMemo(() => getPreviousGuidedOnboardingStepId(stepId), [stepId])
  const nextStepIdVal = useMemo(() => getNextGuidedOnboardingStepId(stepId), [stepId])
  const isRequired = useMemo(() => stepState?.required ?? false, [stepState])
  const canSkip = useMemo(() => Boolean(stepState && !stepState.required), [stepState])
  const canGoPrevious = useMemo(() => Boolean(previousStepId), [previousStepId])
  const canGoNext = useMemo(() => Boolean(nextStepIdVal), [nextStepIdVal])
  const showGuide = useMemo(
    () => onboardingState?.status === 'active' && currentStepId === stepId && !dismissed,
    [onboardingState, currentStepId, stepId, dismissed]
  )

  const recoverStateFromBackend = useCallback(
    async (context: string): Promise<GuidedOnboardingState | null> => {
      try {
        const refreshed = await onboardingClientRef.current.getState()
        setOnboardingState(refreshed)
        return refreshed
      } catch (error) {
        console.warn(`[GuidedOnboarding] Failed to recover state after ${context}:`, error)
        return onboardingState
      }
    },
    [onboardingState]
  )

  const finalizeIfNeeded = useCallback(
    async (state: GuidedOnboardingState | null) => {
      if (
        state?.status === 'active' &&
        (state.currentStepId === null || state.currentStepId === undefined)
      ) {
        try {
          const result = await onboardingClientRef.current.complete()
          setOnboardingState(result)
          return result
        } catch (error) {
          console.warn(
            `[GuidedOnboarding] Failed to finalize onboarding from step ${stepId}:`,
            error
          )
        }
      }

      return onboardingState
    },
    [stepId, onboardingState]
  )

  const notifySiblingGuides = useCallback(() => {
    requestGuidedOnboardingResume('step-completed')
  }, [])

  const setStepStatus = useCallback(
    async (status: Extract<GuidedOnboardingStepStatus, 'completed' | 'skipped'>) => {
      try {
        const result = await onboardingClientRef.current.setStepStatus({ stepId, status })
        setOnboardingState(result)
        setDismissed(false)
        notifySiblingGuides()
        return finalizeIfNeeded(result)
      } catch (error) {
        console.warn(`[GuidedOnboarding] Failed to set step ${stepId} status to ${status}:`, error)
        return recoverStateFromBackend(`setStepStatus(${stepId}, ${status})`)
      }
    },
    [stepId, notifySiblingGuides, finalizeIfNeeded, recoverStateFromBackend]
  )

  const activateStep = useCallback(
    async (targetStepId: GuidedOnboardingStepId) => {
      try {
        const result = await onboardingClientRef.current.start({ stepId: targetStepId })
        setOnboardingState(result)
        setDismissed(false)
        notifySiblingGuides()
        return result
      } catch (error) {
        console.warn(`[GuidedOnboarding] Failed to activate step ${targetStepId}:`, error)
        return recoverStateFromBackend(`activateStep(${targetStepId})`)
      }
    },
    [notifySiblingGuides, recoverStateFromBackend]
  )

  const activatePreviousStep = useCallback(async () => {
    if (!previousStepId) {
      return onboardingState
    }
    return activateStep(previousStepId)
  }, [previousStepId, onboardingState, activateStep])

  const activateNextStep = useCallback(async () => {
    if (!nextStepIdVal) {
      return onboardingState
    }
    return activateStep(nextStepIdVal)
  }, [nextStepIdVal, onboardingState, activateStep])

  const forceComplete = useCallback(async () => {
    try {
      const result = await onboardingClientRef.current.complete({ force: true })
      setOnboardingState(result)
      setDismissed(false)
      notifySiblingGuides()
      return result
    } catch (error) {
      console.warn(`[GuidedOnboarding] Failed to force complete onboarding from ${stepId}:`, error)
      return recoverStateFromBackend(`forceComplete(${stepId})`)
    }
  }, [stepId, notifySiblingGuides, recoverStateFromBackend])

  const completeStep = useCallback(() => setStepStatus('completed'), [setStepStatus])

  const skipStep = useCallback(async () => {
    if (!canSkip) {
      return onboardingState
    }
    return setStepStatus('skipped')
  }, [canSkip, onboardingState, setStepStatus])

  const syncState = useCallback(async () => {
    try {
      const result = await onboardingClientRef.current.getState()
      setOnboardingState(result)
    } catch (error) {
      console.warn(`[GuidedOnboarding] Failed to sync step ${stepId}:`, error)
    }
  }, [stepId])

  useEffect(() => {
    const prevCurrentStepId = { value: currentStepId }
    return () => {
      prevCurrentStepId.value = currentStepId
    }
  }, [currentStepId])

  useEffect(() => {
    setDismissed(false)
  }, [currentStepId])

  useEffect(() => {
    void syncState()
    const handleResumeRequested = () => {
      void syncState()
    }
    window.addEventListener(
      GUIDED_ONBOARDING_RESUME_REQUESTED_EVENT,
      handleResumeRequested as EventListener
    )
    return () => {
      window.removeEventListener(
        GUIDED_ONBOARDING_RESUME_REQUESTED_EVENT,
        handleResumeRequested as EventListener
      )
    }
  }, [syncState])

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
    syncState
  }
}
