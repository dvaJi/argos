import { describe, expect, it, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import SvgArtifact from "#/components/artifacts/SvgArtifact";

vi.mock("#api/DeviceClient", () => ({
  createDeviceClient: vi.fn<(...args: any[]) => any>(() => ({
    sanitizeSvgContent: vi.fn<(...args: any[]) => any>(async (content: string) => content),
  })),
}));

describe("SvgArtifact", () => {
  it("uses full-height flex classes for sanitized previews", async () => {
    render(
      <SvgArtifact
        block={{
          content: '<svg viewBox="0 0 10 10"><rect width="10" height="10" /></svg>',
          artifact: { type: "image/svg+xml", title: "Diagram" },
        }}
      />,
    );

    await act(async () => {});

    const root = screen.getByTestId("svg-artifact-root");
    expect([...root.classList]).toEqual(
      expect.arrayContaining(["artifact-dialog-content", "flex", "h-full", "min-h-0", "w-full", "overflow-auto"]),
    );
    const content = screen.getByTestId("svg-artifact-content");
    expect([...content.classList]).toEqual(
      expect.arrayContaining(["flex", "min-h-full", "w-full", "flex-1", "items-center", "justify-center"]),
    );
  });
});
