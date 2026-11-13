import { afterEach, describe, expect, it } from "bun:test";
import {
  PERMISSION_AUTO_APPROVE_THRESHOLD,
  buildPermissionGateRequest,
  resolvePermissionAutoApproval,
  type DecisionsAnswerMap,
} from "@argos/backend-core";

const noulAnswer = (p: number): DecisionsAnswerMap => ({ safe_unattended: { type: "noul", noul: p } });

describe("buildPermissionGateRequest", () => {
  it("shapes the tool call into state and one noul question", () => {
    const request = buildPermissionGateRequest({
      toolName: "bash",
      input: { command: "rm -rf /" },
      permissionMode: "default",
    });
    expect(request.state).toEqual({
      tool_name: "bash",
      tool_input: { command: "rm -rf /" },
      permission_mode: "default",
    });
    expect(Object.keys(request.questions)).toEqual(["safe_unattended"]);
    expect(request.questions.safe_unattended.type).toBe("noul");
  });

  it("omits permission_mode and normalizes missing input", () => {
    const request = buildPermissionGateRequest({ toolName: "read", input: undefined });
    expect(request.state).toEqual({ tool_name: "read", tool_input: {} });
  });
});

describe("resolvePermissionAutoApproval", () => {
  it("approves at or above the threshold with the probability attached", () => {
    expect(resolvePermissionAutoApproval(noulAnswer(PERMISSION_AUTO_APPROVE_THRESHOLD))).toEqual({
      outcome: "approve",
      probability: PERMISSION_AUTO_APPROVE_THRESHOLD,
    });
    expect(resolvePermissionAutoApproval(noulAnswer(0.99))).toEqual({ outcome: "approve", probability: 0.99 });
  });

  it("asks the human below the threshold — never denies", () => {
    expect(resolvePermissionAutoApproval(noulAnswer(PERMISSION_AUTO_APPROVE_THRESHOLD - 0.01))).toEqual({
      outcome: "ask",
    });
    expect(resolvePermissionAutoApproval(noulAnswer(0))).toEqual({ outcome: "ask" });
  });

  it("is inconclusive on missing, refused, or invalid answers", () => {
    expect(resolvePermissionAutoApproval({})).toEqual({ outcome: "inconclusive" });
    expect(resolvePermissionAutoApproval({ safe_unattended: { type: "refusal" } })).toEqual({
      outcome: "inconclusive",
    });
    expect(resolvePermissionAutoApproval({ safe_unattended: { type: "noul", noul: Number.NaN } })).toEqual({
      outcome: "inconclusive",
    });
  });
});
