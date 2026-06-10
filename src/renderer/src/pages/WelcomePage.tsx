import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@tanstack/react-store";
import { useNavigate } from "@tanstack/react-router";
import { themeStore } from "@/stores/theme";
import { goToNewThread as goToNewThreadAction } from "@/stores/ui/pageRouter";
import { createConfigClient } from "@api/ConfigClient";
import { createOnboardingClient } from "@api/OnboardingClient";
import { persistGuidedOnboardingResumeIntent, type GuidedOnboardingResumeTrigger } from "@/lib/onboardingResume";
import {
  getNextGuidedOnboardingStepId,
  getPreviousGuidedOnboardingStepId,
  isGuidedOnboardingChatStepId,
  resolveGuidedOnboardingStepTarget,
  type GuidedOnboardingSettingsRouteName,
} from "@shared/guidedOnboarding";
import ModelIcon from "@/components/icons/ModelIcon";
import OnBoardingSpotlight from "@/components/onboarding/OnBoardingSpotlight";
import { useOnBoarding } from "@/composables/useOnBoarding";
import type {
  GuidedOnboardingState,
  GuidedOnboardingStepId,
  GuidedOnboardingStepStatus,
} from "@shared/contracts/routes";

const configClient = createConfigClient();
const onboardingClient = createOnboardingClient();

const providers = [
  { id: "claude", name: "Claude" },
  { id: "openai", name: "OpenAI" },
  { id: "deepseek", name: "DeepSeek" },
  { id: "gemini", name: "Gemini" },
  { id: "ollama", name: "Ollama" },
  { id: "openrouter", name: "OpenRouter" },
];

type SettingsRouteName = GuidedOnboardingSettingsRouteName | "settings-acp" | "settings-database";

export function WelcomePage() {
  const navigate = useNavigate();
  const theme = useStore(themeStore);

  const [onboardingState, setOnboardingState] = useState<GuidedOnboardingState | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const guideCardRef = useRef<HTMLDivElement>(null);
  const providerGridRef = useRef<HTMLDivElement>(null);
  const [guideCoachmarkDismissed, setGuideCoachmarkDismissed] = useState(false);
  const coachmarkPanelRef = useRef<HTMLDivElement>(null);

  const requiredGuideSteps = useMemo(
    () => onboardingState?.steps?.filter((step) => step.required) ?? [],
    [onboardingState],
  );
  const optionalGuideSteps = useMemo(
    () => onboardingState?.steps?.filter((step) => !step.required) ?? [],
    [onboardingState],
  );
  const completedRequiredSteps = useMemo(
    () => requiredGuideSteps.filter((step) => step.status === "completed").length,
    [requiredGuideSteps],
  );

  const guideStepTitle = (stepId: GuidedOnboardingStepId): string => {
    switch (stepId) {
      case "select-provider":
        return "Select Provider";
      case "provider-api-key":
        return "API Key";
      case "provider-model":
        return "Select Model";
      case "switch-agent":
        return "Switch Agent";
      case "mcp":
        return "MCP";
      case "skills":
        return "Skills";
      case "switch-model":
        return "Switch Model";
      case "first-chat":
        return "First Chat";
      default:
        return stepId;
    }
  };

  const currentGuideStepId = useMemo<GuidedOnboardingStepId>(() => {
    if (onboardingState?.currentStepId) {
      return onboardingState.currentStepId;
    }
    return onboardingState?.steps?.find((step) => step.status === "pending")?.id ?? "select-provider";
  }, [onboardingState]);

  const currentGuideStepTitle = useMemo(() => guideStepTitle(currentGuideStepId), [currentGuideStepId]);

  const primaryGuideActionLabel = useMemo(
    () => (isGuidedOnboardingChatStepId(currentGuideStepId) ? "Go to Chat" : "Continue Setup"),
    [currentGuideStepId],
  );

  const guideStepIds = useMemo(() => onboardingState?.steps?.map((step) => step.id) ?? [], [onboardingState]);

  const coachmarkStepId = currentGuideStepId;
  const coachmarkStepTitle = guideStepTitle(coachmarkStepId);
  const showGuideImportAction = coachmarkStepId === "select-provider";
  const showGuideCoachmark = onboardingState?.status === "active" && !guideCoachmarkDismissed;
  const coachmarkTargetSurface = coachmarkStepId === "select-provider" ? "providers" : "guide-card";
  const coachmarkStepIndex = useMemo(() => {
    const idx = guideStepIds.findIndex((id) => id === coachmarkStepId);
    return idx >= 0 ? idx + 1 : 1;
  }, [guideStepIds, coachmarkStepId]);
  const coachmarkTotalSteps = onboardingState?.steps?.length ?? 1;
  const canGoToPreviousGuideStep = Boolean(getPreviousGuidedOnboardingStepId(currentGuideStepId));
  const canGoToNextGuideStep = coachmarkStepIndex < coachmarkTotalSteps;

  const resolveCoachmarkTargetElement = () =>
    coachmarkTargetSurface === "providers" ? providerGridRef.current : guideCardRef.current;

  const coachmarkTargetEl = showGuideCoachmark ? resolveCoachmarkTargetElement() : null;

  const {
    viewportWidth: coachmarkViewportWidth,
    viewportHeight: coachmarkViewportHeight,
    pathD: coachmarkPathD,
    cutoutPathD: coachmarkCutoutPathD,
  } = useOnBoarding(coachmarkTargetEl, {
    visible: showGuideCoachmark,
    radius: 28,
  });

  const persistGuideResumeIntent = (
    trigger: GuidedOnboardingResumeTrigger,
    stepId: GuidedOnboardingStepId = currentGuideStepId,
  ) => {
    if (onboardingState?.status !== "active") return;
    persistGuidedOnboardingResumeIntent({ stepId, trigger });
  };

  const syncOnboardingState = async () => {
    try {
      const state = await onboardingClient.getState();
      setOnboardingState(state.status === "idle" ? await onboardingClient.start() : state);
      setGuideCoachmarkDismissed(false);
    } catch (error) {
      console.error("Failed to sync welcome onboarding state:", error);
    }
  };

  const syncOnboardingStep = async (stepId?: GuidedOnboardingStepId) => {
    if (!stepId) return;
    try {
      setOnboardingState(await onboardingClient.start({ stepId }));
    } catch (error) {
      console.error(`Failed to start onboarding step ${stepId}:`, error);
    }
  };

  const goToChat = async (stepId?: GuidedOnboardingStepId) => {
    await syncOnboardingStep(stepId);
    goToNewThreadAction();
    await navigate({ to: "/chat", replace: true });
  };

  const openSettings = async (routeName: SettingsRouteName, stepId?: GuidedOnboardingStepId, section?: string) => {
    await syncOnboardingStep(stepId);
    await configClient.openSettings({ routeName, section });
  };

  const resolveGuideAction = (
    stepId: GuidedOnboardingStepId,
  ):
    | { kind: "chat"; stepId: GuidedOnboardingStepId }
    | { kind: "settings"; routeName: SettingsRouteName; stepId: GuidedOnboardingStepId } => {
    const target = resolveGuidedOnboardingStepTarget(stepId);
    if (target?.surface === "chat") {
      return { kind: "chat", stepId: target.stepId };
    }
    if (target?.surface === "settings" && target.routeName) {
      return { kind: "settings", routeName: target.routeName, stepId: target.stepId };
    }
    return { kind: "settings", routeName: "settings-provider", stepId: "select-provider" };
  };

  const resumeGuideStep = async (stepId: GuidedOnboardingStepId) => {
    const action = resolveGuideAction(stepId);
    if (action.kind === "chat") {
      await goToChat(action.stepId);
      return;
    }
    persistGuideResumeIntent("window-focus", action.stepId);
    await openSettings(action.routeName, action.stepId);
  };

  const goToPreviousGuideStep = async () => {
    const previousStepId = getPreviousGuidedOnboardingStepId(currentGuideStepId);
    if (!previousStepId) return;
    await resumeGuideStep(previousStepId);
  };

  const goToNextGuideStep = async () => {
    if (!canGoToNextGuideStep) return;
    await handlePrimaryGuideAction();
  };

  const guideStepClass = (_stepId: GuidedOnboardingStepId, status: GuidedOnboardingStepStatus) => {
    if (status === "completed") {
      return "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    }
    if (status === "in_progress") {
      return "border-primary/60 bg-primary/10 text-foreground";
    }
    return "border-border/70 bg-background/60 text-muted-foreground";
  };

  const guideStepIconClass = (_stepId: GuidedOnboardingStepId, status: GuidedOnboardingStepStatus) => {
    if (status === "completed") return "text-emerald-600 dark:text-emerald-300";
    if (status === "in_progress") return "text-primary";
    return "text-muted-foreground/70";
  };

  const handlePrimaryGuideAction = async () => {
    const action = resolveGuideAction(currentGuideStepId);
    if (action.kind === "chat") {
      await goToChat(action.stepId);
      return;
    }
    persistGuideResumeIntent("window-focus", action.stepId);
    await openSettings(action.routeName, action.stepId);
  };

  const handleExperiencedGuideAction = async () => {
    try {
      setOnboardingState(await onboardingClient.complete({ force: true }));
      goToNewThreadAction({ refresh: true });
      await navigate({ to: "/chat", replace: true });
    } catch (error) {
      console.error("Failed to skip guided onboarding:", error);
    }
  };

  const onAddProvider = async () => {
    persistGuideResumeIntent("window-focus", "select-provider");
    await openSettings("settings-provider", "select-provider");
  };

  const onImportProviders = async () => {
    let stepId: GuidedOnboardingStepId = "select-provider";
    if (onboardingState?.status === "active") {
      stepId =
        currentGuideStepId !== "select-provider"
          ? currentGuideStepId
          : (getNextGuidedOnboardingStepId("select-provider") ?? "provider-api-key");
    }
    persistGuideResumeIntent("window-focus", stepId);
    await openSettings("settings-database", stepId, "provider-import");
  };

  const onSetupAcp = async () => {
    await openSettings("settings-acp");
  };

  useEffect(() => {
    void syncOnboardingState();
  }, []);

  return (
    <div
      ref={rootRef}
      className="relative h-full w-full flex flex-col"
      style={{ WebkitAppRegion: "drag" } as CSSProperties}
    >
      {showGuideCoachmark && (
        <div
          data-testid="welcome-guide-coachmark"
          data-guide-target={coachmarkTargetSurface}
          className="pointer-events-none fixed inset-0 z-70"
        >
          <OnBoardingSpotlight
            pathD={coachmarkPathD}
            cutoutPathD={coachmarkCutoutPathD}
            viewportWidth={coachmarkViewportWidth}
            viewportHeight={coachmarkViewportHeight}
            fillOpacity={0.56}
          />

          <div
            ref={coachmarkPanelRef}
            data-testid="welcome-guide-panel"
            role="dialog"
            aria-modal="true"
            className="welcome-guide-coachmark pointer-events-auto absolute rounded-2xl border border-border/80 bg-background/95 p-4 shadow-2xl backdrop-blur"
            style={{ top: "24px", left: "24px", width: "min(320px, calc(100% - 32px))" }}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-primary/80">Getting Started</p>
              <span className="rounded-full border border-border/70 bg-muted/80 px-2 py-0.5 text-[11px] text-muted-foreground">
                {coachmarkStepIndex}/{coachmarkTotalSteps}
              </span>
            </div>

            <div className="mt-3 flex min-w-0 items-center gap-2 overflow-hidden">
              <h2 className="shrink-0 text-sm font-semibold text-foreground">{coachmarkStepTitle}</h2>
              {showGuideImportAction && (
                <>
                  <span className="shrink-0 text-xs font-medium text-muted-foreground">or</span>
                  <button
                    data-testid="welcome-guide-import-action"
                    type="button"
                    className="inline-flex min-w-0 max-w-[220px] items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary shadow-sm transition-all duration-150 hover:border-primary/60 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/35 active:scale-[0.99]"
                    onClick={(e) => {
                      e.stopPropagation();
                      void onImportProviders();
                    }}
                  >
                    <span className="truncate">Import Providers</span>
                  </button>
                </>
              )}
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Complete the {coachmarkStepTitle} step to continue.
            </p>

            <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
              <div className="flex max-w-full flex-wrap items-center gap-2">
                <button
                  data-testid="welcome-guide-prev-action"
                  type="button"
                  className={`whitespace-nowrap rounded-lg border border-border/80 px-3 py-1.5 text-xs transition-colors ${
                    canGoToPreviousGuideStep
                      ? "text-foreground hover:bg-accent/50"
                      : "cursor-not-allowed text-muted-foreground/50"
                  }`}
                  disabled={!canGoToPreviousGuideStep}
                  onClick={() => void goToPreviousGuideStep()}
                >
                  Back
                </button>
                <button
                  data-testid="welcome-guide-next-action"
                  type="button"
                  className={`whitespace-nowrap rounded-lg border border-border/80 px-3 py-1.5 text-xs transition-colors ${
                    canGoToNextGuideStep
                      ? "text-foreground hover:bg-accent/50"
                      : "cursor-not-allowed text-muted-foreground/50"
                  }`}
                  disabled={!canGoToNextGuideStep}
                  onClick={() => void goToNextGuideStep()}
                >
                  Next
                </button>
              </div>

              <div className="flex max-w-full flex-wrap items-center justify-end gap-2">
                <button
                  data-testid="welcome-guide-close-action"
                  type="button"
                  className="whitespace-nowrap rounded-lg border border-border/80 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                  onClick={() => setGuideCoachmarkDismissed(true)}
                >
                  Close
                </button>
                <button
                  data-testid="welcome-guide-expert-action"
                  type="button"
                  className="whitespace-nowrap rounded-lg border border-border/80 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
                  onClick={() => void handleExperiencedGuideAction()}
                >
                  Skip All
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div className="mb-5">
          <img src={new URL("@/assets/logo-dark.png", import.meta.url).href} className="w-16 h-16" loading="lazy" />
        </div>

        <h1 className="text-3xl font-semibold text-foreground mb-2">Welcome</h1>
        <p className="text-sm text-muted-foreground text-center max-w-md mb-10">
          Set up your AI providers and start chatting.
        </p>

        {onboardingState && (
          <div
            ref={guideCardRef}
            data-testid="welcome-guide-card"
            className="w-full max-w-sm mb-6 rounded-2xl border border-border/70 bg-card/50 px-4 py-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">Getting Started</p>
                <p className="mt-2 text-sm text-foreground/85">
                  Complete the {currentGuideStepTitle} step to continue.
                </p>
              </div>
              <button
                data-testid="welcome-guide-primary-action"
                className="shrink-0 whitespace-nowrap rounded-lg border border-border/80 px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-accent/50"
                onClick={() => void handlePrimaryGuideAction()}
              >
                {primaryGuideActionLabel}
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span>
                {completedRequiredSteps}/{requiredGuideSteps.length}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              {requiredGuideSteps.map((step) => (
                <div key={step.id} className={`rounded-xl border px-3 py-2 ${guideStepClass(step.id, step.status)}`}>
                  <div className="flex items-center gap-2">
                    <span className={`h-3.5 w-3.5 shrink-0 ${guideStepIconClass(step.id, step.status)}`}>
                      {step.status === "completed" ? "✓" : step.status === "in_progress" ? "●" : "○"}
                    </span>
                    <span className="truncate text-[11px] font-medium">{guideStepTitle(step.id)}</span>
                  </div>
                </div>
              ))}
            </div>

            {optionalGuideSteps.length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] text-muted-foreground/70">Optional</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {optionalGuideSteps.map((step) => (
                    <span
                      key={step.id}
                      className="rounded-full border border-border/70 px-2.5 py-1 text-[11px] text-muted-foreground"
                    >
                      {guideStepTitle(step.id)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div
          ref={providerGridRef}
          data-testid="welcome-provider-grid"
          className="grid grid-cols-3 gap-2 w-full max-w-sm mb-4"
        >
          {providers.map((provider) => (
            <button
              key={provider.id}
              className="flex flex-col items-center gap-2 rounded-xl border border-border/60 bg-card/40 px-3 py-4 hover:bg-accent/50 hover:border-border transition-all duration-150"
              style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
              onClick={() => void onAddProvider()}
            >
              <ModelIcon modelId={provider.id} customClass="w-6 h-6" isDark={theme.isDark} />
              <span className="text-xs text-foreground/80">{provider.name}</span>
            </button>
          ))}
        </div>

        <div className="mb-12 flex flex-wrap items-center justify-center gap-3">
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
            onClick={() => void onAddProvider()}
          >
            Browse Providers
          </button>
        </div>

        <div className="flex flex-col items-center gap-3 w-full max-w-sm">
          <div className="flex items-center gap-3 w-full">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground/60">Connect Agent</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <button
            className="flex items-center gap-3 w-full rounded-xl border border-dashed border-border/60 px-4 py-3 hover:bg-accent/30 hover:border-border transition-all duration-150"
            style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
            onClick={() => void onSetupAcp()}
          >
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted/60 shrink-0">
              <span className="w-4 h-4 text-muted-foreground">⌘</span>
            </div>
            <div className="text-left">
              <p className="text-sm text-foreground/80">Connect ACP Agent</p>
              <p className="text-xs text-muted-foreground/60">
                Connect an external agent via the Agent Communication Protocol
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
