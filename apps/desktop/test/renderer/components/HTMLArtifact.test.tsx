import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import HTMLArtifact from "#/components/artifacts/HTMLArtifact";

describe("HTMLArtifact", () => {
  it("uses full-height classes for desktop viewport", () => {
    render(
      <HTMLArtifact
        block={{
          content: "<html><body>Hello</body></html>",
          artifact: { type: "text/html", title: "doc" },
        }}
        isPreview
        viewportSize="desktop"
      />,
    );

    const root = screen.getByTestId("html-artifact-root");
    expect(root.className).toEqual(expect.arrayContaining(["flex", "h-full", "min-h-0", "w-full", "overflow-hidden"]));
    const iframe = screen.getByTestId("html-artifact-iframe");
    expect(iframe.className).toEqual(expect.arrayContaining(["block", "h-full", "min-h-0", "w-full"]));
  });

  it("applies correct classes and styles for mobile viewport", () => {
    render(
      <HTMLArtifact
        block={{
          content: "<html><body>Hello</body></html>",
          artifact: { type: "text/html", title: "doc" },
        }}
        isPreview
        viewportSize="mobile"
      />,
    );

    const iframe = screen.getByTestId("html-artifact-iframe");
    expect(iframe).toBeTruthy();
    const cls = iframe.className || "";
    expect(cls).toContain("html-iframe-wrapper");
    expect(cls).toContain("border");

    const style = iframe.style.cssText || "";
    expect(style).toContain("width: 375px");
    expect(style).toContain("height: 667px");
  });
});
