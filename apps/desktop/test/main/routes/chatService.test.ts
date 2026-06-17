import { ChatService } from "@/routes/chat/chatService";

describe("ChatService", () => {
  const createScheduler = () => ({
    sleep: vi.fn<(...args: any[]) => any>(),
    timeout: vi.fn<(...args: any[]) => any>(async <T>({ task }: { task: Promise<T> }) => await task),
    retry: vi.fn<(...args: any[]) => any>(),
  });

  it("sends messages through the scheduler after resolving the session owner", async () => {
    const scheduler = createScheduler();
    const sessionRepository = {
      get: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        id: "session-1",
        agentId: "argos",
      }),
    };
    const messageRepository = {
      listBySession: vi.fn<(...args: any[]) => any>(),
      get: vi.fn<(...args: any[]) => any>(),
    };
    const providerExecutionPort = {
      sendMessage: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        requestId: null,
        messageId: null,
      }),
      steerActiveTurn: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      cancelGeneration: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      respondToolInteraction: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        resumed: true,
      }),
    };
    const providerCatalogPort = {
      getAgentType: vi.fn<(...args: any[]) => any>().mockResolvedValue("argos"),
    };
    const sessionPermissionPort = {
      clearSessionPermissions: vi.fn<(...args: any[]) => any>(),
    };

    const service = new ChatService({
      sessionRepository: sessionRepository as any,
      messageRepository: messageRepository as any,
      providerExecutionPort,
      providerCatalogPort,
      sessionPermissionPort,
      scheduler,
    });

    await expect(service.sendMessage("session-1", "hello")).resolves.toEqual({
      accepted: true,
      requestId: null,
      messageId: null,
    });

    expect(sessionRepository.get).toHaveBeenCalledWith("session-1");
    expect(providerCatalogPort.getAgentType).toHaveBeenCalledWith("argos");
    expect(providerExecutionPort.sendMessage).toHaveBeenCalledWith("session-1", "hello");
    expect(messageRepository.listBySession).not.toHaveBeenCalled();
    expect(scheduler.timeout).toHaveBeenCalledTimes(3);
  });

  it("steers the active turn without claiming the normal send lock", async () => {
    const scheduler = createScheduler();
    const sessionRepository = {
      get: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        id: "session-1",
        agentId: "argos",
      }),
    };
    const providerExecutionPort = {
      sendMessage: vi.fn<(...args: any[]) => any>(),
      steerActiveTurn: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      cancelGeneration: vi.fn<(...args: any[]) => any>(),
      respondToolInteraction: vi.fn<(...args: any[]) => any>(),
    };

    const service = new ChatService({
      sessionRepository: sessionRepository as any,
      messageRepository: {
        listBySession: vi.fn<(...args: any[]) => any>(),
        get: vi.fn<(...args: any[]) => any>(),
      } as any,
      providerExecutionPort,
      providerCatalogPort: {
        getAgentType: vi.fn<(...args: any[]) => any>(),
      } as any,
      sessionPermissionPort: {
        clearSessionPermissions: vi.fn<(...args: any[]) => any>(),
      },
      scheduler,
    });

    await expect(service.steerActiveTurn("session-1", "refine this")).resolves.toEqual({
      accepted: true,
    });

    expect(sessionRepository.get).toHaveBeenCalledWith("session-1");
    expect(providerExecutionPort.steerActiveTurn).toHaveBeenCalledWith("session-1", "refine this");
    expect(scheduler.timeout).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "chat.steerActiveTurn:session-1",
      }),
    );
  });

  it("resolves stopStream by request id and clears permissions before cancelling", async () => {
    const scheduler = createScheduler();
    const sessionRepository = {
      get: vi.fn<(...args: any[]) => any>(),
    };
    const messageRepository = {
      listBySession: vi.fn<(...args: any[]) => any>(),
      get: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        id: "message-1",
        sessionId: "session-1",
      }),
    };
    const providerExecutionPort = {
      sendMessage: vi.fn<(...args: any[]) => any>(),
      steerActiveTurn: vi.fn<(...args: any[]) => any>(),
      cancelGeneration: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      respondToolInteraction: vi.fn<(...args: any[]) => any>(),
    };
    const providerCatalogPort = {
      getAgentType: vi.fn<(...args: any[]) => any>(),
    };
    const sessionPermissionPort = {
      clearSessionPermissions: vi.fn<(...args: any[]) => any>(),
    };

    const service = new ChatService({
      sessionRepository: sessionRepository as any,
      messageRepository: messageRepository as any,
      providerExecutionPort,
      providerCatalogPort,
      sessionPermissionPort,
      scheduler,
    });

    await expect(service.stopStream({ requestId: "message-1" })).resolves.toEqual({
      stopped: true,
    });
    expect(messageRepository.get).toHaveBeenCalledWith("message-1");
    expect(sessionPermissionPort.clearSessionPermissions).toHaveBeenCalledWith("session-1");
    expect(providerExecutionPort.cancelGeneration).toHaveBeenCalledWith("session-1");
  });

  it("attempts both stopStream cleanups even if clearing permissions fails", async () => {
    const scheduler = createScheduler();
    const sessionRepository = {
      get: vi.fn<(...args: any[]) => any>(),
    };
    const messageRepository = {
      listBySession: vi.fn<(...args: any[]) => any>(),
      get: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        id: "message-1",
        sessionId: "session-1",
      }),
    };
    const providerExecutionPort = {
      sendMessage: vi.fn<(...args: any[]) => any>(),
      steerActiveTurn: vi.fn<(...args: any[]) => any>(),
      cancelGeneration: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      respondToolInteraction: vi.fn<(...args: any[]) => any>(),
    };
    const providerCatalogPort = {
      getAgentType: vi.fn<(...args: any[]) => any>(),
    };
    const sessionPermissionPort = {
      clearSessionPermissions: vi
        .fn<(...args: any[]) => any>()
        .mockRejectedValue(new Error("permission cleanup failed")),
    };

    const service = new ChatService({
      sessionRepository: sessionRepository as any,
      messageRepository: messageRepository as any,
      providerExecutionPort,
      providerCatalogPort,
      sessionPermissionPort,
      scheduler,
    });

    await expect(service.stopStream({ requestId: "message-1" })).resolves.toEqual({
      stopped: true,
    });
    expect(sessionPermissionPort.clearSessionPermissions).toHaveBeenCalledWith("session-1");
    expect(providerExecutionPort.cancelGeneration).toHaveBeenCalledWith("session-1");
  });

  it("responds to tool interactions through the provider execution port", async () => {
    const scheduler = createScheduler();
    const providerExecutionPort = {
      sendMessage: vi.fn<(...args: any[]) => any>(),
      steerActiveTurn: vi.fn<(...args: any[]) => any>(),
      cancelGeneration: vi.fn<(...args: any[]) => any>(),
      respondToolInteraction: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        resumed: true,
        waitingForUserMessage: false,
      }),
    };

    const service = new ChatService({
      sessionRepository: {
        get: vi.fn<(...args: any[]) => any>(),
      } as any,
      messageRepository: {
        listBySession: vi.fn<(...args: any[]) => any>(),
        get: vi.fn<(...args: any[]) => any>(),
      } as any,
      providerExecutionPort,
      providerCatalogPort: {
        getAgentType: vi.fn<(...args: any[]) => any>(),
      } as any,
      sessionPermissionPort: {
        clearSessionPermissions: vi.fn<(...args: any[]) => any>(),
      },
      scheduler,
    });

    await expect(
      service.respondToolInteraction({
        sessionId: "session-1",
        messageId: "message-1",
        toolCallId: "tool-1",
        response: {
          kind: "permission",
          granted: true,
        },
      }),
    ).resolves.toEqual({
      accepted: true,
      resumed: true,
      waitingForUserMessage: false,
    });

    expect(providerExecutionPort.respondToolInteraction).toHaveBeenCalledWith("session-1", "message-1", "tool-1", {
      kind: "permission",
      granted: true,
    });
    expect(scheduler.timeout).toHaveBeenCalledWith(
      expect.objectContaining({
        ms: 30 * 60 * 1_000,
        reason: "chat.respondToolInteraction:session-1:tool-1",
      }),
    );
  });

  it("attempts both timeout cleanups even if clearing permissions fails", async () => {
    const scheduler = createScheduler();
    const timeoutError = new Error("timed out");
    timeoutError.name = "TimeoutError";
    const sessionRepository = {
      get: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        id: "session-1",
        agentId: "argos",
      }),
    };
    const messageRepository = {
      listBySession: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
      get: vi.fn<(...args: any[]) => any>(),
    };
    const providerExecutionPort = {
      sendMessage: vi.fn<(...args: any[]) => any>().mockRejectedValue(timeoutError),
      steerActiveTurn: vi.fn<(...args: any[]) => any>(),
      cancelGeneration: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      respondToolInteraction: vi.fn<(...args: any[]) => any>(),
    };
    const providerCatalogPort = {
      getAgentType: vi.fn<(...args: any[]) => any>().mockResolvedValue("argos"),
    };
    const sessionPermissionPort = {
      clearSessionPermissions: vi
        .fn<(...args: any[]) => any>()
        .mockRejectedValue(new Error("permission cleanup failed")),
    };

    const service = new ChatService({
      sessionRepository: sessionRepository as any,
      messageRepository: messageRepository as any,
      providerExecutionPort,
      providerCatalogPort,
      sessionPermissionPort,
      scheduler,
    });

    await expect(service.sendMessage("session-1", "hello")).rejects.toBe(timeoutError);

    expect(sessionPermissionPort.clearSessionPermissions).toHaveBeenCalledWith("session-1");
    expect(providerExecutionPort.cancelGeneration).toHaveBeenCalledWith("session-1");
  });

  it("aborts a pending send when stopStream races during preflight", async () => {
    const createAbortError = (reason: string) => {
      const error = new Error(reason);
      error.name = "AbortError";
      return error;
    };
    const scheduler = {
      sleep: vi.fn<(...args: any[]) => any>(),
      timeout: vi.fn<(...args: any[]) => any>(
        async <T>({ task, signal, reason }: { task: Promise<T>; signal?: AbortSignal; reason: string }) => {
          if (signal?.aborted) {
            throw createAbortError(reason);
          }

          return await new Promise<T>((resolve, reject) => {
            const onAbort = () => {
              signal?.removeEventListener("abort", onAbort);
              reject(createAbortError(reason));
            };

            signal?.addEventListener("abort", onAbort, { once: true });
            task.then(
              (value) => {
                signal?.removeEventListener("abort", onAbort);
                resolve(value);
              },
              (error) => {
                signal?.removeEventListener("abort", onAbort);
                reject(error);
              },
            );
          });
        },
      ),
      retry: vi.fn<(...args: any[]) => any>(),
    };
    let resolveSession!: (value: { id: string; agentId: string }) => void;
    const sessionRepository = {
      get: vi.fn<(...args: any[]) => any>().mockImplementation(
        async () =>
          await new Promise<{ id: string; agentId: string }>((resolve) => {
            resolveSession = resolve;
          }),
      ),
    };
    const messageRepository = {
      listBySession: vi.fn<(...args: any[]) => any>().mockResolvedValue([]),
      get: vi.fn<(...args: any[]) => any>(),
    };
    const providerExecutionPort = {
      sendMessage: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      steerActiveTurn: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      cancelGeneration: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      respondToolInteraction: vi.fn<(...args: any[]) => any>(),
    };
    const providerCatalogPort = {
      getAgentType: vi.fn<(...args: any[]) => any>().mockResolvedValue("argos"),
    };
    const sessionPermissionPort = {
      clearSessionPermissions: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    };

    const service = new ChatService({
      sessionRepository: sessionRepository as any,
      messageRepository: messageRepository as any,
      providerExecutionPort,
      providerCatalogPort,
      sessionPermissionPort,
      scheduler,
    });

    const pendingSend = service.sendMessage("session-1", "hello");
    await Promise.resolve();

    await expect(service.stopStream({ sessionId: "session-1" })).resolves.toEqual({
      stopped: true,
    });

    resolveSession({
      id: "session-1",
      agentId: "argos",
    });

    await expect(pendingSend).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(sessionPermissionPort.clearSessionPermissions).toHaveBeenCalledWith("session-1");
    expect(providerExecutionPort.cancelGeneration).toHaveBeenCalledWith("session-1");
  });

  it("rejects a new send while another stream is still active for the session", async () => {
    const scheduler = createScheduler();
    const sessionRepository = {
      get: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        id: "session-1",
        agentId: "argos",
      }),
    };
    const messageRepository = {
      listBySession: vi.fn<(...args: any[]) => any>(),
      get: vi.fn<(...args: any[]) => any>(),
    };
    let resolveFirstSend!: (value: { requestId: string; messageId: string }) => void;
    const providerExecutionPort = {
      sendMessage: vi
        .fn<(...args: any[]) => any>()
        .mockImplementationOnce(
          async () =>
            await new Promise<{ requestId: string; messageId: string }>((resolve) => {
              resolveFirstSend = resolve;
            }),
        )
        .mockResolvedValue({
          requestId: "assistant-1",
          messageId: "assistant-1",
        }),
      steerActiveTurn: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      cancelGeneration: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      respondToolInteraction: vi.fn<(...args: any[]) => any>(),
    };
    const providerCatalogPort = {
      getAgentType: vi.fn<(...args: any[]) => any>().mockResolvedValue("argos"),
    };
    const sessionPermissionPort = {
      clearSessionPermissions: vi.fn<(...args: any[]) => any>(),
    };

    const service = new ChatService({
      sessionRepository: sessionRepository as any,
      messageRepository: messageRepository as any,
      providerExecutionPort,
      providerCatalogPort,
      sessionPermissionPort,
      scheduler,
    });

    const firstSend = service.sendMessage("session-1", "hello");

    await expect(service.sendMessage("session-1", "again")).rejects.toThrow(
      "A stream is already active for session session-1",
    );

    resolveFirstSend({
      requestId: "assistant-1",
      messageId: "assistant-1",
    });
    await expect(firstSend).resolves.toEqual({
      accepted: true,
      requestId: "assistant-1",
      messageId: "assistant-1",
    });
  });
});
