import { beforeEach, describe, expect, it, vi } from "vitest";

describe("DatabaseInitializer", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("attempts one schema repair and retries initialization for repairable schema errors", async () => {
    const presenterInstance = {
      runTransaction: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
      close: vi.fn<(...args: any[]) => any>(),
    };

    const SQLitePresenter = vi
      .fn<(...args: any[]) => any>()
      .mockImplementationOnce(() => {
        throw new Error("table argos_sessions has no column named reasoning_visibility");
      })
      .mockImplementationOnce(() => presenterInstance);
    const repairSQLiteDatabaseFile = vi.fn<(...args: any[]) => any>();
    const isDestructiveDatabaseError = vi.fn<(...args: any[]) => any>().mockReturnValue(false);
    const classifySchemaError = vi.fn<(...args: any[]) => any>().mockReturnValue({
      reason: "missing-column",
      dedupeKey: "missing-column:reasoning_visibility",
    });

    vi.doMock("electron", () => ({
      app: {
        getPath: vi.fn<(...args: any[]) => any>().mockReturnValue("C:/Users/test/AppData/Roaming/Argos"),
      },
    }));
    vi.doMock("@/presenter/sqlitePresenter", () => ({
      SQLitePresenter,
      repairSQLiteDatabaseFile,
      isDestructiveDatabaseError,
    }));
    vi.doMock("@/presenter/sqlitePresenter/schemaErrorClassifier", () => ({
      classifySchemaError,
    }));

    const { DatabaseInitializer } =
      await import("../../../../src/main/presenter/lifecyclePresenter/DatabaseInitializer");

    const initializer = new DatabaseInitializer({
      dbPath: "C:/tmp/argos-agent.db",
    });
    const result = await initializer.initialize();

    expect(SQLitePresenter).toHaveBeenCalledTimes(2);
    expect(repairSQLiteDatabaseFile).toHaveBeenCalledTimes(1);
    expect(repairSQLiteDatabaseFile).toHaveBeenCalledWith("C:/tmp/argos-agent.db", undefined);
    expect(result).toBe(presenterInstance);
  });

  it("does not attempt schema repair for destructive database errors", async () => {
    const SQLitePresenter = vi.fn<(...args: any[]) => any>().mockImplementation(() => {
      throw new Error("database disk image is malformed");
    });
    const repairSQLiteDatabaseFile = vi.fn<(...args: any[]) => any>();
    const isDestructiveDatabaseError = vi.fn<(...args: any[]) => any>().mockReturnValue(true);
    const classifySchemaError = vi.fn<(...args: any[]) => any>().mockReturnValue({
      reason: "missing-table",
      dedupeKey: "missing-table:argos_sessions",
    });

    vi.doMock("electron", () => ({
      app: {
        getPath: vi.fn<(...args: any[]) => any>().mockReturnValue("C:/Users/test/AppData/Roaming/Argos"),
      },
    }));
    vi.doMock("@/presenter/sqlitePresenter", () => ({
      SQLitePresenter,
      repairSQLiteDatabaseFile,
      isDestructiveDatabaseError,
    }));
    vi.doMock("@/presenter/sqlitePresenter/schemaErrorClassifier", () => ({
      classifySchemaError,
    }));

    const { DatabaseInitializer } =
      await import("../../../../src/main/presenter/lifecyclePresenter/DatabaseInitializer");

    const initializer = new DatabaseInitializer({
      dbPath: "C:/tmp/argos-agent.db",
    });

    await expect(initializer.initialize()).rejects.toThrow("database disk image is malformed");
    expect(SQLitePresenter).toHaveBeenCalledTimes(1);
    expect(repairSQLiteDatabaseFile).not.toHaveBeenCalled();
  });
});
