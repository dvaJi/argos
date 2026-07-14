import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import McpServerCard from "#/components/mcp-config/components/McpServerCard";

const server = {
  name: "Artifacts",
  icons: "🎨",
  descriptions: "Argos built-in artifacts MCP service",
  command: "artifacts",
  args: [],
  enabled: true,
  isRunning: false,
};

describe("McpServerCard lifecycle action", () => {
  it("offers a direct start action for an enabled stopped server", () => {
    const onRuntimeToggle = vi.fn();
    render(<McpServerCard server={server} onRuntimeToggle={onRuntimeToggle} />);

    fireEvent.click(screen.getByRole("button", { name: "Start Artifacts" }));

    expect(onRuntimeToggle).toHaveBeenCalledTimes(1);
  });

  it("changes the action to stop while running", () => {
    render(<McpServerCard server={{ ...server, isRunning: true }} onRuntimeToggle={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Stop Artifacts" })).toBeTruthy();
  });
});
