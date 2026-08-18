import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "bun:test";
import { createDaemonDispatcher } from "../src/dispatch/daemonDispatcher";
import { DaemonConfigPresenter } from "../src/host/daemonConfigPresenter";
import { skillsOpenFolderRoute } from "@argos/shared-contracts/routes";

describe("daemon skill routes", () => {
  it("rejects opening the skills folder in daemon mode", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "argos-daemon-skill-routes-"));
    try {
      const configPresenter = new DaemonConfigPresenter(path.join(root, "config"), path.join(root, "data"));
      const dispatcher = createDaemonDispatcher(configPresenter as any);

      await expect(dispatcher(skillsOpenFolderRoute.name, {})).rejects.toThrow(
        "Opening the skills folder is not available in daemon mode.",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
