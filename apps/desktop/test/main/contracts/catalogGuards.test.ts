import { AssistantMessageBlockSchema } from "@shared/contracts/common";
import { hasArgosEventContract } from "@shared/contracts/events";
import { hasArgosRouteContract, SettingsChangeSchema } from "@shared/contracts/routes";

describe("contract runtime guards", () => {
  it("rejects inherited event and route keys", () => {
    expect(hasArgosEventContract("toString")).toBe(false);
    expect(hasArgosRouteContract("toString")).toBe(false);
  });

  it("rejects non-JSON values in assistant block extra", () => {
    expect(() =>
      AssistantMessageBlockSchema.parse({
        type: "content",
        content: "hello",
        status: "pending",
        timestamp: 1,
        extra: {
          invalid: () => "nope",
        },
      }),
    ).toThrow("expected error");
  });

  it("enforces numeric settings bounds at the route boundary", () => {
    expect(() =>
      SettingsChangeSchema.parse({
        key: "fontSizeLevel",
        value: 5,
      }),
    ).toThrow("expected error");

    expect(() =>
      SettingsChangeSchema.parse({
        key: "autoCompactionTriggerThreshold",
        value: 100,
      }),
    ).toThrow("expected error");

    expect(() =>
      SettingsChangeSchema.parse({
        key: "autoCompactionRetainRecentPairs",
        value: 0,
      }),
    ).toThrow("expected error");
  });
});
