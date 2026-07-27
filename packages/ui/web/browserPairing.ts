export type BrowserPairingResponse = {
  ok: boolean;
  error?: { code?: string; message?: string };
};

export async function exchangeBrowserPairingToken(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<BrowserPairingResponse> {
  try {
    const response = await fetchImpl("/api/v1/pair", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ token, kind: "browser" }),
    });
    const body = (await response.json().catch(() => ({}))) as BrowserPairingResponse;
    return response.ok && body.ok ? { ok: true } : { ok: false, error: body.error };
  } catch {
    return { ok: false };
  }
}

export function stripPairingToken(href: string): string {
  const url = new URL(href);
  url.searchParams.delete("token");
  return url.toString();
}
