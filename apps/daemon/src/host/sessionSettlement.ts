import type { PendingSessionInputRecord } from "@argos/shared/types/agent-interface";

/**
 * Settlement for session ownership changes (delete / move / agent removal).
 *
 * Mirrors the upstream DeepChat fix for "allow uninstall while disabled"
 * (ThinkInAIXYZ/deepchat#2188), re-implemented natively for Argos' daemon-owned
 * session architecture:
 *
 * 1. Discard queue-mode pending inputs — they belong to no turn yet and would
 *    otherwise leak onto the next owner. Steer-mode inputs are kept on purpose:
 *    they are conversation facts, and a cancelled run cannot claim them because
 *    `cancelGeneration` suppresses the pending-input drain.
 * 2. Cancel an active generation and wait (bounded) for the session status to
 *    leave `generating` — cancellation settles asynchronously, so proceeding
 *    immediately would race the runtime.
 * 3. Purge durable ACP bindings (`acp_sessions` rows) best-effort so the ACP
 *    uninstall guard becomes accurate after the sessions are gone.
 */

export interface SettleSessionHost {
  getSession(sessionId: string): Promise<{ status?: string | null } | null>;
  listPendingInputs(sessionId: string): Promise<PendingSessionInputRecord[]>;
  deletePendingInput(sessionId: string, itemId: string): Promise<void>;
  cancelGeneration(sessionId: string): Promise<void>;
  purgeAcpSessionData?(sessionId: string): Promise<void>;
}

export interface SettleSessionOptions {
  /** Max time to wait for a cancelled generation to settle. Default 10s. */
  timeoutMs?: number;
  /** Poll interval while waiting for settlement. Default 100ms. */
  pollIntervalMs?: number;
  /** Injectable delay for tests. */
  delay?: (ms: number) => Promise<void>;
}

export interface SettleSessionResult {
  cancelled: boolean;
  discardedQueueInputIds: string[];
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_POLL_INTERVAL_MS = 100;

export async function settleSessionForOwnershipChange(
  sessionId: string,
  host: SettleSessionHost,
  options: SettleSessionOptions = {},
): Promise<SettleSessionResult> {
  const delay = options.delay ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const discardedQueueInputIds = await discardQueueInputs(sessionId, host);

  let cancelled = false;
  if ((await currentStatus(sessionId, host)) === "generating") {
    cancelled = true;
    await host.cancelGeneration(sessionId);
    await waitForSettle(sessionId, host, delay, options);
  }

  // Fail-closed: a durable binding that cannot be purged would leave the ACP
  // uninstall guard stuck with no conversation left to retry against, so the
  // ownership change must abort instead of proceeding.
  await host.purgeAcpSessionData?.(sessionId);

  return { cancelled, discardedQueueInputIds };
}

async function currentStatus(sessionId: string, host: SettleSessionHost): Promise<string | null> {
  // Propagate read failures: treating a transient error as "not generating"
  // could skip cancellation and race a still-running turn.
  const session = await host.getSession(sessionId);
  return session?.status ?? null;
}

async function discardQueueInputs(sessionId: string, host: SettleSessionHost): Promise<string[]> {
  // Fail-closed: if queued inputs cannot be enumerated, the ownership change
  // must stop — leaked inputs would drain under the new owner.
  const inputs = await host.listPendingInputs(sessionId);
  const discarded: string[] = [];
  for (const input of inputs) {
    if (input.mode !== "queue") continue;
    await host.deletePendingInput(sessionId, input.id);
    discarded.push(input.id);
  }
  return discarded;
}

async function waitForSettle(
  sessionId: string,
  host: SettleSessionHost,
  delay: (ms: number) => Promise<void>,
  options: SettleSessionOptions,
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await delay(pollIntervalMs);
    if ((await currentStatus(sessionId, host)) !== "generating") {
      return;
    }
  }
  throw new Error(`Session ${sessionId} did not stop before ownership change.`);
}
