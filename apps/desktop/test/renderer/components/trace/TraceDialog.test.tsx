import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const { listMessageTracesMock, getViewManifestsMock } = vi.hoisted(() => ({
  listMessageTracesMock: vi.fn<(...args: any[]) => any>(),
  getViewManifestsMock: vi.fn<(...args: any[]) => any>(),
}));

vi.mock("@api/SessionClient", () => ({
  createSessionClient: vi.fn<(...args: any[]) => any>(() => ({
    listMessageTraces: listMessageTracesMock,
    getViewManifests: getViewManifestsMock,
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
  getFormattedCodeFontFamily: () => "monospace",
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

import TraceDialog from "@/components/trace/TraceDialog";

const mountDialog = () => render(<TraceDialog messageId={null} agentId={null} onClose={() => {}} />);

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

    rerender(<TraceDialog messageId="m1" agentId={null} onClose={() => {}} />);
    await act(async () => {});

    expect(listMessageTracesMock).toHaveBeenCalledWith("m1");
    expect(screen.getAllByText(/https:\/\/api\.example\.com\/second/).length).toBeGreaterThan(0);

    const historyButton = screen.getAllByRole("button").find((btn) => btn.textContent?.trim() === "#1");
    expect(historyButton).toBeDefined();

    await act(async () => {
      fireEvent.click(historyButton!);
    });
    await act(async () => {});

    expect(screen.getAllByText(/https:\/\/api\.example\.com\/first/).length).toBeGreaterThan(0);
  });

  it("renders a lineage rail and lets the user pick a manifest node", async () => {
    listMessageTracesMock.mockResolvedValue([
      {
        id: "t1",
        messageId: "m1",
        sessionId: "s1",
        providerId: "openai",
        modelId: "gpt-4o",
        requestSeq: 2,
        endpoint: "https://api.example.com/x",
        headersJson: "{}",
        bodyJson: "{}",
        truncated: false,
        createdAt: 2000,
      },
    ]);
    const makeManifestRecord = (
      requestSeq: number,
      assembledAt: number,
      integrity: "valid" | "invalid" | "unverified",
    ) => ({
      sessionId: "s1",
      messageId: requestSeq === 2 ? "m1" : "m0",
      requestSeq,
      entryId: requestSeq,
      createdAt: assembledAt,
      integrity,
      manifest: {
        schemaVersion: 1,
        hashVersion: 1,
        viewId: `view_${requestSeq}`,
        sessionId: "s1",
        messageId: requestSeq === 2 ? "m1" : "m0",
        requestSeq,
        taskType: "chat",
        policy: "legacy_context_v1",
        policyVersion: null,
        contextBuilderVersion: "legacy-v1",
        latestEntryId: 0,
        anchorEntryIds: [],
        parentViewId: requestSeq === 1 ? null : "view_1",
        included: [],
        excluded: [],
        tokenBudget: {
          contextLength: 8000,
          requestedMaxTokens: 4000,
          effectiveMaxTokens: 4000,
          reserveTokens: 500,
          toolReserveTokens: 0,
          estimatedPromptTokens: 10,
        },
        hashes: { promptHash: "p", toolDefinitionsHash: "t", manifestHash: "h" },
        meta: {
          providerId: "openai",
          modelId: "gpt-4o",
          summaryCursorOrderSeq: 1,
          supportsVision: false,
          supportsAudioInput: false,
          traceDebugEnabled: false,
        },
        assembledAt,
      },
    });
    getViewManifestsMock.mockResolvedValue([
      makeManifestRecord(1, 1000, "valid"),
      makeManifestRecord(2, 2000, "invalid"),
    ]);

    render(<TraceDialog messageId="m1" sessionId="s1" agentId={null} onClose={() => {}} />);
    await act(async () => {});
    await act(async () => {});

    expect(screen.getByText("Lineage:")).toBeTruthy();
    expect(screen.getByText("#1")).toBeTruthy();
    expect(screen.getByText("#2")).toBeTruthy();
    // #2 is selected by default (matches the trace's messageId m1)
    expect(screen.getByText("view_2")).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByText("#1"));
    });
    await act(async () => {});

    expect(screen.getByText("view_1")).toBeTruthy();
  });
});
