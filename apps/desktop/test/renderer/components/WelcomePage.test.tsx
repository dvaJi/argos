import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { GUIDED_ONBOARDING_RESUME_STORAGE_KEY } from "@/lib/onboardingResume";

vi.mock("@iconify/react", () => ({
  Icon: () => <span />,
}));

vi.mock("@/components/icons/ModelIcon", () => ({
  default: () => <span />,
}));

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  window.sessionStorage.removeItem(GUIDED_ONBOARDING_RESUME_STORAGE_KEY);
});

describe("WelcomePage", () => {
  it("marks init complete and navigates provider entry to provider settings", async () => {
    vi.resetModules();
    vi.useFakeTimers();

    const router = {
      replace: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    };
    const pageRouter = {
      goToNewThread: vi.fn<(...args: any[]) => any>(),
    };
    const configPresenter = {
      setSetting: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    };
    const openSettings = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined);
    const onboardingSetStepStatus = vi.fn<(...args: any[]) => any>().mockResolvedValue({
      status: "active",
      currentStepId: "provider-api-key",
    });
    const onboardingStart = vi.fn<(...args: any[]) => any>().mockResolvedValue({
      status: "active",
      currentStepId: "select-provider",
    });

    vi.doMock("@api/ConfigClient", () => ({
      createConfigClient: vi.fn<(...args: any[]) => any>(() => ({
        setSetting: configPresenter.setSetting,
        openSettings,
      })),
    }));
    vi.doMock("@api/OnboardingClient", () => ({
      createOnboardingClient: vi.fn<(...args: any[]) => any>(() => ({
        getState: vi.fn<(...args: any[]) => any>().mockResolvedValue({
          version: 4,
          status: "active",
          startedAt: 1,
          completedAt: null,
          lastActiveAt: 1,
          currentStepId: "select-provider",
          steps: [
            {
              id: "select-provider",
              required: true,
              status: "in_progress",
              startedAt: 1,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "provider-api-key",
              required: false,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "provider-model",
              required: false,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "mcp",
              required: false,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "skills",
              required: false,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "switch-agent",
              required: true,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "switch-model",
              required: true,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "first-chat",
              required: true,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
          ],
        }),
        start: onboardingStart,
        setStepStatus: onboardingSetStepStatus,
      })),
    }));
    vi.doMock("@/stores/ui/pageRouter", () => ({
      usePageRouterStore: () => pageRouter,
    }));

    const WelcomePage = (await import("@/pages/WelcomePage")).default;

    const { container } = render(<WelcomePage />);
    await act(async () => {});

    const guideImportButton = container.querySelector('[data-testid="welcome-guide-import-action"]') as HTMLElement;
    expect(guideImportButton).toBeTruthy();
    const guidePanel = screen.getByTestId("welcome-guide-panel");
    expect(guidePanel).toHaveTextContent("welcome.page.guide.or");
    expect(guidePanel).toHaveTextContent("welcome.page.importProviders");
    expect(container.querySelector('[data-testid="welcome-provider-import-action"]')).toBeFalsy();
    expect(screen.getByTestId("welcome-provider-grid")).not.toHaveTextContent("welcome.page.importProviders");

    await act(async () => {
      fireEvent.click(guideImportButton);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {});

    expect(onboardingSetStepStatus).not.toHaveBeenCalled();
    expect(onboardingStart).toHaveBeenCalledWith({ stepId: "provider-api-key" });
    expect(openSettings).toHaveBeenCalledWith({
      routeName: "settings-database",
      section: "provider-import",
    });
    expect(JSON.parse(window.sessionStorage.getItem(GUIDED_ONBOARDING_RESUME_STORAGE_KEY) ?? "{}")).toMatchObject({
      stepId: "provider-api-key",
      trigger: "window-focus",
    });

    onboardingStart.mockClear();
    openSettings.mockClear();
    window.sessionStorage.removeItem(GUIDED_ONBOARDING_RESUME_STORAGE_KEY);

    const buttons = Array.from(container.querySelectorAll("button"));
    const browseButton = buttons.find((b) => b.textContent?.includes("welcome.page.browseProviders"));

    expect(browseButton).toBeDefined();

    await act(async () => {
      fireEvent.click(browseButton!);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {});

    expect(onboardingSetStepStatus).not.toHaveBeenCalled();
    expect(onboardingStart).toHaveBeenCalledWith({ stepId: "select-provider" });
    expect(configPresenter.setSetting).not.toHaveBeenCalledWith("init_complete", true);
    expect(pageRouter.goToNewThread).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(openSettings).toHaveBeenCalledWith({ routeName: "settings-provider" });
    expect(JSON.parse(window.sessionStorage.getItem(GUIDED_ONBOARDING_RESUME_STORAGE_KEY) ?? "{}")).toMatchObject({
      stepId: "select-provider",
      trigger: "window-focus",
    });
  });

  it("navigates the ACP entry to ACP settings", async () => {
    vi.resetModules();
    vi.useFakeTimers();

    const router = {
      replace: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    };
    const pageRouter = {
      goToNewThread: vi.fn<(...args: any[]) => any>(),
    };
    const configPresenter = {
      setSetting: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    };
    const openSettings = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined);
    const onboardingSetStepStatus = vi.fn<(...args: any[]) => any>().mockResolvedValue({
      status: "active",
      currentStepId: "select-provider",
    });
    const onboardingStart = vi.fn<(...args: any[]) => any>().mockResolvedValue({
      status: "active",
      currentStepId: "select-provider",
    });

    vi.doMock("@api/ConfigClient", () => ({
      createConfigClient: vi.fn<(...args: any[]) => any>(() => ({
        setSetting: configPresenter.setSetting,
        openSettings,
      })),
    }));
    vi.doMock("@api/OnboardingClient", () => ({
      createOnboardingClient: vi.fn<(...args: any[]) => any>(() => ({
        getState: vi.fn<(...args: any[]) => any>().mockResolvedValue({
          version: 4,
          status: "active",
          startedAt: 1,
          completedAt: null,
          lastActiveAt: 1,
          currentStepId: "select-provider",
          steps: [
            {
              id: "select-provider",
              required: true,
              status: "in_progress",
              startedAt: 1,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "provider-api-key",
              required: false,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "provider-model",
              required: false,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "mcp",
              required: false,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "skills",
              required: false,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "switch-agent",
              required: true,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "switch-model",
              required: true,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "first-chat",
              required: true,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
          ],
        }),
        start: onboardingStart,
        setStepStatus: onboardingSetStepStatus,
      })),
    }));
    vi.doMock("@/stores/ui/pageRouter", () => ({
      usePageRouterStore: () => pageRouter,
    }));

    const WelcomePage = (await import("@/pages/WelcomePage")).default;

    const { container } = render(<WelcomePage />);
    await act(async () => {});

    const buttons = Array.from(container.querySelectorAll("button"));
    const browseButton = buttons.find((b) => b.textContent?.includes("welcome.page.acpTitle"));

    expect(browseButton).toBeDefined();

    await act(async () => {
      fireEvent.click(browseButton!);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    await act(async () => {});

    expect(onboardingStart).not.toHaveBeenCalledWith({ stepId: "provider" });
    expect(configPresenter.setSetting).not.toHaveBeenCalledWith("init_complete", true);
    expect(pageRouter.goToNewThread).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(openSettings).toHaveBeenCalledWith({ routeName: "settings-acp" });
  });

  it("opens settings without redirect when already outside the welcome route", async () => {
    vi.resetModules();

    const router = {
      replace: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    };
    const pageRouter = {
      goToNewThread: vi.fn<(...args: any[]) => any>(),
    };
    const configPresenter = {
      setSetting: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    };
    const openSettings = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined);
    const onboardingSetStepStatus = vi.fn<(...args: any[]) => any>().mockResolvedValue({
      status: "active",
      currentStepId: "select-provider",
    });
    const onboardingStart = vi.fn<(...args: any[]) => any>().mockResolvedValue({
      status: "active",
      currentStepId: "select-provider",
    });

    vi.doMock("@api/ConfigClient", () => ({
      createConfigClient: vi.fn<(...args: any[]) => any>(() => ({
        setSetting: configPresenter.setSetting,
        openSettings,
      })),
    }));
    vi.doMock("@api/OnboardingClient", () => ({
      createOnboardingClient: vi.fn<(...args: any[]) => any>(() => ({
        getState: vi.fn<(...args: any[]) => any>().mockResolvedValue({
          version: 4,
          status: "active",
          startedAt: 1,
          completedAt: null,
          lastActiveAt: 1,
          currentStepId: "select-provider",
          steps: [
            {
              id: "select-provider",
              required: true,
              status: "in_progress",
              startedAt: 1,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "provider-api-key",
              required: false,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "provider-model",
              required: false,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "mcp",
              required: false,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "skills",
              required: false,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "switch-agent",
              required: true,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "switch-model",
              required: true,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "first-chat",
              required: true,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
          ],
        }),
        start: onboardingStart,
        setStepStatus: onboardingSetStepStatus,
      })),
    }));
    vi.doMock("@/stores/ui/pageRouter", () => ({
      usePageRouterStore: () => pageRouter,
    }));

    const WelcomePage = (await import("@/pages/WelcomePage")).default;

    const { container } = render(<WelcomePage />);
    await act(async () => {});

    const buttons = Array.from(container.querySelectorAll("button"));
    const browseButton = buttons.find((b) => b.textContent?.includes("welcome.page.browseProviders"));

    expect(browseButton).toBeDefined();

    await act(async () => {
      fireEvent.click(browseButton!);
    });
    await act(async () => {});

    expect(onboardingSetStepStatus).not.toHaveBeenCalled();
    expect(onboardingStart).toHaveBeenCalledWith({ stepId: "select-provider" });
    expect(configPresenter.setSetting).not.toHaveBeenCalledWith("init_complete", true);
    expect(pageRouter.goToNewThread).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    expect(openSettings).toHaveBeenCalledWith({ routeName: "settings-provider" });
  });

  it("uses the primary onboarding action to resume the first chat step", async () => {
    vi.resetModules();

    const router = {
      replace: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    };
    const pageRouter = {
      goToNewThread: vi.fn<(...args: any[]) => any>(),
    };
    const openSettings = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined);
    const onboardingStart = vi.fn<(...args: any[]) => any>().mockResolvedValue({
      status: "active",
      currentStepId: "first-chat",
    });

    vi.doMock("@api/ConfigClient", () => ({
      createConfigClient: vi.fn<(...args: any[]) => any>(() => ({
        openSettings,
      })),
    }));
    vi.doMock("@api/OnboardingClient", () => ({
      createOnboardingClient: vi.fn<(...args: any[]) => any>(() => ({
        getState: vi.fn<(...args: any[]) => any>().mockResolvedValue({
          version: 1,
          status: "active",
          startedAt: 1,
          completedAt: null,
          lastActiveAt: 1,
          currentStepId: "first-chat",
          steps: [
            {
              id: "provider",
              required: true,
              status: "completed",
              startedAt: 1,
              completedAt: 2,
              skippedAt: null,
            },
            {
              id: "first-chat",
              required: true,
              status: "in_progress",
              startedAt: 3,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "switch-model",
              required: true,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "mcp",
              required: false,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "skills",
              required: false,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "plugins",
              required: false,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
          ],
        }),
        start: onboardingStart,
      })),
    }));
    vi.doMock("@/stores/ui/pageRouter", () => ({
      usePageRouterStore: () => pageRouter,
    }));

    const WelcomePage = (await import("@/pages/WelcomePage")).default;

    const { container } = render(<WelcomePage />);
    await act(async () => {});

    await act(async () => {
      fireEvent.click(screen.getByTestId("welcome-guide-primary-action"));
    });

    expect(onboardingStart).toHaveBeenCalledWith({ stepId: "first-chat" });
    expect(pageRouter.goToNewThread).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith({ name: "chat" });
    expect(openSettings).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(GUIDED_ONBOARDING_RESUME_STORAGE_KEY)).toBeNull();
  });

  it("blocks background clicks and lets the spotlight coachmark continue the real select-provider step", async () => {
    vi.resetModules();

    const router = {
      replace: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    };
    const pageRouter = {
      goToNewThread: vi.fn<(...args: any[]) => any>(),
    };
    const openSettings = vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined);
    const onboardingSetStepStatus = vi.fn<(...args: any[]) => any>().mockResolvedValue({
      status: "active",
      currentStepId: "select-provider",
    });
    const onboardingStart = vi.fn<(...args: any[]) => any>().mockResolvedValue({
      status: "active",
      currentStepId: "first-chat",
    });

    vi.doMock("@api/ConfigClient", () => ({
      createConfigClient: vi.fn<(...args: any[]) => any>(() => ({
        openSettings,
      })),
    }));
    vi.doMock("@api/OnboardingClient", () => ({
      createOnboardingClient: vi.fn<(...args: any[]) => any>(() => ({
        getState: vi.fn<(...args: any[]) => any>().mockResolvedValue({
          version: 4,
          status: "active",
          startedAt: 1,
          completedAt: null,
          lastActiveAt: 1,
          currentStepId: "select-provider",
          steps: [
            {
              id: "select-provider",
              required: true,
              status: "in_progress",
              startedAt: 1,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "provider-api-key",
              required: false,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "provider-model",
              required: false,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "mcp",
              required: false,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "skills",
              required: false,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "switch-agent",
              required: true,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "switch-model",
              required: true,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
            {
              id: "first-chat",
              required: true,
              status: "pending",
              startedAt: null,
              completedAt: null,
              skippedAt: null,
            },
          ],
        }),
        start: onboardingStart,
        setStepStatus: onboardingSetStepStatus,
      })),
    }));
    vi.doMock("@/stores/ui/pageRouter", () => ({
      usePageRouterStore: () => pageRouter,
    }));

    const WelcomePage = (await import("@/pages/WelcomePage")).default;

    const { container } = render(<WelcomePage />);
    await act(async () => {});

    const coachmark = screen.getByTestId("welcome-guide-coachmark") as HTMLElement;
    expect(coachmark.getAttribute("data-guide-target")).toBe("providers");
    expect(coachmark).toHaveTextContent("welcome.page.guide.title");

    await act(async () => {
      fireEvent.click(screen.getByTestId("welcome-guide-blocker"));
    });
    await act(async () => {});

    expect(container.querySelector('[data-testid="welcome-guide-coachmark"]')).toBeTruthy();
    expect(openSettings).not.toHaveBeenCalled();
    expect(pageRouter.goToNewThread).not.toHaveBeenCalled();

    expect(container.querySelector('[data-testid="welcome-guide-next-action"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="welcome-guide-coachmark-primary-action"]')).toBeFalsy();
    expect(container.querySelector('[data-testid="welcome-guide-import-action"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="welcome-provider-import-action"]')).toBeFalsy();

    await act(async () => {
      fireEvent.click(screen.getByTestId("welcome-guide-next-action"));
    });
    await act(async () => {});

    expect(onboardingSetStepStatus).not.toHaveBeenCalled();
    expect(onboardingStart).toHaveBeenCalledWith({ stepId: "select-provider" });
    expect(openSettings).toHaveBeenCalledWith({ routeName: "settings-provider" });
    expect(onboardingStart).not.toHaveBeenCalledWith({ stepId: "first-chat" });
    expect(pageRouter.goToNewThread).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalledWith({ name: "chat" });
  });
});
