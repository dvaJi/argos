import { type PlanInput, planInputSchema } from "./planTool";

interface PlanStore {
  getPlanJson(sessionId: string): Promise<string | null>;
  /** Persists the plan; the repository emits `sessions.updated` for the session. */
  setPlanJson(sessionId: string, planJson: string | null): Promise<void>;
}

export interface StoredPlan extends PlanInput {
  revision: number;
  updatedAt: string;
}

/**
 * Stores the plan submitted in plan mode. The UI reads it through
 * `sessions.getPlan` and refreshes on `sessions.updated`. It is deliberately not
 * published as `chat.plan.updated`: that event drives the compact todo-progress
 * float, which cannot hold a full implementation plan (long steps, files,
 * risks, verification) and covered the chat when it tried.
 */
export class DaemonPlanRuntime {
  constructor(
    private readonly deps: {
      sessionRepository: PlanStore;
    },
  ) {}

  async submit(sessionId: string, input: unknown): Promise<StoredPlan> {
    const parsed = planInputSchema.parse(input);
    const current = await this.get(sessionId);
    const revision = (current?.revision ?? 0) + 1;
    const plan: StoredPlan = {
      ...parsed,
      revision,
      updatedAt: new Date().toISOString(),
    };
    await this.deps.sessionRepository.setPlanJson(sessionId, JSON.stringify(plan));
    return plan;
  }

  async get(sessionId: string): Promise<StoredPlan | null> {
    const raw = await this.deps.sessionRepository.getPlanJson(sessionId);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as StoredPlan;
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  async clear(sessionId: string): Promise<void> {
    await this.deps.sessionRepository.setPlanJson(sessionId, null);
  }
}
