import { describe, expect, it, vi } from "vitest";
import { createDaemonDispatcher } from "../src/dispatch/daemonDispatcher";

describe("sessions.create", () => {
  it("starts its initial prompt through provider execution", async () => {
    const session = {
      id: "session-1",
      agentId: "argos",
      title: "Hello",
      projectDir: null,
      isPinned: false,
      isDraft: false,
      sessionKind: "regular",
      parentSessionId: null,
      subagentEnabled: true,
      subagentMeta: null,
      createdAt: 1,
      updatedAt: 1,
      status: "idle",
      providerId: "deepseek",
      modelId: "deepseek-chat",
    };
    const sessionRepository = {
      create: vi.fn(async () => session),
    };
    const providerExecutionPort = {
      sendMessage: vi.fn(async () => ({ requestId: "request-1", messageId: "message-1" })),
    };
    const dispatch = createDaemonDispatcher(
      {} as any,
      {} as any,
      sessionRepository as any,
      providerExecutionPort as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      dispatch("sessions.create", {
        agentId: "argos",
        message: "Hello",
        files: [],
        providerId: "deepseek",
        modelId: "deepseek-chat",
      }),
    ).resolves.toEqual({ session });

    expect(providerExecutionPort.sendMessage).toHaveBeenCalledWith("session-1", {
      text: "Hello",
      files: [],
    });
  });
});
