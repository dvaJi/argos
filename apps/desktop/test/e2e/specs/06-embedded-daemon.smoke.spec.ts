import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "../fixtures/electronApp";
import { waitForAppReady } from "../helpers/wait";

/** The preload bridge, as far as this spec touches it (renderer globals aren't typed in e2e). */
type BridgeWindow = {
  argos?: {
    connection?: { getState?: () => unknown };
    invoke?: (route: string, input: unknown) => Promise<unknown>;
  };
};

process.env.ARGOS_USER_DATA_DIR = mkdtempSync(join(tmpdir(), "argos-e2e-embedded-daemon-"));

test("embedded daemon bridge comes up with the desktop app @smoke", async ({ app }) => {
  await waitForAppReady(app.page);

  await expect
    .poll(
      async () =>
        await app.page.evaluate(() => {
          const state = (window as unknown as BridgeWindow).argos?.connection?.getState?.();
          return state && typeof state === "object"
            ? (state as { mode?: string; connected?: boolean }).connected === true
              ? ((state as { mode?: string }).mode ?? null)
              : null
            : null;
        }),
      {
        timeout: 60_000,
        intervals: [500, 1_000, 2_000],
      },
    )
    .toBe("local");

  const bootstrap = await app.page.evaluate(async () => {
    return await (window as unknown as BridgeWindow).argos?.invoke?.("startup.getBootstrap", {});
  });

  expect(bootstrap).toMatchObject({
    bootstrap: expect.any(Object),
  });
});
