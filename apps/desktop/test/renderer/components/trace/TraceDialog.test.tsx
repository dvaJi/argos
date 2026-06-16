import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const { listMessageTracesMock } = vi.hoisted(() => ({
  listMessageTracesMock: vi.fn<(...args: any[]) => any>(),
}));

vi.mock("@api/SessionClient", () => ({
  createSessionClient: vi.fn<(...args: any[]) => any>(() => ({
    listMessageTraces: listMessageTracesMock,
  })),
}));

vi.mock("@api/DeviceClient", () => ({
  createDeviceClient: vi.fn<(...args: any[]) => any>(() => ({
    copyText: vi.fn<(...args: any[]) => any>(),
  })),
}));

vi.mock("@/stores/uiSettingsStore", () => ({
  useUiSettingsStore: () => ({
    formattedCodeFontFamily: "monospace",
  }),
}));

vi.mock("stream-monaco", () => ({
  useMonaco: () => ({
    createEditor: vi.fn<(...args: any[]) => any>(),
    updateCode: vi.fn<(...args: any[]) => any>(),
    cleanupEditor: vi.fn<(...args: any[]) => any>(),
    getEditorView: vi.fn<(...args: any[]) => any>().mockReturnValue({
      updateOptions: vi.fn<(...args: any[]) => any>(),
    }),
  }),
}));

vi.mock("@shadcn/components/ui/dialog", () => ({
  Dialog: ({ children }: Record<string, any>) => <div>{children}</div>,
  DialogContent: ({ children }: Record<string, any>) => <div>{children}</div>,
  DialogHeader: ({ children }: Record<string, any>) => <div>{children}</div>,
  DialogTitle: ({ children }: Record<string, any>) => <div>{children}</div>,
  DialogFooter: ({ children }: Record<string, any>) => <div>{children}</div>,
}));

vi.mock("@shadcn/components/ui/button", () => ({
  Button: ({ children, onClick, ...props }: Record<string, any>) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("@shadcn/components/ui/spinner", () => ({
  Spinner: () => <div className="spinner" />,
}));

vi.mock("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <span data-icon={icon} />,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import TraceDialog from "@/components/trace/TraceDialog";

const mountDialog = () => render(<TraceDialog messageId={null} agentId={null} />);

describe("TraceDialog", () => {
  it("shows latest trace by default and supports switching trace history", async () => {
    listMessageTracesMock.mockResolvedValue([
      {
        id: "t2",
        messageId: "m1",
        sessionId: "s1",
        providerId: "openai",
        modelId: "gpt-4o",
        requestSeq: 2,
        endpoint: "https://api.example.com/second",
        headersJson: '{"x":"2"}',
        bodyJson: '{"b":2}',
        truncated: false,
        createdAt: 2000,
      },
      {
        id: "t1",
        messageId: "m1",
        sessionId: "s1",
        providerId: "openai",
        modelId: "gpt-4o",
        requestSeq: 1,
        endpoint: "https://api.example.com/first",
        headersJson: '{"x":"1"}',
        bodyJson: '{"b":1}',
        truncated: false,
        createdAt: 1000,
      },
    ]);

    const { rerender } = mountDialog();

    rerender(<TraceDialog messageId="m1" agentId={null} />);
    await act(async () => {});

    expect(listMessageTracesMock).toHaveBeenCalledWith("m1");
    expect(screen.getByText(/https:\/\/api\.example\.com\/second/)).toBeTruthy();

    const historyButton = screen.getAllByRole("button").find((btn) => btn.textContent?.trim() === "#1");
    expect(historyButton).toBeDefined();

    await act(async () => {
      fireEvent.click(historyButton!);
    });
    await act(async () => {});

    expect(screen.getByText(/https:\/\/api\.example\.com\/first/)).toBeTruthy();
  });
});
