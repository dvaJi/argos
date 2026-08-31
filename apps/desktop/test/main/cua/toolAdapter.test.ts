import { describe, expect, it } from "vitest";

import {
  appendCuaResultProjections,
  buildCuaActionResultProjection,
  buildCuaVerifyStateProjection,
  buildCuaWindowStateProjection,
  normalizeCuaToolArguments,
  validateCuaSnapshotTargetArguments,
} from "@argos/backend-core";

describe("normalizeCuaToolArguments", () => {
  it("strips empty element tokens from snapshot-target tools", () => {
    expect(normalizeCuaToolArguments("click", { element_token: "", element_index: 3 })).toEqual({
      element_index: 3,
    });
  });

  it("keeps non-empty tokens and untouched tools", () => {
    const args = { element_token: "s0a1b2c34:0" };
    expect(normalizeCuaToolArguments("click", args)).toBe(args);
    const scroll = { element_token: "" };
    expect(normalizeCuaToolArguments("zoom", scroll)).toBe(scroll);
  });
});

describe("validateCuaSnapshotTargetArguments", () => {
  it("requires snapshot_id when using a bare element_index", () => {
    expect(validateCuaSnapshotTargetArguments("click", { element_index: 1 })).toMatch(/^snapshot_id_required:/);
    expect(validateCuaSnapshotTargetArguments("click", { element_index: 1, snapshot_id: "s0a1b2c34" })).toBeUndefined();
    expect(
      validateCuaSnapshotTargetArguments("click", { element_index: 1, element_token: "s0a1b2c3:1" }),
    ).toBeUndefined();
    expect(validateCuaSnapshotTargetArguments("click", {})).toBeUndefined();
  });
});

describe("buildCuaWindowStateProjection", () => {
  it("projects validated snapshot handles", () => {
    const projection = buildCuaWindowStateProjection("get_window_state", {
      snapshot_id: "s0a1b2c34",
      elements: [
        { element_index: 0, element_token: "s0a1b2c34:0" },
        { element_index: 1, element_token: "bad" },
      ],
    });

    expect(projection).toContain('snapshot_id="s0a1b2c34"');
    expect(projection).toContain('0="s0a1b2c34:0"');
    expect(projection).toContain("element_tokens.truncated=true");
  });

  it("returns undefined for non-window-state tools", () => {
    expect(buildCuaWindowStateProjection("click", { snapshot_id: "s0a1b2c34" })).toBeUndefined();
  });
});

describe("buildCuaActionResultProjection", () => {
  const validResult = {
    effect: "confirmed",
    route: "accessibility",
    delivery: { mode: "foreground", delivered_count: 1 },
    evidence: [{ kind: "window_change" }],
  };

  it("projects a valid action result", () => {
    const projection = buildCuaActionResultProjection("click", validResult);
    expect(projection).toContain('effect="confirmed"');
    expect(projection).toContain("Action delivery is not task completion");
  });

  it("rejects confirmed results without evidence", () => {
    expect(buildCuaActionResultProjection("click", { effect: "confirmed", route: "accessibility" })).toBeUndefined();
  });

  it("rejects refused results that carry delivery evidence", () => {
    expect(
      buildCuaActionResultProjection("click", {
        effect: "refused",
        route: "accessibility",
        delivery: { mode: "foreground" },
      }),
    ).toBeUndefined();
  });

  it("ignores unknown tools", () => {
    expect(buildCuaActionResultProjection("get_config", validResult)).toBeUndefined();
  });
});

describe("buildCuaVerifyStateProjection", () => {
  it("projects a satisfied verification", () => {
    const projection = buildCuaVerifyStateProjection("verify_state", {
      status: "satisfied",
      stable: true,
      elapsed_ms: 120,
      samples: 2,
      predicates: [{ index: 0, status: "satisfied", unknown_reason: null, observed_json: "{}" }],
    });

    expect(projection).toContain('status="satisfied"');
    expect(projection).toContain('Only status="satisfied" with stable=true is success');
  });

  it("rejects malformed predicates", () => {
    expect(
      buildCuaVerifyStateProjection("verify_state", {
        status: "satisfied",
        stable: true,
        elapsed_ms: 0,
        samples: 1,
        predicates: [],
      }),
    ).toBeUndefined();
  });
});

describe("appendCuaResultProjections", () => {
  it("flags invalid action results so the model cannot infer success", () => {
    const content = appendCuaResultProjections("ok", "click", { unrelated: true }, false);
    expect(typeof content).toBe("string");
    expect(content).toContain("invalid_action_result");
  });

  it("flags invalid verification results", () => {
    const content = appendCuaResultProjections("ok", "verify_state", { broken: true }, false);
    expect(content).toContain("invalid_verify_state_result");
  });

  it("skips projections on error results but still projects refusals", () => {
    const errored = appendCuaResultProjections("boom", "click", { effect: "confirmed" }, true);
    expect(errored).toBe("boom");

    const refused = appendCuaResultProjections("denied", "click", { refusal: { code: "permission_required" } }, true);
    expect(refused).toContain("structured refusal");
  });
});
