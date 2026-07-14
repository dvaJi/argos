import { describe, expect, it } from "vitest";
import { ensureJsonSerializableRouteResponse } from "../src/transport/http";

describe("daemon route response serialization", () => {
  it("keeps valid route responses unchanged", () => {
    const response = { ok: true as const, output: { id: "agent-1" } };
    expect(ensureJsonSerializableRouteResponse(response)).toBe(response);
  });

  it("turns cyclic route output into a transport error", () => {
    const output: { self?: unknown } = {};
    output.self = output;

    expect(ensureJsonSerializableRouteResponse({ ok: true, output })).toEqual({
      ok: false,
      error: {
        code: "serialization_error",
        message: "Route returned a value that cannot be sent to the client",
      },
    });
  });
});
