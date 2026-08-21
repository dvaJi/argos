import { beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import path from "path";
import { FilePresenter } from "../../../src/main/presenter/filePresenter/FilePresenter";
import type { IConfigPresenter } from "@argos/shared/presenter";

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn<(...args: any[]) => any>((name: string) => (name === "userData" ? "/mock/user/data" : "/mock")),
  },
}));

vi.mock("fs/promises", () => ({
  default: {
    mkdir: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    readFile: vi.fn<(...args: any[]) => any>(),
    realpath: vi.fn<(...args: any[]) => any>(),
    writeFile: vi.fn<(...args: any[]) => any>(),
    unlink: vi.fn<(...args: any[]) => any>(),
    stat: vi.fn<(...args: any[]) => any>(),
  },
}));

vi.mock("@argos/file-adapters/FileValidationService");
vi.mock("@argos/file-adapters/mime");
vi.mock("@argos/file-adapters/BaseFileAdapter");
vi.mock("@argos/file-adapters/DirectoryAdapter");
vi.mock("@argos/file-adapters/UnsupportFileAdapter");
vi.mock("@argos/file-adapters/ImageFileAdapter");
vi.mock("tokenx");
vi.mock("nanoid");

describe("FilePresenter.readFile", () => {
  const mockConfigPresenter = {
    getKnowledgeConfigs: vi.fn<(...args: any[]) => any>(),
    diffKnowledgeConfigs: vi.fn<(...args: any[]) => any>(),
    setKnowledgeConfigs: vi.fn<(...args: any[]) => any>(),
  } as unknown as IConfigPresenter;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked<(...args: any[]) => any>(fs.realpath).mockImplementation(async (targetPath: string) => {
      if (targetPath === "/mock/user/data") {
        return "/mock/user/data";
      }
      if (targetPath === "/mock/user/data/notes/today.md") {
        return "/mock/user/data/notes/today.md";
      }
      if (targetPath === "/mock/user/outside.txt") {
        return "/mock/outside.txt";
      }
      return targetPath;
    });
  });

  it("reads relative files from the user data directory", async () => {
    vi.mocked<(...args: any[]) => any>(fs.readFile).mockResolvedValue("hello world" as never);
    const presenter = new FilePresenter(mockConfigPresenter);

    const content = await presenter.readFile("notes/today.md");

    expect(content).toBe("hello world");
    expect(fs.readFile).toHaveBeenCalledWith(path.resolve("/mock/user/data/notes/today.md"), "utf-8");
  });

  it("rejects absolute paths", async () => {
    const presenter = new FilePresenter(mockConfigPresenter);

    await expect(presenter.readFile("/etc/passwd")).rejects.toThrow("Absolute paths are not allowed");
    expect(fs.readFile).not.toHaveBeenCalled();
  });

  it("rejects paths that escape the user data directory", async () => {
    const presenter = new FilePresenter(mockConfigPresenter);

    await expect(presenter.readFile("../outside.txt")).rejects.toThrow("File path escapes user data directory");
    expect(fs.readFile).not.toHaveBeenCalled();
  });
});
