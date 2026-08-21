/**
 * built-in knowledge destroy hook
 *
 * The knowledge engine is daemon-hosted (docs/architecture/daemon-knowledge-runtime).
 * Before quitting we check the daemon's ingestion task queue and ask the user
 * to confirm when files are still being processed.
 */

import { LifecycleHook, LifecycleContext } from "@argos/shared/presenter";
import { presenter } from "#/presenter";
import { LifecyclePhase } from "@argos/shared/lifecycle";
import { knowledgeGetTaskQueueStatusRoute } from "@argos/shared-contracts/routes";
import { DIALOG_WARN } from "@argos/shared/dialog";
import { invokeDaemonRoute } from "#/routes/daemonRouteProxy";

export const builtinKnowledgeDestroyHook: LifecycleHook = {
  name: "builtinKnowledge-destroy",
  phase: LifecyclePhase.BEFORE_QUIT,
  priority: 1, // will block app quit, mush first
  critical: false,
  execute: async (_context: LifecycleContext) => {
    console.log("builtinKnowledgeDestroyHook: Check daemon knowledge tasks");

    // Ensure presenter is available
    if (!presenter) {
      throw new Error("builtinKnowledgeDestroyHook: Presenter has been destroyed");
    }

    try {
      const result = await invokeDaemonRoute<{ status: { totalTasks: number } }>(
        knowledgeGetTaskQueueStatusRoute.name,
        {},
      );
      if (result.status.totalTasks === 0) {
        return true;
      }
    } catch (error) {
      // Daemon not reachable: nothing to wait for.
      console.warn("builtinKnowledgeDestroyHook: task queue check failed:", error);
      return true;
    }

    // Knowledge ingestion tasks are still running; ask the user to confirm quit.
    const choice = await presenter.dialogPresenter.showDialog({
      title: "settings.knowledgeBase.dialog.beforequit.title",
      description: "settings.knowledgeBase.dialog.beforequit.description",
      icon: DIALOG_WARN,
      buttons: [
        { key: "cancel", label: "settings.knowledgeBase.dialog.beforequit.cancel" },
        { key: "confirm", label: "settings.knowledgeBase.dialog.beforequit.confirm", default: true },
      ],
      timeout: 10000,
    });
    if (choice === "confirm") {
      console.log("builtinKnowledgeDestroyHook: user confirmed quit with running tasks");
    } else {
      console.log("builtinKnowledgeDestroyHook: user canceled close confirm");
    }
    return choice === "confirm";
  },
};
