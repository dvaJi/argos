import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The icon container applies its own rounding/clip; icons whose artwork is a
// full-bleed brand tile (own background + baked-in radius) must opt out so
// the two radii don't compound and clip into the glyph.

const MARKUP =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><path fill="#000" d="M0 0h16v16H0z"/></svg>';
const getAcpRegistryIconMarkup = vi.fn<(agentId: string, iconUrl: string) => Promise<string>>(async () => MARKUP);

vi.mock("#api/ConfigClient", () => ({
  createConfigClient: () => ({ getAcpRegistryIconMarkup }),
}));

const CDN_ICON = "https://cdn.agentclientprotocol.com/registry/v1/latest/command-code.svg";

const flush = async () => {
  for (let i = 0; i < 5; i++) await act(async () => await Promise.resolve());
};

describe("AcpAgentIcon", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement("div");
    document.body.appendChild(container);
    getAcpRegistryIconMarkup.mockClear();
  });

  afterEach(() => container.remove());

  const renderIcon = async (agentId: string) => {
    const { default: AcpAgentIcon } = await import("./AcpAgentIcon");
    const root = createRoot(container);
    await act(async () => {
      root.render(<AcpAgentIcon agentId={agentId} icon={CDN_ICON} fallbackText={agentId} />);
    });
    await flush();
    return container.firstElementChild as HTMLElement;
  };

  it("drops the container rounding for full-bleed tile icons", async () => {
    const host = await renderIcon("command-code");

    expect(host?.className).not.toContain("rounded-md");
    expect(host?.className).not.toContain("overflow-hidden");
    // The icon markup still renders inside.
    expect(host?.querySelector("svg")).not.toBeNull();
  });

  it("keeps the container rounding for regular registry icons", async () => {
    const host = await renderIcon("claude-acp");

    expect(host?.className).toContain("rounded-md");
    expect(host?.className).toContain("overflow-hidden");
    expect(host?.querySelector("svg")).not.toBeNull();
  });
});
