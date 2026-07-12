import { beforeEach, describe, expect, it } from "vitest";
import {
  consumeStartupDeepLink,
  findDeepLinkArg,
  findStartupDeepLink,
  storeStartupDeepLink,
} from "#/lib/startupDeepLink";

describe("startupDeepLink utilities", () => {
  beforeEach(() => {
    consumeStartupDeepLink();
  });

  it("prefers stored startup deeplink over argv and secondary env keys", () => {
    const env = {
      STARTUP_DEEPLINK: "argos://start?msg=stored",
      DEEPLINK_URL: "argos://start?msg=env",
    } as NodeJS.ProcessEnv;

    expect(findStartupDeepLink(["electron", "argos://start?msg=argv"], env)).toBe("argos://start?msg=stored");
  });

  it("falls back to argv before secondary env deeplinks", () => {
    const env = {
      DEEPLINK_URL: "argos://start?msg=env",
    } as NodeJS.ProcessEnv;

    expect(findStartupDeepLink(["electron", "argos://start?msg=argv"], env)).toBe("argos://start?msg=argv");
  });

  it("stores and consumes startup deeplink exactly once", () => {
    const env = {} as NodeJS.ProcessEnv;

    expect(storeStartupDeepLink("argos://start?msg=hello", env)).toBe("argos://start?msg=hello");
    expect(env.STARTUP_DEEPLINK).toBeUndefined();
    expect(findStartupDeepLink(["electron"], env)).toBe("argos://start?msg=hello");
    expect(consumeStartupDeepLink(env)).toBe("argos://start?msg=hello");
    expect(consumeStartupDeepLink(env)).toBeNull();
  });

  it("finds deeplink arguments from a command line", () => {
    expect(findDeepLinkArg(["electron", "--flag", "argos://provider/install?v=1"])).toBe(
      "argos://provider/install?v=1",
    );
  });

  it("ignores strings that only contain a deeplink later in the value", () => {
    expect(findDeepLinkArg(["electron", "https://example.com/?next=argos://start?msg=1"])).toBe(null);
    expect(findDeepLinkArg(["electron", "prefix argos://start?msg=1"])).toBeNull();
  });
});
