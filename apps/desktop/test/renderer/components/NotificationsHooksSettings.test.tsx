import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import NotificationsHooksSettings from "#settings/components/NotificationsHooksSettings";

const { configPresenter, toast } = vi.hoisted(() => ({
  configPresenter: {
    getHooksNotificationsConfig: vi.fn<(...args: any[]) => any>(),
    setHooksNotificationsConfig: vi.fn<(...args: any[]) => any>(),
    testHookCommand: vi.fn<(...args: any[]) => any>(),
  },
  toast: vi.fn<(...args: any[]) => any>(),
}));

vi.mock("@iconify/react", () => ({
  Icon: () => null,
}));

vi.mock("#api/presenterBridge", () => ({
  useLegacyPresenter: () => configPresenter,
}));

vi.mock("#/components/use-toast", () => ({
  useToast: () => ({ toast }),
}));

describe("NotificationsHooksSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configPresenter.getHooksNotificationsConfig.mockResolvedValue({ hooks: [] });
    configPresenter.setHooksNotificationsConfig.mockImplementation(async (config) => config);
  });

  it("persists and retains a newly added hook", async () => {
    render(<NotificationsHooksSettings />);

    const addButton = await screen.findByTestId("notifications-hooks-add");
    fireEvent.click(addButton);

    await waitFor(() => {
      expect(configPresenter.setHooksNotificationsConfig).toHaveBeenCalledTimes(1);
    });

    const savedConfig = configPresenter.setHooksNotificationsConfig.mock.calls[0][0];
    expect(savedConfig.hooks).toHaveLength(1);
    expect(savedConfig.hooks[0]).toMatchObject({
      name: "Hook 1",
      enabled: false,
      command: "",
    });
    expect(screen.getByTestId(`notifications-hook-${savedConfig.hooks[0].id}`)).toBeTruthy();
    expect(screen.queryByTestId("notifications-hooks-empty")).toBeNull();
  });
});
