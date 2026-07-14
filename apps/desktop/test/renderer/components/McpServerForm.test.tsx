import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MCPServerConfig } from "@argos/shared/presenter";

vi.mock("#/components/emoji-picker", () => ({
  EmojiPicker: ({ modelValue }: { modelValue: string }) => <div data-testid="emoji-picker">{modelValue}</div>,
}));

vi.mock("#api/DeviceClient", () => ({
  createDeviceClient: () => ({
    selectDirectory: vi.fn(),
  }),
}));

vi.mock("@iconify/react", () => ({
  Icon: () => null,
}));

import McpServerForm from "#/components/mcp-config/mcpServerForm";

describe("McpServerForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  it("renders and saves edit-mode arguments without circular state updates", () => {
    const onSubmit = vi.fn();
    const initialConfig = {
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem"],
      env: {},
      enabled: true,
    } as MCPServerConfig;

    render(<McpServerForm serverName="filesystem" initialConfig={initialConfig} editMode onSubmit={onSubmit} />);

    const argumentInputs = screen.getAllByPlaceholderText("Argument value");
    expect(argumentInputs).toHaveLength(2);
    expect(argumentInputs[0]).toHaveValue("-y");
    expect(argumentInputs[1]).toHaveValue("@modelcontextprotocol/server-filesystem");

    fireEvent.change(argumentInputs[1], { target: { value: "@modelcontextprotocol/server-memory" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledWith(
      "filesystem",
      expect.objectContaining({
        args: ["-y", "@modelcontextprotocol/server-memory"],
      }),
    );
  });

  it("hydrates argument rows when parsing JSON configuration", () => {
    render(<McpServerForm onSubmit={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("JSON Configuration"), {
      target: {
        value: JSON.stringify({
          mcpServers: {
            memory: {
              type: "stdio",
              command: "npx",
              args: ["-y", "@modelcontextprotocol/server-memory"],
            },
          },
        }),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Parse & Continue" }));

    const argumentInputs = screen.getAllByPlaceholderText("Argument value");
    expect(argumentInputs).toHaveLength(2);
    expect(argumentInputs[0]).toHaveValue("-y");
    expect(argumentInputs[1]).toHaveValue("@modelcontextprotocol/server-memory");
  });
});
