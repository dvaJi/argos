import { LifecycleHook, LifecycleContext } from "@argos/shared/presenter";
import { LifecyclePhase } from "@argos/shared/lifecycle";
import { presenter } from "#/presenter";

export const usageStatsBackfillHook: LifecycleHook = {
  name: "usage-stats-backfill",
  phase: LifecyclePhase.AFTER_START,
  priority: 21,
  critical: false,
  execute: async (_context: LifecycleContext) => {
    if (!presenter) {
      throw new Error("usageStatsBackfillHook: Presenter not initialized");
    }

    const agentSessionPresenter = presenter.agentSessionPresenter as unknown as {
      startUsageStatsBackfill?: () => Promise<void>;
    };
    if (!agentSessionPresenter.startUsageStatsBackfill) {
      return;
    }

    void agentSessionPresenter.startUsageStatsBackfill().catch((error) => {
      console.error("usageStatsBackfillHook: failed to start usage stats backfill:", error);
    });
  },
};
