import { describe, expect, it, vi } from "vitest";
import { BunEventPublisher } from "../src/host/bun-event-publisher";

describe("BunEventPublisher session revocation", () => {
  it("closes an idle event socket for the revoked session only", () => {
    const publisher = new BunEventPublisher();
    const revoked = {
      data: { subscriptions: new Set<string>(), authContext: { sessionId: "revoked-session" } },
      close: vi.fn(),
    };
    const active = {
      data: { subscriptions: new Set<string>(), authContext: { sessionId: "active-session" } },
      close: vi.fn(),
    };
    publisher.addClient(revoked as any);
    publisher.addClient(active as any);

    publisher.revokeSession("revoked-session");

    expect(revoked.close).toHaveBeenCalledWith(4001, "Session revoked");
    expect(active.close).not.toHaveBeenCalled();
  });
});
