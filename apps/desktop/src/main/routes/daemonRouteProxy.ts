import { getSidecarHandle } from "@/presenter/lifecyclePresenter/hooks/init/daemonSidecarHook";

type DaemonRouteEnvelope = {
  route: string;
  input: unknown;
};

function getDaemonBaseUrl(): string {
  const handle = getSidecarHandle();
  if (!handle || !handle.isRunning()) {
    throw new Error("Daemon is not running");
  }

  return `http://127.0.0.1:${handle.port}`;
}

export async function invokeDaemonRoute<TOutput>(route: string, input: unknown): Promise<TOutput> {
  const baseUrl = getDaemonBaseUrl();
  const response = await fetch(`${baseUrl}/api/v1/route`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ route, input } satisfies DaemonRouteEnvelope),
  });

  const result = (await response.json().catch(() => null)) as
    | { ok: true; output: TOutput }
    | { ok: false; error?: { message?: string } }
    | null;

  if (!response.ok || !result || !("ok" in result) || !result.ok) {
    const message =
      (result && "error" in result && result.error?.message) ||
      `Daemon route ${route} failed (HTTP ${response.status})`;
    throw new Error(message);
  }

  return result.output;
}
