import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { SuggestionListItem } from "@/components/chat/mentions/SuggestionList";
import SuggestionList from "@/components/chat/mentions/SuggestionList";

const buildItems = (count: number): SuggestionListItem[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `tool:${index + 1}`,
    label: `tool-${index + 1}`,
    category: "tool",
    payload: { id: index + 1 },
  }));

describe("SuggestionList", () => {
  beforeEach(() => {
    HTMLElement.prototype.scrollIntoView = vi.fn<(...args: any[]) => any>();
  });

  it("renders command suggestions with a command icon instead of a slash tag", () => {
    const items: SuggestionListItem[] = [
      {
        id: "command:plan",
        label: "/plan",
        category: "command",
        payload: { name: "plan", description: "", input: null },
      },
    ];

    const { container } = render(<SuggestionList items={items} query="" command={vi.fn<(...args: any[]) => any>()} />);

    expect(container.querySelector('[data-icon="lucide:command"]')).toBeTruthy();
    expect(container).toHaveTextContent("/plan");
    expect((container.textContent?.match(/\//g) ?? []).length).toBe(1);
  });

  it("renders the full upstream item list without truncating", () => {
    const items = buildItems(25);

    const { container } = render(<SuggestionList items={items} query="" command={vi.fn<(...args: any[]) => any>()} />);

    expect(container.querySelectorAll("button")).toHaveLength(25);
    expect(container).toHaveTextContent("tool-25");
  });

  it("keeps keyboard navigation aligned with the full item list", () => {
    const items = buildItems(25);
    const command = vi.fn<(...args: any[]) => any>();

    const { container } = render(<SuggestionList items={items} query="" command={command} />);

    const listEl = container.firstElementChild!;
    fireEvent.keyDown(listEl, { key: "ArrowUp" });
    fireEvent.keyDown(listEl, { key: "Enter" });

    expect(command).toHaveBeenCalledWith(items[24]);
  });
});
