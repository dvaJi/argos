import { getDaemonUiBase } from "./daemonUi";

/**
 * Call a daemon route directly from the Electron main process.
 * Uses the local daemon HTTP endpoint.
 */
export async function callDaemonRoute<T>(route: string, input: unknown): Promise<T> {
  const baseUrl = getDaemonUiBase();
  const response = await fetch(`${baseUrl}/api/v1/route`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ route, input }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error");
    throw new Error(`Daemon route ${route} failed: ${response.status} ${text}`);
  }

  const result = (await response.json()) as { ok: boolean; data?: T; error?: { code: string; message: string } };
  if (!result.ok || result.error) {
    throw new Error(`Daemon route ${route} error: ${result.error?.message ?? "Unknown error"}`);
  }

  return result.data as T;
}
