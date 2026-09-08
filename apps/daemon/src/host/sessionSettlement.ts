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

  try {
    await host.purgeAcpSessionData?.(sessionId);
  } catch {
    // best-effort: purge failures must not block the ownership change
  }

  return { cancelled, discardedQueueInputIds };
}

async function currentStatus(sessionId: string, host: SettleSessionHost): Promise<string | null> {
  const session = await host.getSession(sessionId).catch(() => null);
  return session?.status ?? null;
}

async function discardQueueInputs(sessionId: string, host: SettleSessionHost): Promise<string[]> {
  const inputs = await host.listPendingInputs(sessionId).catch(() => [] as PendingSessionInputRecord[]);
  const discarded: string[] = [];
  for (const input of inputs) {
    if (input.mode !== "queue") continue;
    try {
      await host.deletePendingInput(sessionId, input.id);
      discarded.push(input.id);
    } catch {
      // A queued input that cannot be discarded must not block removal
      // outright, but it also must not be silently lost: leave it in place.
    }
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
