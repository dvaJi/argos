import type * as schema from "@agentclientprotocol/sdk";

/**
 * Default time to wait for a permission resolver (typically a human decision)
 * before defaulting to a cancelled outcome. Prevents an agent turn from hanging
 * forever when no client ever answers the permission overlay.
 */
export const DEFAULT_PERMISSION_RESOLVER_TIMEOUT_MS = 5 * 60_000;

/**
 * Race a permission resolver against a timeout. If the resolver does not settle
 * within `timeoutMs`, resolve with a cancelled outcome and invoke `onTimeout`
 * for cleanup. A non-positive `timeoutMs` disables the timeout.
 */
export async function resolvePermissionWithTimeout(
  resolver: () => Promise<schema.RequestPermissionResponse>,
  timeoutMs: number,
  onTimeout?: () => void,
): Promise<schema.RequestPermissionResponse> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return resolver();
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<schema.RequestPermissionResponse>((resolve) => {
    timer = setTimeout(() => {
      onTimeout?.();
      resolve({ outcome: { outcome: "cancelled" } });
    }, timeoutMs);
  });

  try {
    return await Promise.race([resolver(), timeoutPromise]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
