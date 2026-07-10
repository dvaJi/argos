import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createDaemonDispatcher } from "../src/dispatch/daemonDispatcher";
import { DaemonConfigPresenter } from "../src/host/daemonConfigPresenter";
import { sessionsResumePendingQueueRoute } from "@argos/shared-contracts/routes";

describe("daemon resume pending queue", () => {
  it("resolves the compatibility resume route through the daemon session repository", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "argos-daemon-resume-pending-"));
    try {
      const configPresenter = new DaemonConfigPresenter(path.join(root, "config"), path.join(root, "data"));
      const sessionRepository = {
        resumePendingQueue: vi.fn(async (_sessionId: string) => {}),
      };
      const dispatcher = createDaemonDispatcher(configPresenter as any, undefined, sessionRepository as any);

      await expect(dispatcher(sessionsResumePendingQueueRoute.name, { sessionId: "session-1" })).resolves.toEqual({
        resumed: true,
      });
      expect(sessionRepository.resumePendingQueue).toHaveBeenCalledWith("session-1");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
