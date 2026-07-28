import { describe, expect, test } from "vitest";
import { createDaemonDispatcher } from "../src/dispatch/daemonDispatcher";
import { connectionDescribeEnvironmentRoute } from "@argos/shared-contracts/routes";

describe("connection.describeEnvironment", () => {
  test("returns a redacted, event-ready capability handshake", async () => {
    const dispatch = createDaemonDispatcher({} as any);
    const result = await dispatch(connectionDescribeEnvironmentRoute.name, {
      runtimeKind: "browser",
      protocolVersion: 1,
    });

    expect(result).toMatchObject({
      environmentId: "unknown",
      runtimeKind: "daemon",
      compatible: true,
      eventTransport: { ready: true, protocol: "argos-v1" },
    });
    expect(JSON.stringify(result)).not.toContain("apiKey");
    expect(JSON.stringify(result)).not.toContain("dataDir");
  });
});
