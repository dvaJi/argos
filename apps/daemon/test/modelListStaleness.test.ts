import { describe, expect, it } from "bun:test";
import {
  isStoredModelListStale,
  MODEL_LIST_MAX_AGE_MS,
  MODEL_LIST_SCHEMA_VERSION,
} from "../src/host/daemonConfigPresenter";

const model = { id: "m", name: "m", group: "default", providerId: "p" };
const now = 1_800_000_000_000;

describe("isStoredModelListStale", () => {
  it("is fresh for a current-schema list fetched within the max age", () => {
    expect(
      isStoredModelListStale(
        { models: [model], modelsFetchedAt: now - 1000, modelsSchemaVersion: MODEL_LIST_SCHEMA_VERSION },
        now,
      ),
    ).toBe(false);
  });

  it("is stale when empty, unversioned, from an older schema, or too old", () => {
    expect(isStoredModelListStale({ models: [] }, now)).toBe(true);
    expect(isStoredModelListStale({ models: [model] }, now)).toBe(true);
    expect(
      isStoredModelListStale(
        { models: [model], modelsFetchedAt: now, modelsSchemaVersion: MODEL_LIST_SCHEMA_VERSION - 1 },
        now,
      ),
    ).toBe(true);
    expect(
      isStoredModelListStale(
        {
          models: [model],
          modelsFetchedAt: now - MODEL_LIST_MAX_AGE_MS - 1,
          modelsSchemaVersion: MODEL_LIST_SCHEMA_VERSION,
        },
        now,
      ),
    ).toBe(true);
  });
});
