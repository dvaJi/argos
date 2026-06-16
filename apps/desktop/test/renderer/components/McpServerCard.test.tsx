import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import McpServerCard from "@/components/mcp-config/components/McpServerCard";

vi.mock("@iconify/react", () => ({
  Icon: () => null,
}));

const server = {
  name: "demo",
  icons: "D",
  descriptions: "Demo MCP server",
  command: "demo",
  args: [],
  enabled: false,
  isRunning: false,
};

const renderCard = (onClick = vi.fn()) => {
  const onToggle = vi.fn();
  const onViewTools = vi.fn();
  const onViewPrompts = vi.fn();
  const onViewResources = vi.fn();

  const result = render(
    <McpServerCard
      server={server}
      toolsCount={1}
      promptsCount={1}
      resourcesCount={1}
      onClick={onClick}
      onToggle={onToggle}
      onViewTools={onViewTools}
      onViewPrompts={onViewPrompts}
      onViewResources={onViewResources}
    />,
  );

  return { ...result, onClick, onToggle, onViewTools, onViewPrompts, onViewResources };
};

describe("McpServerCard", () => {
  it("still lets the card surface open details", async () => {
    const { container, onClick } = renderCard();

    await fireEvent.click(container.firstElementChild!);

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not open details when toggling a server", async () => {
    const { onToggle, onClick } = renderCard();

    const switchEl = screen.getByTestId("server-switch");
    await fireEvent.click(switchEl);

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not open details when using footer actions", async () => {
    const { onViewTools, onViewPrompts, onViewResources, onClick } = renderCard();

    const footerButtons = screen.getAllByRole("button").filter((button) => button.textContent === "1");

    await fireEvent.click(footerButtons[0]);
    await fireEvent.click(footerButtons[1]);
    await fireEvent.click(footerButtons[2]);

    expect(onViewTools).toHaveBeenCalledTimes(1);
    expect(onViewPrompts).toHaveBeenCalledTimes(1);
    expect(onViewResources).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });
});
