import { describe, it, expect } from "vitest";
import { useSearchConfig } from "@/composables/useSearchConfig";

describe("useSearchConfig", () => {
  it("computes visibility and option availability from capabilities", () => {
    const supportsSearch = { value: true } as { value: boolean | null };
    const searchDefaults = {
      value: {
        forced: true as boolean | undefined,
        strategy: "turbo" as "turbo" | "max" | undefined,
      },
    };

    const api = useSearchConfig({ supportsSearch, searchDefaults });
    expect(api.showSearchConfig.value).toBe(true);
    expect(api.hasForcedSearchOption.value).toBe(true);
    expect(api.hasSearchStrategyOption.value).toBe(true);

    supportsSearch.value = null;
    expect(api.showSearchConfig.value).toBe(false);

    supportsSearch.value = true;
    searchDefaults.value = {};
    expect(api.hasForcedSearchOption.value).toBe(false);
    expect(api.hasSearchStrategyOption.value).toBe(false);
  });
});
