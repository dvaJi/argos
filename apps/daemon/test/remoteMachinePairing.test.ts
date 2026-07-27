import { describe, expect, test } from "vitest";
import { classifyRemoteMachineTransportError, parseRemoteMachinePairingLink } from "@argos/shared/remoteMachinePairing";

describe("remote machine pairing links", () => {
  test("normalizes canonical and legacy pairing paths without retaining the token in the endpoint", () => {
    expect(parseRemoteMachinePairingLink("https://build.example.test/pair?token=one-time-token")).toEqual({
      ok: true,
      value: { remoteUrl: "https://build.example.test", token: "one-time-token" },
    });
    expect(parseRemoteMachinePairingLink("https://build.example.test/?token=legacy-token")).toEqual({
      ok: true,
      value: { remoteUrl: "https://build.example.test", token: "legacy-token" },
    });
  });

  test("rejects unsafe or malformed links with stable recovery codes", () => {
    expect(parseRemoteMachinePairingLink("https://user:pass@build.example.test/pair?token=x")).toMatchObject({
      ok: false,
      error: { code: "pairing_invalid" },
    });
    expect(parseRemoteMachinePairingLink("ftp://build.example.test/pair?token=x")).toMatchObject({
      ok: false,
      error: { code: "pairing_invalid" },
    });
    expect(parseRemoteMachinePairingLink("https://build.example.test/not-a-pair?token=x")).toMatchObject({
      ok: false,
      error: { code: "pairing_invalid" },
    });
    expect(parseRemoteMachinePairingLink("http://127.0.0.1:3800/pair?token=x")).toMatchObject({
      ok: false,
      error: { code: "endpoint_loopback_remote" },
    });
  });

  test("classifies TLS and reachability failures without exposing transport details", () => {
    expect(classifyRemoteMachineTransportError(new Error("certificate verify failed"))).toBe("tls_untrusted");
    expect(classifyRemoteMachineTransportError(new Error("connect ECONNREFUSED"))).toBe("endpoint_unreachable");
  });
});
