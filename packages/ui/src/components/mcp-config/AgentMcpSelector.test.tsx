import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";

const getMcpServers = vi.fn<() => Promise<Record<string, { type?: string }>>>(async () => ({ fs: { type: "stdio" } }));
const getAcpSharedMcpSelections = vi.fn<() => Promise<string[]>>(async () => ["fs"]);

vi.mock("#api/ConfigClient", () => ({
  createConfigClient: () => ({
    getMcpServers,
    getAcpSharedMcpSelections,
    setAcpSharedMcpSelections: vi.fn<() => Promise<void>>(),
  }),
}));
vi.mock("#/components/use-toast", () => ({ useToast: () => ({ toast: vi.fn<() => void>() }) }));

describe("AgentMcpSelector", () => {
  it("loads once even when the parent re-renders with a new inline callback", async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const { default: AgentMcpSelector } = await import("./AgentMcpSelector");

    // The parent stores the reported count, so every report re-renders it with
    // a fresh callback — the shape that previously looped forever.
    const Parent = () => {
      const [count, setCount] = useState(-1);
      return (
        <div data-count={count}>
          <AgentMcpSelector onUpdateSelections={(selections) => setCount(selections.length)} />
        </div>
      );
    };

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<Parent />));
    for (let i = 0; i < 10; i++) await act(async () => await Promise.resolve());

    expect(getMcpServers).toHaveBeenCalledTimes(1);
    expect(container.querySelector("[data-count]")?.getAttribute("data-count")).toBe("1");

    await act(async () => root.unmount());
    container.remove();
  });
});
