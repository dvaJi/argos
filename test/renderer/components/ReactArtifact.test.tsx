import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import ReactArtifact from "@/components/artifacts/ReactArtifact";

describe("ReactArtifact", () => {
  it("uses full-height iframe classes without fixed minimum height", () => {
    render(
      <ReactArtifact
        block={{
          content: "export default function App() { return <div>Hello</div> }",
          artifact: { type: "application/vnd.ant.react", title: "App" },
        }}
        isPreview={true}
      />,
    );

    const root = screen.getByTestId("react-artifact-root");
    expect([...root.classList]).toEqual(
      expect.arrayContaining(["flex", "h-full", "min-h-0", "w-full", "overflow-hidden"]),
    );

    const iframe = screen.getByTestId("react-artifact-iframe");
    expect([...iframe.classList]).toEqual(
      expect.arrayContaining(["html-iframe-wrapper", "h-full", "min-h-0", "w-full"]),
    );
    expect(iframe.getAttribute("class")).not.toContain("min-h-[400px]");
  });
});
