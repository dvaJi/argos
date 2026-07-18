import { describe, expect, it, vi } from "vitest";
import { RemoteCommandRouter } from "@argos/remote-control-runtime/services/remoteCommandRouter";

const createMessage = (overrides: Partial<Parameters<RemoteCommandRouter["handleMessage"]>[0]> = {}) => ({
  kind: "message" as const,
  updateId: 1,
  chatId: 100,
  messageThreadId: 0,
  messageId: 20,
  chatType: "private",
  fromId: 123,
  text: "hello",
  command: null,
  ...overrides,
});

const createCallbackQuery = (overrides: Partial<Parameters<RemoteCommandRouter["handleMessage"]>[0]> = {}) => ({
  kind: "callback_query" as const,
  updateId: 2,
  chatId: 100,
  messageThreadId: 0,
  messageId: 30,
  chatType: "private",
  fromId: 123,
  callbackQueryId: "callback-1",
  data: "model:token:p:0",
  ...overrides,
});

const createBindingStore = () => ({
  getEndpointKey: vi.fn<(...args: any[]) => any>().mockReturnValue("telegram:100:0"),
  getTelegramConfig: vi.fn<(...args: any[]) => any>().mockReturnValue({
    allowlist: [123],
    bindings: {
      "telegram:100:0": { sessionId: "session-1", updatedAt: 1 },
    },
    streamMode: "draft",
    defaultWorkdir: "",
  }),
  createModelMenuState: vi.fn<(...args: any[]) => any>().mockReturnValue("menu-token"),
  getModelMenuState: vi.fn<(...args: any[]) => any>(),
  clearModelMenuState: vi.fn<(...args: any[]) => any>(),
  createAgentMenuState: vi.fn<(...args: any[]) => any>().mockReturnValue("agent-token"),
  getAgentMenuState: vi.fn<(...args: any[]) => any>(),
  clearAgentMenuState: vi.fn<(...args: any[]) => any>(),
  createPendingInteractionState: vi.fn<(...args: any[]) => any>().mockReturnValue("pending-token"),
  getPendingInteractionState: vi.fn<(...args: any[]) => any>(),
  clearPendingInteractionState: vi.fn<(...args: any[]) => any>(),
});

const createRunner = (overrides: Record<string, unknown> = {}) => ({
  getPendingInteraction: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
  getDefaultAgentId: vi.fn<(...args: any[]) => any>().mockResolvedValue("argos"),
  getDefaultWorkdir: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
  isSessionModelLocked: vi.fn<(...args: any[]) => any>().mockResolvedValue(false),
  ...overrides,
});

const createDeferred = <T>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return {
    promise,
    resolve,
    reject,
  };
};

describe("RemoteCommandRouter", () => {
  it("returns pairing guidance for unauthorized plain text", async () => {
    const router = new RemoteCommandRouter({
      authGuard: {
        ensureAuthorized: vi.fn<(...args: any[]) => any>().mockReturnValue({
          ok: false,
          message: "pair first",
        }),
        pair: vi.fn<(...args: any[]) => any>(),
      } as any,
      runner: {} as any,
      bindingStore: {
        getEndpointKey: vi.fn<(...args: any[]) => any>().mockReturnValue("telegram:100:0"),
        getTelegramConfig: vi.fn<(...args: any[]) => any>().mockReturnValue({
          allowlist: [],
          bindings: {},
          streamMode: "draft",
        }),
      } as any,
      getPollerStatus: vi.fn<(...args: any[]) => any>().mockReturnValue({
        state: "running",
        lastError: null,
        botUser: null,
      }),
    });

    const result = await router.handleMessage(createMessage());

    expect(result).toEqual({
      replies: ["pair first"],
    });
  });

  it("routes plain text to the conversation runner when authorized", async () => {
    const conversation = {
      sessionId: "session-1",
      eventId: "msg-1",
      getSnapshot: vi.fn<(...args: any[]) => any>(),
    };
    const runner = {
      sendText: vi.fn<(...args: any[]) => any>().mockResolvedValue(conversation),
      getDefaultAgentId: vi.fn<(...args: any[]) => any>().mockResolvedValue("argos"),
      getDefaultWorkdir: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
      isSessionModelLocked: vi.fn<(...args: any[]) => any>().mockResolvedValue(false),
      getPendingInteraction: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
    };
    const bindingStore = createBindingStore();
    const router = new RemoteCommandRouter({
      authGuard: {
        ensureAuthorized: vi.fn<(...args: any[]) => any>().mockReturnValue({
          ok: true,
          userId: 123,
        }),
        pair: vi.fn<(...args: any[]) => any>(),
      } as any,
      runner: runner as any,
      bindingStore: bindingStore as any,
      getPollerStatus: vi.fn<(...args: any[]) => any>().mockReturnValue({
        state: "running",
        lastError: null,
        botUser: null,
      }),
    });

    const result = await router.handleMessage(createMessage());

    expect(runner.sendText).toHaveBeenCalledWith("telegram:100:0", "hello");
    expect(result).toEqual({
      replies: [],
      conversation,
    });
  });

  it("returns usage help for an invalid /use command", async () => {
    const runner = createRunner({
      useSessionByIndex: vi.fn<(...args: any[]) => any>(),
    });
    const router = new RemoteCommandRouter({
      authGuard: {
        ensureAuthorized: vi.fn<(...args: any[]) => any>().mockReturnValue({
          ok: true,
          userId: 123,
        }),
        pair: vi.fn<(...args: any[]) => any>(),
      } as any,
      runner: runner as any,
      bindingStore: createBindingStore() as any,
      getPollerStatus: vi.fn<(...args: any[]) => any>().mockReturnValue({
        state: "running",
        lastError: null,
        botUser: null,
      }),
    });

    const result = await router.handleMessage(
      createMessage({
        text: "/use nope",
        command: {
          name: "use",
          args: "nope",
        },
      }),
    );

    expect(result).toEqual({
      replies: ["Usage: /use <index>"],
    });
    expect(runner.useSessionByIndex).not.toHaveBeenCalled();
  });

  it("reports runtime state for /status", async () => {
    const router = new RemoteCommandRouter({
      authGuard: {
        ensureAuthorized: vi.fn<(...args: any[]) => any>().mockReturnValue({
          ok: true,
          userId: 123,
        }),
        pair: vi.fn<(...args: any[]) => any>(),
      } as any,
      runner: createRunner({
        getDefaultAgentId: vi.fn<(...args: any[]) => any>().mockResolvedValue("argos-alt"),
        getDefaultWorkdir: vi.fn<(...args: any[]) => any>().mockResolvedValue("/workspaces/remote"),
        getStatus: vi.fn<(...args: any[]) => any>().mockResolvedValue({
          session: {
            id: "session-1",
            title: "Remote chat",
            agentId: "argos-alt",
            modelId: "gpt-5",
            projectDir: "/workspaces/current",
          },
          activeEventId: "msg-1",
          isGenerating: true,
          pendingInteraction: null,
        }),
      }) as any,
      bindingStore: createBindingStore() as any,
      getPollerStatus: vi.fn<(...args: any[]) => any>().mockReturnValue({
        state: "running",
        lastError: null,
        botUser: null,
      }),
    });

    const result = await router.handleMessage(
      createMessage({
        text: "/status",
        command: {
          name: "status",
          args: "",
        },
      }),
    );

    expect(result.replies[0]).toContain("Runtime: running");
    expect(result.replies[0]).toContain("Current session: Remote chat [session-1]");
    expect(result.replies[0]).toContain("Default agent: argos-alt");
    expect(result.replies[0]).toContain("Default workdir: /workspaces/remote");
    expect(result.replies[0]).toContain("Current agent: argos-alt");
    expect(result.replies[0]).toContain("Current model: gpt-5");
    expect(result.replies[0]).toContain("Current workdir: /workspaces/current");
  });

  it("blocks /model when the current session is ACP-backed", async () => {
    const listAvailableModelProviders = vi.fn<(...args: any[]) => any>();
    const router = new RemoteCommandRouter({
      authGuard: {
        ensureAuthorized: vi.fn<(...args: any[]) => any>().mockReturnValue({
          ok: true,
          userId: 123,
        }),
        pair: vi.fn<(...args: any[]) => any>(),
      } as any,
      runner: createRunner({
        getCurrentSession: vi.fn<(...args: any[]) => any>().mockResolvedValue({
          id: "session-1",
          title: "ACP Remote",
          agentId: "acp-agent",
          modelId: "acp-agent",
        }),
        isSessionModelLocked: vi.fn<(...args: any[]) => any>().mockResolvedValue(true),
        listAvailableModelProviders,
      }) as any,
      bindingStore: createBindingStore() as any,
      getPollerStatus: vi.fn<(...args: any[]) => any>().mockReturnValue({
        state: "running",
        lastError: null,
        botUser: null,
      }),
    });

    const result = await router.handleMessage(
      createMessage({
        text: "/model",
        command: {
          name: "model",
          args: "",
        },
      }),
    );

    expect(result).toEqual({
      replies: ["ACP sessions lock the model. Change the channel default agent instead."],
    });
    expect(listAvailableModelProviders).not.toHaveBeenCalled();
  });

  it("shows /model and /open in help output", async () => {
    const router = new RemoteCommandRouter({
      authGuard: {
        ensureAuthorized: vi.fn<(...args: any[]) => any>(),
        pair: vi.fn<(...args: any[]) => any>(),
      } as any,
      runner: {} as any,
      bindingStore: createBindingStore() as any,
      getPollerStatus: vi.fn<(...args: any[]) => any>(),
    });

    const result = await router.handleMessage(
      createMessage({
        text: "/help",
        command: {
          name: "help",
          args: "",
        },
      }),
    );

    expect(result.replies[0]).toContain("/model");
    expect(result.replies[0]).toContain("/open");
  });

  it("returns guidance when /open is used without a bound session", async () => {
    const router = new RemoteCommandRouter({
      authGuard: {
        ensureAuthorized: vi.fn<(...args: any[]) => any>().mockReturnValue({
          ok: true,
          userId: 123,
        }),
        pair: vi.fn<(...args: any[]) => any>(),
      } as any,
      runner: createRunner({
        open: vi.fn<(...args: any[]) => any>().mockResolvedValue({
          status: "noSession",
        }),
      }) as any,
      bindingStore: createBindingStore() as any,
      getPollerStatus: vi.fn<(...args: any[]) => any>(),
    });

    const result = await router.handleMessage(
      createMessage({
        text: "/open",
        command: {
          name: "open",
          args: "",
        },
      }),
    );

    expect(result).toEqual({
      replies: ["No bound session. Send a message, /new, or /use first."],
    });
  });

  it("returns a desktop window hint when /open cannot find a chat window", async () => {
    const router = new RemoteCommandRouter({
      authGuard: {
        ensureAuthorized: vi.fn<(...args: any[]) => any>().mockReturnValue({
          ok: true,
          userId: 123,
        }),
        pair: vi.fn<(...args: any[]) => any>(),
      } as any,
      runner: createRunner({
        open: vi.fn<(...args: any[]) => any>().mockResolvedValue({
          status: "windowNotFound",
        }),
      }) as any,
      bindingStore: createBindingStore() as any,
      getPollerStatus: vi.fn<(...args: any[]) => any>(),
    });

    const result = await router.handleMessage(
      createMessage({
        text: "/open",
        command: {
          name: "open",
          args: "",
        },
      }),
    );

    expect(result).toEqual({
      replies: ["Could not find a Argos desktop window. Open Argos and try /open again."],
    });
  });

  it("returns the formatted session label when /open succeeds", async () => {
    const router = new RemoteCommandRouter({
      authGuard: {
        ensureAuthorized: vi.fn<(...args: any[]) => any>().mockReturnValue({
          ok: true,
          userId: 123,
        }),
        pair: vi.fn<(...args: any[]) => any>(),
      } as any,
      runner: createRunner({
        open: vi.fn<(...args: any[]) => any>().mockResolvedValue({
          status: "ok",
          session: {
            id: "session-1",
            title: "Remote chat",
          },
        }),
      }) as any,
      bindingStore: createBindingStore() as any,
      getPollerStatus: vi.fn<(...args: any[]) => any>(),
    });

    const result = await router.handleMessage(
      createMessage({
        text: "/open",
        command: {
          name: "open",
          args: "",
        },
      }),
    );

    expect(result).toEqual({
      replies: ["Opened on desktop: Remote chat [session-1]"],
    });
  });

  it("returns a prompt when /model is used without a bound session", async () => {
    const runner = createRunner({
      getCurrentSession: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
    });
    const router = new RemoteCommandRouter({
      authGuard: {
        ensureAuthorized: vi.fn<(...args: any[]) => any>().mockReturnValue({
          ok: true,
          userId: 123,
        }),
        pair: vi.fn<(...args: any[]) => any>(),
      } as any,
      runner: runner as any,
      bindingStore: createBindingStore() as any,
      getPollerStatus: vi.fn<(...args: any[]) => any>(),
    });

    const result = await router.handleMessage(
      createMessage({
        text: "/model",
        command: {
          name: "model",
          args: "",
        },
      }),
    );

    expect(result).toEqual({
      replies: ["No bound session. Send a message, /new, or /use first."],
    });
  });

  it("creates a provider menu for /model", async () => {
    const runner = createRunner({
      getCurrentSession: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        id: "session-1",
        title: "Remote chat",
        providerId: "openai",
        modelId: "gpt-5",
      }),
      listAvailableModelProviders: vi.fn<(...args: any[]) => any>().mockResolvedValue([
        {
          providerId: "openai",
          providerName: "OpenAI",
          models: [{ modelId: "gpt-5", modelName: "GPT-5" }],
        },
        {
          providerId: "anthropic",
          providerName: "Anthropic",
          models: [{ modelId: "claude-3-5-sonnet", modelName: "Claude 3.5 Sonnet" }],
        },
      ]),
    });
    const bindingStore = createBindingStore();
    const router = new RemoteCommandRouter({
      authGuard: {
        ensureAuthorized: vi.fn<(...args: any[]) => any>().mockReturnValue({
          ok: true,
          userId: 123,
        }),
        pair: vi.fn<(...args: any[]) => any>(),
      } as any,
      runner: runner as any,
      bindingStore: bindingStore as any,
      getPollerStatus: vi.fn<(...args: any[]) => any>(),
    });

    const result = await router.handleMessage(
      createMessage({
        text: "/model",
        command: {
          name: "model",
          args: "",
        },
      }),
    );

    expect(bindingStore.createModelMenuState).toHaveBeenCalledWith("telegram:100:0", "session-1", expect.any(Array));
    expect(result.outboundActions).toEqual([
      expect.objectContaining({
        type: "sendMessage",
        text: expect.stringContaining("Choose a provider:"),
        replyMarkup: {
          inline_keyboard: expect.arrayContaining([
            [
              expect.objectContaining({
                text: "OpenAI",
              }),
            ],
          ]),
        },
      }),
    ]);
  });

  it("switches to the selected model from callback query", async () => {
    const bindingStore = createBindingStore();
    bindingStore.getModelMenuState.mockReturnValue({
      endpointKey: "telegram:100:0",
      sessionId: "session-1",
      createdAt: Date.now(),
      providers: [
        {
          providerId: "anthropic",
          providerName: "Anthropic",
          models: [{ modelId: "claude-3-5-sonnet", modelName: "Claude 3.5 Sonnet" }],
        },
      ],
    });

    const runner = createRunner({
      getCurrentSession: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        id: "session-1",
        title: "Remote chat",
        providerId: "openai",
        modelId: "gpt-5",
      }),
      setSessionModel: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        id: "session-1",
        title: "Remote chat",
        providerId: "anthropic",
        modelId: "claude-3-5-sonnet",
      }),
    });
    const router = new RemoteCommandRouter({
      authGuard: {
        ensureAuthorized: vi.fn<(...args: any[]) => any>().mockReturnValue({
          ok: true,
          userId: 123,
        }),
        pair: vi.fn<(...args: any[]) => any>(),
      } as any,
      runner: runner as any,
      bindingStore: bindingStore as any,
      getPollerStatus: vi.fn<(...args: any[]) => any>(),
    });

    const result = await router.handleMessage(
      createCallbackQuery({
        data: "model:menu-token:m:0:0",
      }),
    );

    expect(runner.setSessionModel).toHaveBeenCalledWith("telegram:100:0", "anthropic", "claude-3-5-sonnet");
    expect(bindingStore.clearModelMenuState).toHaveBeenCalledWith("menu-token");
    expect(result.callbackAnswer).toEqual({
      text: "Model switched.",
    });
    expect(result.outboundActions).toEqual([
      expect.objectContaining({
        type: "editMessageText",
        messageId: 30,
        text: expect.stringContaining("Model updated."),
      }),
    ]);
  });

  it("expires stale /model callback queries", async () => {
    const bindingStore = createBindingStore();
    bindingStore.getModelMenuState.mockReturnValue(null);

    const router = new RemoteCommandRouter({
      authGuard: {
        ensureAuthorized: vi.fn<(...args: any[]) => any>().mockReturnValue({
          ok: true,
          userId: 123,
        }),
        pair: vi.fn<(...args: any[]) => any>(),
      } as any,
      runner: createRunner() as any,
      bindingStore: bindingStore as any,
      getPollerStatus: vi.fn<(...args: any[]) => any>(),
    });

    const result = await router.handleMessage(
      createCallbackQuery({
        data: "model:menu-token:m:0:0",
      }),
    );

    expect(result.callbackAnswer).toEqual({
      text: "Model menu expired. Run /model again.",
      showAlert: true,
    });
    expect(result.outboundActions).toEqual([
      {
        type: "editMessageText",
        messageId: 30,
        text: "Model menu expired. Run /model again.",
        replyMarkup: null,
      },
    ]);
  });

  it("routes plain text to a pending permission response before opening a new turn", async () => {
    const runner = {
      getPendingInteraction: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        type: "permission",
        messageId: "assistant-1",
        toolCallId: "tool-1",
        toolName: "shell_command",
        toolArgs: '{"command":"git push"}',
        permission: {
          permissionType: "command",
          description: "Run git push",
          command: "git push",
        },
      }),
      respondToPendingInteraction: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        waitingForUserMessage: false,
        execution: {
          sessionId: "session-1",
          eventId: "assistant-1",
          getSnapshot: vi.fn<(...args: any[]) => any>(),
        },
      }),
    };
    const router = new RemoteCommandRouter({
      authGuard: {
        ensureAuthorized: vi.fn<(...args: any[]) => any>().mockReturnValue({
          ok: true,
          userId: 123,
        }),
        pair: vi.fn<(...args: any[]) => any>(),
      } as any,
      runner: runner as any,
      bindingStore: createBindingStore() as any,
      getPollerStatus: vi.fn<(...args: any[]) => any>(),
    });

    const result = await router.handleMessage(
      createMessage({
        text: "ALLOW",
      }),
    );

    expect(runner.respondToPendingInteraction).toHaveBeenCalledWith("telegram:100:0", {
      kind: "permission",
      granted: true,
    });
    expect(result.replies).toEqual(["Approved. Continuing..."]);
    expect(result.conversation).toEqual(
      expect.objectContaining({
        sessionId: "session-1",
      }),
    );
  });

  it("re-sends the current pending interaction with buttons", async () => {
    const bindingStore = createBindingStore();
    const router = new RemoteCommandRouter({
      authGuard: {
        ensureAuthorized: vi.fn<(...args: any[]) => any>().mockReturnValue({
          ok: true,
          userId: 123,
        }),
        pair: vi.fn<(...args: any[]) => any>(),
      } as any,
      runner: {
        getPendingInteraction: vi.fn<(...args: any[]) => any>().mockResolvedValue({
          type: "question",
          messageId: "assistant-2",
          toolCallId: "tool-2",
          toolName: "argos_question",
          toolArgs: "{}",
          question: {
            question: "Pick one",
            options: [{ label: "A" }, { label: "B" }],
            custom: true,
            multiple: false,
          },
        }),
      } as any,
      bindingStore: bindingStore as any,
      getPollerStatus: vi.fn<(...args: any[]) => any>(),
    });

    const result = await router.handleMessage(
      createMessage({
        text: "/pending",
        command: {
          name: "pending",
          args: "",
        },
      }),
    );

    expect(bindingStore.createPendingInteractionState).toHaveBeenCalledWith("telegram:100:0", {
      type: "question",
      messageId: "assistant-2",
      toolCallId: "tool-2",
      toolName: "argos_question",
      toolArgs: "{}",
      question: {
        question: "Pick one",
        options: [{ label: "A" }, { label: "B" }],
        custom: true,
        multiple: false,
      },
    });
    expect(result.outboundActions).toEqual([
      expect.objectContaining({
        type: "sendMessage",
        text: expect.stringContaining("Question"),
        replyMarkup: {
          inline_keyboard: expect.arrayContaining([
            [
              expect.objectContaining({
                text: "A",
              }),
              expect.objectContaining({
                text: "B",
              }),
            ],
          ]),
        },
      }),
    ]);
  });

  it("refreshes expired pending interaction callbacks with the latest prompt", async () => {
    const bindingStore = createBindingStore();
    bindingStore.getPendingInteractionState.mockReturnValue(null);
    const router = new RemoteCommandRouter({
      authGuard: {
        ensureAuthorized: vi.fn<(...args: any[]) => any>().mockReturnValue({
          ok: true,
          userId: 123,
        }),
        pair: vi.fn<(...args: any[]) => any>(),
      } as any,
      runner: {
        getPendingInteraction: vi.fn<(...args: any[]) => any>().mockResolvedValue({
          type: "permission",
          messageId: "assistant-3",
          toolCallId: "tool-3",
          toolName: "shell_command",
          toolArgs: '{"command":"git push"}',
          permission: {
            permissionType: "command",
            description: "Run git push",
            command: "git push",
          },
        }),
      } as any,
      bindingStore: bindingStore as any,
      getPollerStatus: vi.fn<(...args: any[]) => any>(),
    });

    const result = await router.handleMessage(
      createCallbackQuery({
        data: "pending:expired-token:allow",
      }),
    );

    expect(bindingStore.createPendingInteractionState).toHaveBeenCalledWith("telegram:100:0", {
      type: "permission",
      messageId: "assistant-3",
      toolCallId: "tool-3",
      toolName: "shell_command",
      toolArgs: '{"command":"git push"}',
      permission: {
        permissionType: "command",
        description: "Run git push",
        command: "git push",
      },
    });
    expect(result.callbackAnswer).toEqual({
      text: "Prompt refreshed.",
    });
    expect(result.outboundActions).toEqual([
      expect.objectContaining({
        type: "editMessageText",
        messageId: 30,
        text: expect.stringContaining("Permission Required"),
        replyMarkup: expect.objectContaining({
          inline_keyboard: expect.any(Array),
        }),
      }),
    ]);
  });

  it("returns pending callback edits immediately before continuation completes", async () => {
    const bindingStore = createBindingStore();
    bindingStore.getPendingInteractionState.mockReturnValue({
      endpointKey: "telegram:100:0",
      createdAt: Date.now(),
      messageId: "assistant-4",
      toolCallId: "tool-4",
    });
    const deferred = createDeferred<{
      waitingForUserMessage: boolean;
      execution: null;
    }>();
    const runner = {
      getPendingInteraction: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        type: "permission",
        messageId: "assistant-4",
        toolCallId: "tool-4",
        toolName: "shell_command",
        toolArgs: '{"command":"git push"}',
        permission: {
          permissionType: "command",
          description: "Run git push",
          command: "git push",
        },
      }),
      respondToPendingInteraction: vi.fn<(...args: any[]) => any>().mockReturnValue(deferred.promise),
    };
    const router = new RemoteCommandRouter({
      authGuard: {
        ensureAuthorized: vi.fn<(...args: any[]) => any>().mockReturnValue({
          ok: true,
          userId: 123,
        }),
        pair: vi.fn<(...args: any[]) => any>(),
      } as any,
      runner: runner as any,
      bindingStore: bindingStore as any,
      getPollerStatus: vi.fn<(...args: any[]) => any>(),
    });

    const result = await Promise.race([
      router.handleMessage(
        createCallbackQuery({
          data: "pending:pending-token:allow",
        }),
      ),
      new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 25)),
    ]);

    expect(result).not.toBe("timeout");
    expect(runner.respondToPendingInteraction).toHaveBeenCalledWith("telegram:100:0", {
      kind: "permission",
      granted: true,
    });
    expect(result).toEqual(
      expect.objectContaining({
        callbackAnswer: {
          text: "Continuing...",
        },
        outboundActions: [
          expect.objectContaining({
            type: "editMessageText",
            messageId: 30,
            text: expect.stringContaining("Permission handled."),
          }),
        ],
        deferred: expect.any(Promise),
      }),
    );

    deferred.resolve({
      waitingForUserMessage: false,
      execution: null,
    });
    await (result as Exclude<typeof result, "timeout">).deferred;
  });

  it("shows /agent in help output", async () => {
    const router = new RemoteCommandRouter({
      authGuard: {
        ensureAuthorized: vi.fn<(...args: any[]) => any>(),
        pair: vi.fn<(...args: any[]) => any>(),
      } as any,
      runner: {} as any,
      bindingStore: createBindingStore() as any,
      getPollerStatus: vi.fn<(...args: any[]) => any>(),
    });

    const result = await router.handleMessage(
      createMessage({
        text: "/help",
        command: { name: "help", args: "" },
      }),
    );

    expect(result.replies[0]).toContain("/agent");
  });

  it("returns a prompt when /agent is used without a bound session", async () => {
    const runner = createRunner({
      getCurrentSession: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
    });
    const router = new RemoteCommandRouter({
      authGuard: {
        ensureAuthorized: vi.fn<(...args: any[]) => any>().mockReturnValue({ ok: true, userId: 123 }),
        pair: vi.fn<(...args: any[]) => any>(),
      } as any,
      runner: runner as any,
      bindingStore: createBindingStore() as any,
      getPollerStatus: vi.fn<(...args: any[]) => any>(),
    });

    const result = await router.handleMessage(
      createMessage({
        text: "/agent",
        command: { name: "agent", args: "" },
      }),
    );

    expect(result).toEqual({
      replies: ["No bound session. Send a message, /new, or /use first."],
    });
  });

  it("renders an agent menu for /agent", async () => {
    const runner = createRunner({
      getCurrentSession: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        id: "session-1",
        title: "Remote chat",
        agentId: "argos",
        providerId: "openai",
        modelId: "gpt-5",
      }),
      listAvailableAgents: vi.fn<(...args: any[]) => any>().mockResolvedValue([
        {
          agentId: "argos",
          agentName: "Argos",
          agentType: "argos",
          source: "builtin",
        },
        {
          agentId: "claude-code",
          agentName: "Claude Code",
          agentType: "acp",
          source: "registry",
        },
      ]),
    });
    const bindingStore = createBindingStore();
    const router = new RemoteCommandRouter({
      authGuard: {
        ensureAuthorized: vi.fn<(...args: any[]) => any>().mockReturnValue({ ok: true, userId: 123 }),
        pair: vi.fn<(...args: any[]) => any>(),
      } as any,
      runner: runner as any,
      bindingStore: bindingStore as any,
      getPollerStatus: vi.fn<(...args: any[]) => any>(),
    });

    const result = await router.handleMessage(
      createMessage({
        text: "/agent",
        command: { name: "agent", args: "" },
      }),
    );

    expect(bindingStore.createAgentMenuState).toHaveBeenCalledWith("telegram:100:0", "session-1", expect.any(Array));
    expect(result.outboundActions).toEqual([
      expect.objectContaining({
        type: "sendMessage",
        text: expect.stringContaining("Choose an agent"),
        replyMarkup: {
          inline_keyboard: expect.arrayContaining([
            [expect.objectContaining({ text: expect.stringContaining("Argos") })],
          ]),
        },
      }),
    ]);
  });

  it("switches the channel default agent from a callback query", async () => {
    const bindingStore = createBindingStore();
    bindingStore.getAgentMenuState.mockReturnValue({
      endpointKey: "telegram:100:0",
      sessionId: "session-1",
      createdAt: Date.now(),
      agents: [
        {
          agentId: "claude-code",
          agentName: "Claude Code",
          agentType: "acp",
          source: "registry",
        },
      ],
    });
    const setChannelDefaultAgent = vi.fn<(...args: any[]) => any>().mockResolvedValue({
      session: {
        id: "session-2",
        title: "New Chat",
        providerId: "acp",
        modelId: "claude-code",
        agentId: "claude-code",
      },
      agent: {
        agentId: "claude-code",
        agentName: "Claude Code",
        agentType: "acp",
        source: "registry",
      },
    });
    const runner = createRunner({
      getCurrentSession: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        id: "session-1",
        title: "Remote chat",
        agentId: "argos",
        providerId: "openai",
        modelId: "gpt-5",
      }),
      setChannelDefaultAgent,
    });
    const router = new RemoteCommandRouter({
      authGuard: {
        ensureAuthorized: vi.fn<(...args: any[]) => any>().mockReturnValue({ ok: true, userId: 123 }),
        pair: vi.fn<(...args: any[]) => any>(),
      } as any,
      runner: runner as any,
      bindingStore: bindingStore as any,
      getPollerStatus: vi.fn<(...args: any[]) => any>(),
    });

    const result = await router.handleMessage(
      createCallbackQuery({
        data: "agent:agent-token:a:0",
      }),
    );

    expect(setChannelDefaultAgent).toHaveBeenCalledWith("telegram:100:0", "claude-code");
    expect(bindingStore.clearAgentMenuState).toHaveBeenCalledWith("agent-token");
    expect(result.callbackAnswer).toEqual({ text: "Agent switched." });
    expect(result.outboundActions).toEqual([
      expect.objectContaining({
        type: "editMessageText",
        messageId: 30,
        text: expect.stringContaining("Started a new session"),
      }),
    ]);
  });

  it("surfaces agent switch errors via callback alert", async () => {
    const bindingStore = createBindingStore();
    bindingStore.getAgentMenuState.mockReturnValue({
      endpointKey: "telegram:100:0",
      sessionId: "session-1",
      createdAt: Date.now(),
      agents: [
        {
          agentId: "claude-code",
          agentName: "Claude Code",
          agentType: "acp",
        },
      ],
    });
    const runner = createRunner({
      getCurrentSession: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        id: "session-1",
        title: "Remote chat",
        agentId: "argos",
        providerId: "openai",
        modelId: "gpt-5",
      }),
      setChannelDefaultAgent: vi
        .fn<(...args: any[]) => any>()
        .mockRejectedValue(new Error("Cannot switch to ACP agent: this channel has no default workdir set.")),
    });
    const router = new RemoteCommandRouter({
      authGuard: {
        ensureAuthorized: vi.fn<(...args: any[]) => any>().mockReturnValue({ ok: true, userId: 123 }),
        pair: vi.fn<(...args: any[]) => any>(),
      } as any,
      runner: runner as any,
      bindingStore: bindingStore as any,
      getPollerStatus: vi.fn<(...args: any[]) => any>(),
    });

    const result = await router.handleMessage(createCallbackQuery({ data: "agent:agent-token:a:0" }));

    expect(result.callbackAnswer).toEqual({
      text: expect.stringContaining("Cannot switch to ACP agent"),
      showAlert: true,
    });
    expect(bindingStore.clearAgentMenuState).not.toHaveBeenCalled();
  });
});
