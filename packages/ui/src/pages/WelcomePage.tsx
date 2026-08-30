import { useEffect, useState } from "react";
import { useStore } from "@tanstack/react-store";
import { useNavigate } from "@tanstack/react-router";
import { Icon } from "@iconify/react";
import { themeStore } from "#/stores/theme";
import { goToNewThread as goToNewThreadAction } from "#/stores/ui/pageRouter";
import { createConfigClient } from "#api/ConfigClient";
import { createOnboardingClient } from "#api/OnboardingClient";
import { isBrowserMode } from "#api/runtimeKind";
import { persistGuidedOnboardingResumeIntent, type GuidedOnboardingResumeTrigger } from "#/lib/onboardingResume";
import { cn } from "#/lib/utils";
import { ENTRANCE_CLASS } from "#/lib/pageMotion";
import logo from "#/assets/logo.png";
import logoDark from "#/assets/logo-dark.png";
import {
  getNextGuidedOnboardingStepId,
  isGuidedOnboardingChatStepId,
  resolveGuidedOnboardingStepTarget,
  type GuidedOnboardingSettingsRouteName,
} from "@argos/shared/guidedOnboarding";
import { resolveSettingsNavigationPath } from "@argos/shared/settingsNavigation";
import ModelIcon from "#/components/icons/ModelIcon";
import type {
  GuidedOnboardingState,
  GuidedOnboardingStepId,
  GuidedOnboardingStepState,
} from "@argos/shared-contracts/routes";
const configClient = createConfigClient();
const onboardingClient = createOnboardingClient();
const providers = [
  {
    id: "claude",
    name: "Claude",
  },
  {
    id: "openai",
    name: "OpenAI",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
  },
  {
    id: "gemini",
    name: "Gemini",
  },
  {
    id: "ollama",
    name: "Ollama",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
  },
];
type SettingsRouteName = GuidedOnboardingSettingsRouteName | "settings-acp" | "settings-database";
type SettingsWindowState = Window & {
  __argosSettingsPendingSection?: string | null;
};
const SETTINGS_SECTION_EVENT = "argos:settings-section";
function stepStatusIcon(status: GuidedOnboardingStepState["status"], isCurrent: boolean) {
  if (status === "completed") {
    return {
      icon: "lucide:circle-check",
      className: "text-accent-500",
    };
  }
  if (status === "skipped") {
    return {
      icon: "lucide:circle-minus",
      className: "text-muted-foreground/50",
    };
  }
  if (isCurrent || status === "in_progress") {
    return {
      icon: "lucide:circle-dot",
      className: "text-accent-500",
    };
  }
  return {
    icon: "lucide:circle",
    className: "text-muted-foreground/40",
  };
}
const GUIDED_STEP_TITLES: Record<GuidedOnboardingStepId, string> = {
  "select-provider": "Select a provider",
  "provider-api-key": "Add an API key",
  "provider-model": "Pick a default model",
  "switch-agent": "Choose your agent",
  mcp: "Connect MCP servers",
  skills: "Install skills",
  "switch-model": "Switch models mid-chat",
  "first-chat": "Send your first message",
};
function guideStepTitle(stepId: GuidedOnboardingStepId): string {
  return GUIDED_STEP_TITLES[stepId] ?? stepId;
}
function GuideStepItem({
  step,
  isCurrent,
  onSelect,
}: {
  step: GuidedOnboardingStepState;
  isCurrent: boolean;
  onSelect: (stepId: GuidedOnboardingStepId) => void;
}) {
  const statusIcon = stepStatusIcon(step.status, isCurrent);
  return (
    <li>
      <button
        type="button"
        className="group flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors duration-150 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
        onClick={() => onSelect(step.id)}
      >
        <Icon icon={statusIcon.icon} aria-hidden="true" className={cn("h-4 w-4 shrink-0", statusIcon.className)} />
        <span
          className={cn(
            "flex-1 truncate text-[13px]",
            step.status === "completed" || step.status === "skipped"
              ? "text-muted-foreground"
              : isCurrent
                ? "font-medium text-foreground"
                : "text-foreground/80",
          )}
        >
          {guideStepTitle(step.id)}
        </span>
        {isCurrent && <span className="shrink-0 text-xs font-medium text-accent-500">Up next</span>}
        <Icon
          icon="lucide:arrow-right"
          aria-hidden="true"
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground/60 opacity-0 transition duration-150 group-hover:translate-x-0.5 group-hover:opacity-100",
            isCurrent && "text-accent-500/80",
          )}
        />
      </button>
    </li>
  );
}
function WelcomeGuideCard({
  onboardingState,
  guideSteps,
  currentGuideStepId,
  completedStepCount,
  primaryGuideActionLabel,
  onResumeStep,
  onPrimaryAction,
}: {
  onboardingState: GuidedOnboardingState;
  guideSteps: GuidedOnboardingStepState[];
  currentGuideStepId: GuidedOnboardingStepId;
  completedStepCount: number;
  primaryGuideActionLabel: string;
  onResumeStep: (stepId: GuidedOnboardingStepId) => void;
  onPrimaryAction: () => void;
}) {
  return (
    <section
      data-testid="welcome-guide-card"
      aria-label="Setup progress"
      className={`w-full overflow-hidden rounded-xl border border-border/70 bg-card/60 ${ENTRANCE_CLASS}`}
      style={{
        animationDelay: "60ms",
      }}
    >
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-foreground">Get started</p>
          <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
            {completedStepCount} of {guideSteps.length} steps complete
          </p>
        </div>
        <button
          data-testid="welcome-guide-primary-action"
          type="button"
          className="shrink-0 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition duration-150 hover:bg-primary/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
          onClick={onPrimaryAction}
        >
          {primaryGuideActionLabel}
        </button>
      </div>

      <div className="px-4 pt-3">
        <div
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={0}
          aria-valuemax={Math.max(guideSteps.length, 1)}
          aria-valuenow={completedStepCount}
          className="h-0.5 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className="h-full rounded-full bg-accent-500 transition-[width] duration-300 ease-out"
            style={{
              width: `${guideSteps.length > 0 ? (completedStepCount / guideSteps.length) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      <ul className="mt-2 divide-y divide-border/50 py-1" aria-label="Setup steps">
        {guideSteps.map((step: GuidedOnboardingStepState) => {
          const isCurrent = step.id === currentGuideStepId && onboardingState.status === "active";
          return <GuideStepItem key={step.id} step={step} isCurrent={isCurrent} onSelect={onResumeStep} />;
        })}
      </ul>
    </section>
  );
}
function ProviderGrid({
  isDark,
  animationDelay,
  onAddProvider,
  onImportProviders,
}: {
  isDark: boolean;
  animationDelay: string;
  onAddProvider: () => void;
  onImportProviders: () => void;
}) {
  return (
    <div className={`w-full ${ENTRANCE_CLASS}`} style={{ animationDelay }}>
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-xs font-medium text-muted-foreground">Add a provider</p>
        <button
          data-testid="welcome-guide-import-action"
          type="button"
          className="text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
          onClick={onImportProviders}
        >
          Import existing setup
        </button>
      </div>

      <div data-testid="welcome-provider-grid" className="mt-2 grid w-full grid-cols-3 gap-2">
        {providers.map((provider) => (
          <button
            key={provider.id}
            type="button"
            className="flex flex-col items-center gap-2 rounded-lg border border-border/70 bg-card/40 px-3 py-3.5 transition duration-150 hover:border-border hover:bg-accent/50 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
            onClick={onAddProvider}
          >
            <ModelIcon modelId={provider.id} customClass="h-5 w-5" isDark={isDark} />
            <span className="text-xs text-foreground/80">{provider.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
function AcpSetupCard({ animationDelay, onSetup }: { animationDelay: string; onSetup: () => void }) {
  return (
    <div className={`w-full border-t border-border/60 pt-4 ${ENTRANCE_CLASS}`} style={{ animationDelay }}>
      <button
        type="button"
        className="group flex w-full items-center gap-3 rounded-lg border border-border/70 px-3.5 py-3 text-left transition duration-150 hover:border-border hover:bg-accent/50 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60"
        onClick={onSetup}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/70 text-muted-foreground">
          <Icon icon="lucide:plug-zap" aria-hidden="true" className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-foreground">Connect an ACP agent</span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">Use an external agent through ACP</span>
        </span>
        <Icon
          icon="lucide:arrow-right"
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60 opacity-0 transition duration-150 group-hover:translate-x-0.5 group-hover:opacity-100"
        />
      </button>
    </div>
  );
}
export function WelcomePage() {
  const navigate = useNavigate();
  const theme = useStore(themeStore);
  const [onboardingState, setOnboardingState] = useState<GuidedOnboardingState | null>(null);
  const guideSteps = onboardingState?.steps ?? [];
  const currentGuideStepId = (() => {
    if (onboardingState?.currentStepId) {
      return onboardingState.currentStepId;
    }
    return onboardingState?.steps?.find((step) => step.status === "pending")?.id ?? "select-provider";
  })();
  const completedStepCount = guideSteps.filter(
    (step) => step.status === "completed" || step.status === "skipped",
  ).length;
  const primaryGuideActionLabel = isGuidedOnboardingChatStepId(currentGuideStepId) ? "Go to chat" : "Continue";
  const showGuide = Boolean(onboardingState && onboardingState.status !== "completed");
  const persistGuideResumeIntent = (
    trigger: GuidedOnboardingResumeTrigger,
    stepId: GuidedOnboardingStepId = currentGuideStepId,
  ) => {
    if (onboardingState?.status !== "active") return;
    persistGuidedOnboardingResumeIntent({
      stepId,
      trigger,
    });
  };
  const syncOnboardingStep = async (stepId?: GuidedOnboardingStepId) => {
    if (!stepId) return;
    try {
      setOnboardingState(
        await onboardingClient.start({
          stepId,
        }),
      );
    } catch (error) {
      console.error(`Failed to start onboarding step ${stepId}:`, error);
    }
  };
  const goToChat = async (stepId?: GuidedOnboardingStepId) => {
    await syncOnboardingStep(stepId);
    goToNewThreadAction();
    await navigate({
      to: "/chat",
      replace: true,
    });
  };
  const openSettings = async (routeName: SettingsRouteName, stepId?: GuidedOnboardingStepId, section?: string) => {
    await syncOnboardingStep(stepId);
    if (isBrowserMode()) {
      const path = resolveSettingsNavigationPath(routeName);
      await navigate({
        to: `/settings${path}` as any,
        replace: false,
      });
      if (section) {
        (window as SettingsWindowState).__argosSettingsPendingSection = section;
        await new Promise((resolve) => setTimeout(resolve, 0));
        window.dispatchEvent(
          new CustomEvent(SETTINGS_SECTION_EVENT, {
            detail: {
              section,
            },
          }),
        );
      }
      return;
    }
    await configClient.openSettings({
      routeName,
      section,
    });
  };
  const resolveGuideAction = (
    stepId: GuidedOnboardingStepId,
  ):
    | {
        kind: "chat";
        stepId: GuidedOnboardingStepId;
      }
    | {
        kind: "settings";
        routeName: SettingsRouteName;
        stepId: GuidedOnboardingStepId;
      } => {
    const target = resolveGuidedOnboardingStepTarget(stepId);
    if (target?.surface === "chat") {
      return {
        kind: "chat",
        stepId: target.stepId,
      };
    }
    if (target?.surface === "settings" && target.routeName) {
      return {
        kind: "settings",
        routeName: target.routeName,
        stepId: target.stepId,
      };
    }
    return {
      kind: "settings",
      routeName: "settings-provider",
      stepId: "select-provider",
    };
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
  const handlePrimaryGuideAction = async () => {
    await resumeGuideStep(currentGuideStepId);
  };
  const handleExperiencedGuideAction = async () => {
    try {
      setOnboardingState(
        await onboardingClient.complete({
          force: true,
        }),
      );
      goToNewThreadAction({
        refresh: true,
      });
      await navigate({
        to: "/chat",
        replace: true,
      });
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
    let cancelled = false;
    void (async () => {
      try {
        let state = await onboardingClient.getState();
        if (cancelled) return;
        if (state.status === "idle") {
          state = await onboardingClient.start();
        }
        if (cancelled) return;
        setOnboardingState(state);
      } catch (error) {
        console.error("Failed to sync welcome onboarding state:", error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return (
    <div className="window-drag-region relative flex h-full w-full flex-col overflow-y-auto">
      {showGuide && (
        <button
          data-testid="welcome-guide-expert-action"
          type="button"
          className={`window-no-drag-region absolute right-5 top-5 z-10 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/60 ${ENTRANCE_CLASS}`}
          onClick={() => void handleExperiencedGuideAction()}
          aria-label="Skip setup"
        >
          Skip setup
        </button>
      )}

      <div className="window-no-drag-region mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-8 px-6 py-10">
        <header className={`flex flex-col items-center text-center ${ENTRANCE_CLASS}`}>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border/70 bg-card/60">
            <img src={theme.isDark ? logoDark : logo} alt="Argos" className="h-6 w-6" loading="lazy" />
          </div>
          <h1 className="mt-4 text-balance text-xl font-semibold tracking-tight text-foreground">Welcome to Argos</h1>
          <p className="mt-1.5 max-w-xs text-balance text-[13px] leading-5 text-muted-foreground">
            Connect a model provider and start your first chat.
          </p>
        </header>

        {showGuide && onboardingState && (
          <WelcomeGuideCard
            onboardingState={onboardingState}
            guideSteps={guideSteps}
            currentGuideStepId={currentGuideStepId}
            completedStepCount={completedStepCount}
            primaryGuideActionLabel={primaryGuideActionLabel}
            onResumeStep={(stepId) => void resumeGuideStep(stepId)}
            onPrimaryAction={() => void handlePrimaryGuideAction()}
          />
        )}

        <ProviderGrid
          isDark={theme.isDark}
          animationDelay={showGuide ? "120ms" : "60ms"}
          onAddProvider={() => void onAddProvider()}
          onImportProviders={() => void onImportProviders()}
        />

        <AcpSetupCard animationDelay={showGuide ? "180ms" : "120ms"} onSetup={() => void onSetupAcp()} />
      </div>
    </div>
  );
}
