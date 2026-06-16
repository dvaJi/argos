import { describe, expect, it, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { MessageFile } from "@shared/types/agent-interface";
import { useChatInputFiles } from "@/components/chat/composables/useChatInputFiles";

const { toastMock, fileClient } = vi.hoisted(() => ({
  toastMock: vi.fn<(...args: any[]) => any>(),
  fileClient: {
    getMimeType: vi.fn<(...args: any[]) => any>(),
    prepareFile: vi.fn<(...args: any[]) => any>(),
    prepareDirectory: vi.fn<(...args: any[]) => any>(),
    readFile: vi.fn<(...args: any[]) => any>(),
    isDirectory: vi.fn<(...args: any[]) => any>(),
    writeImageBase64: vi.fn<(...args: any[]) => any>(),
    getPathForFile: vi.fn<(...args: any[]) => any>(),
    toRelativePath: vi.fn<(...args: any[]) => any>(),
    formatPathForInput: vi.fn<(...args: any[]) => any>(),
  },
}));

vi.mock("@/components/use-toast", () => ({
  useToast: () => ({
    toast: toastMock,
  }),
}));

vi.mock("@api/FileClient", () => ({
  createFileClient: () => fileClient,
}));

vi.mock("@/lib/image", () => ({
  calculateImageTokens: vi.fn<(...args: any[]) => any>(() => 12),
  getClipboardImageInfo: vi.fn<(...args: any[]) => any>(() =>
    Promise.resolve({
      width: 100,
      height: 100,
      compressedBase64: "data:image/jpeg;base64,thumb",
    }),
  ),
  imageFileToBase64: vi.fn<(...args: any[]) => any>(() => Promise.resolve("data:image/png;base64,image")),
}));

function createFileList(files: File[]): FileList {
  return {
    ...files,
    length: files.length,
    item: (index: number) => files[index] ?? null,
  } as unknown as FileList;
}

function t(key: string, params?: Record<string, unknown>): string {
  const messages: Record<string, string> = {
    "chat.input.fileUploadFailed": "Attachment failed",
    "chat.input.fileUploadFailedDesc": "Could not process {count} files: {names}",
    "chat.input.fileUploadFailedMore": " and {count} more",
    "chat.input.unnamedFile": "unnamed file",
  };

  return (messages[key] ?? key).replace(/\{(\w+)\}/g, (_match, name: string) => String(params?.[name] ?? ""));
}

describe("useChatInputFiles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds selected docx files through the file presenter route", async () => {
    const messageFile: MessageFile = {
      name: "report.docx",
      content: "Document content",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      metadata: {
        fileName: "report.docx",
        fileSize: 42,
        fileDescription: "Word Document",
        fileCreated: new Date().toISOString(),
        fileModified: new Date().toISOString(),
      },
      token: 10,
      path: "/tmp/report.docx",
    };
    const emit = vi.fn<(...args: any[]) => any>();
    const target = { files: createFileList([new File(["docx"], "report.docx")]), value: "x" };
    fileClient.getPathForFile.mockReturnValue("/tmp/report.docx");
    fileClient.getMimeType.mockResolvedValue("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    fileClient.prepareFile.mockResolvedValue(messageFile);

    const { result } = renderHook(() => useChatInputFiles(undefined, emit, t));
    await act(async () => {
      await result.current.handleFileSelect({ target } as unknown as Event);
    });

    expect(fileClient.prepareFile).toHaveBeenCalledWith(
      "/tmp/report.docx",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(emit).toHaveBeenCalledWith("file-upload", [messageFile]);
    expect(toastMock).not.toHaveBeenCalled();
    expect(target.value).toBe("");
  });

  it("shows a destructive toast when selected files fail processing", async () => {
    const consoleSpy = vi.spyOn<(...args: any[]) => any>(console, "error").mockImplementation(() => {});
    const emit = vi.fn<(...args: any[]) => any>();
    const target = { files: createFileList([new File(["bad"], "broken.docx")]), value: "x" };
    fileClient.getPathForFile.mockReturnValue("/tmp/broken.docx");
    fileClient.getMimeType.mockResolvedValue("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    fileClient.prepareFile.mockRejectedValue(new Error("invalid docx"));

    const { result } = renderHook(() => useChatInputFiles(undefined, emit, t));
    await act(async () => {
      await result.current.handleFileSelect({ target } as unknown as Event);
    });

    expect(emit).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith({
      title: "Attachment failed",
      description: "Could not process 1 files: broken.docx",
      variant: "destructive",
    });
    expect(target.value).toBe("");
    consoleSpy.mockRestore();
  });
});
