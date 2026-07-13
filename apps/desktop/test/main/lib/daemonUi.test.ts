import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("#/presenter/lifecyclePresenter/hooks/init/daemonSidecarHook", () => ({
  getSidecarHandle: vi.fn(() => null),
}));

const originalUiDevServerUrl = process.env.ARGOS_UI_DEV_SERVER_URL;
const originalViteDevServerUrl = process.env.VITE_DEV_SERVER_URL;

afterEach(() => {
  if (originalUiDevServerUrl === undefined) delete process.env.ARGOS_UI_DEV_SERVER_URL;
  else process.env.ARGOS_UI_DEV_SERVER_URL = originalUiDevServerUrl;

  if (originalViteDevServerUrl === undefined) delete process.env.VITE_DEV_SERVER_URL;
  else process.env.VITE_DEV_SERVER_URL = originalViteDevServerUrl;
});

describe("daemonUi", () => {
  it("uses the explicit UI dev server instead of Vite's shell renderer URL", async () => {
    process.env.ARGOS_UI_DEV_SERVER_URL = "http://127.0.0.1:5180";
    process.env.VITE_DEV_SERVER_URL = "http://localhost:5173";

    const { getDevServerBase, resolveUiUrl } = await import("#/lib/daemonUi");

    expect(getDevServerBase()).toBe("http://127.0.0.1:5180");
    expect(resolveUiUrl("/#/chat")).toBe("http://127.0.0.1:5180/#/chat");
  });

  it("does not use Vite's internal shell renderer URL as the app UI", async () => {
    delete process.env.ARGOS_UI_DEV_SERVER_URL;
    process.env.VITE_DEV_SERVER_URL = "http://localhost:5173";

    const { getDevServerBase } = await import("#/lib/daemonUi");

    expect(getDevServerBase()).toBeNull();
  });
});
