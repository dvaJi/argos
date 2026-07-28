import { describe, expect, it, vi } from "vitest";
import { exchangeBrowserPairingToken, stripPairingToken } from "../../../../packages/ui/web/browserPairing";

describe("browser pairing bootstrap", () => {
  it("exchanges the one-time token with same-origin credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await expect(exchangeBrowserPairingToken("one-time-token", fetchMock)).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/pair",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({ token: "one-time-token", kind: "browser" }),
      }),
    );
  });

  it("removes pairing material while preserving unrelated query and hash state", () => {
    expect(stripPairingToken("https://daemon.test/?token=one-time&theme=dark#settings")).toBe(
      "https://daemon.test/?theme=dark#settings",
    );
  });
});
