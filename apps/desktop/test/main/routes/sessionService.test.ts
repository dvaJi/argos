import { SessionService } from "#/routes/sessions/sessionService";

describe("SessionService", () => {
  const createScheduler = () => ({
    sleep: vi.fn<(...args: any[]) => any>(),
    timeout: vi.fn<(...args: any[]) => any>(async <T>({ task }: { task: Promise<T> }) => await task),
    retry: vi.fn<(...args: any[]) => any>(async <T>({ task }: { task: () => Promise<T> }) => await task()),
  });

  it("restores session snapshots through the scheduler and repositories", async () => {
    const scheduler = createScheduler();
    const sessionRepository = {
      create: vi.fn<(...args: any[]) => any>(),
      get: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        id: "session-1",
      }),
      list: vi.fn<(...args: any[]) => any>(),
      activate: vi.fn<(...args: any[]) => any>(),
      deactivate: vi.fn<(...args: any[]) => any>(),
      getActive: vi.fn<(...args: any[]) => any>(),
    };
    const messageRepository = {
      listBySession: vi.fn<(...args: any[]) => any>(),
      listPageBySession: vi.fn<(...args: any[]) => any>().mockResolvedValue({
        messages: [{ id: "message-1", sessionId: "session-1" }],
        nextCursor: null,
        hasMore: false,
      }),
      get: vi.fn<(...args: any[]) => any>(),
    };

    const service = new SessionService({
      sessionRepository,
      messageRepository,
      scheduler,
    });

    const result = await service.restoreSession("session-1");

    expect(scheduler.retry).toHaveBeenCalledTimes(1);
    expect(scheduler.timeout).toHaveBeenCalledTimes(2);
    expect(sessionRepository.get).toHaveBeenCalledWith("session-1");
    expect(messageRepository.listPageBySession).toHaveBeenCalledWith("session-1", {
      limit: 100,
    });
    expect(result).toEqual({
      session: { id: "session-1" },
      messages: [{ id: "message-1", sessionId: "session-1" }],
      nextCursor: null,
      hasMore: false,
    });
  });

  it("returns an empty restore payload when the session no longer exists", async () => {
    const scheduler = createScheduler();
    const sessionRepository = {
      create: vi.fn<(...args: any[]) => any>(),
      get: vi.fn<(...args: any[]) => any>().mockResolvedValue(null),
      list: vi.fn<(...args: any[]) => any>(),
      activate: vi.fn<(...args: any[]) => any>(),
      deactivate: vi.fn<(...args: any[]) => any>(),
      getActive: vi.fn<(...args: any[]) => any>(),
    };
    const messageRepository = {
      listBySession: vi.fn<(...args: any[]) => any>(),
      listPageBySession: vi.fn<(...args: any[]) => any>(),
      get: vi.fn<(...args: any[]) => any>(),
    };

    const service = new SessionService({
      sessionRepository,
      messageRepository,
      scheduler,
    });

    await expect(service.restoreSession("missing-session")).resolves.toEqual({
      session: null,
      messages: [],
      nextCursor: null,
      hasMore: false,
    });
    expect(messageRepository.listPageBySession).not.toHaveBeenCalled();
  });
});
