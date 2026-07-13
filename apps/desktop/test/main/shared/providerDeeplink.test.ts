import { describe, expect, it } from "vitest";
import { isProviderDbBackedProvider } from "@argos/shared/providerDeeplink";

describe("provider deeplink metadata", () => {
  it("treats Mistral as provider DB-backed", () => {
    expect(isProviderDbBackedProvider("mistral")).toBe(true);
    expect(isProviderDbBackedProvider(" MISTRAL ")).toBe(true);
  });
});
