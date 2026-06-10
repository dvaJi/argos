import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

const createSession = (options?: { isPinned?: boolean; status?: "none" | "working" | "completed" | "error" }) => ({
  id: "session-1",
  title: "Session Title",
  agentId: "deepchat",
  status: options?.status ?? ("none" as const),
  projectDir: "",
  providerId: "provider-1",
  modelId: "model-1",
  isPinned: options?.isPinned ?? false,
  isDraft: false,
  createdAt: 1,
  updatedAt: 1,
});

vi.mock("@iconify/react", () => ({
  Icon: () => null,
}));

const mountComponent = async (options?: {
  isPinned?: boolean;
  status?: "none" | "working" | "completed" | "error";
  heroHidden?: boolean;
  pinFeedbackMode?: "pinning" | "unpinning" | null;
  searchQuery?: string;
  shortcutBadgeLabel?: string | null;
  shortcutBadgeVisible?: boolean;
}) => {
  vi.resetModules();

  const WindowSideBarSessionItem = (await import("@/components/WindowSideBarSessionItem")).default;

  const onSelect = vi.fn();
  const onTogglePin = vi.fn();
  const onDelete = vi.fn();

  const result = render(
    <WindowSideBarSessionItem
      session={createSession(options)}
      active={false}
      region={options?.isPinned ? "pinned" : "grouped"}
      heroHidden={options?.heroHidden ?? false}
      pinFeedbackMode={options?.pinFeedbackMode ?? null}
      searchQuery={options?.searchQuery ?? ""}
      shortcutBadgeLabel={options?.shortcutBadgeLabel ?? null}
      shortcutBadgeVisible={options?.shortcutBadgeVisible ?? false}
      onSelect={onSelect}
      onTogglePin={onTogglePin}
      onDelete={onDelete}
    />,
  );

  return { ...result, onSelect, onTogglePin, onDelete };
};

describe("WindowSideBarSessionItem", () => {
  it("emits select when the list item is clicked", async () => {
    const { container, onSelect } = await mountComponent();

    await act(async () => {
      fireEvent.click(container.querySelector(".session-item")!);
    });

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "session-1" }));
  }, 10000);

  it("renders the correct pin action label for pinned and unpinned sessions", async () => {
    const { container: unpinnedContainer } = await mountComponent({ isPinned: false });
    const { container: pinnedContainer } = await mountComponent({ isPinned: true });

    const unpinnedPinButton = unpinnedContainer.querySelector('[aria-label="thread.actions.pin"]') as HTMLElement;
    const pinnedPinButton = pinnedContainer.querySelector('[aria-label="thread.actions.unpin"]') as HTMLElement;

    expect(unpinnedPinButton).toBeTruthy();
    expect(unpinnedPinButton.getAttribute("aria-pressed")).toBe("false");
    expect(pinnedPinButton).toBeTruthy();
    expect(pinnedPinButton.getAttribute("aria-pressed")).toBe("true");
  }, 10000);

  it("emits toggle-pin and delete with the session payload", async () => {
    const { container, onTogglePin, onDelete } = await mountComponent();

    await act(async () => {
      fireEvent.click(container.querySelector('[aria-label="thread.actions.pin"]')!);
    });
    await act(async () => {
      fireEvent.click(container.querySelector('[aria-label="thread.actions.delete"]')!);
    });

    expect(onTogglePin).toHaveBeenCalledWith(expect.objectContaining({ id: "session-1" }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: "session-1" }));
  }, 10000);

  it("applies the loading shimmer to the title without rendering loading text", async () => {
    const { container } = await mountComponent({ status: "working" });

    const title = container.querySelector(".session-title") as HTMLElement;
    const sheen = container.querySelector(".session-title__sheen") as HTMLElement;

    expect(title.classList.contains("session-title--loading")).toBe(true);
    expect(sheen).toBeTruthy();
    expect(sheen.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".session-status-loading")).toBeFalsy();
    expect(container).not.toHaveTextContent("common.loading");
    expect(container.querySelector('[aria-label="thread.actions.pin"]')).toBeTruthy();
  }, 10000);

  it("exposes hero transition class and pin feedback state on the rendered item", async () => {
    const { container } = await mountComponent({
      isPinned: true,
      heroHidden: true,
      pinFeedbackMode: "pinning",
    });

    const item = container.querySelector(".session-item") as HTMLElement;

    expect(item.getAttribute("data-pin-fx")).toBe("pinning");
    expect(item.getAttribute("data-session-id")).toBe("session-1");
    expect(item.classList.contains("is-hero-hidden")).toBe(true);
    expect(item.getAttribute("data-pin-state")).toBe("docked");
  }, 10000);

  it("keeps the pin layout docked while unpinning feedback is active", async () => {
    const { container } = await mountComponent({
      isPinned: false,
      pinFeedbackMode: "unpinning",
    });

    expect(container.querySelector(".session-item")!.getAttribute("data-pin-state")).toBe("docked");
  }, 10000);

  it("highlights matching title fragments when filtering the sidebar", async () => {
    const { container } = await mountComponent({
      searchQuery: "Title",
    });

    const highlight = container.querySelector(".session-title__highlight") as HTMLElement;
    expect(highlight).toBeTruthy();
    expect(highlight.textContent).toBe("Title");
  }, 10000);

  it("renders shortcut badges independently from the delete action", async () => {
    const { container: badgeContainer } = await mountComponent({
      shortcutBadgeLabel: "⌘2",
      shortcutBadgeVisible: true,
    });

    const badge = badgeContainer.querySelector('[data-testid="sidebar-session-shortcut-badge"]') as HTMLElement;

    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe("⌘2");
    expect(badge.getAttribute("aria-label")).toBe("thread.actions.switchWithShortcut");
    expect(badgeContainer.querySelector('[aria-label="thread.actions.delete"]')).toBeFalsy();
    expect(
      (badgeContainer.querySelector(".right-button") as HTMLElement).getAttribute("data-shortcut-badge-visible"),
    ).toBe("true");

    const { container: normalContainer } = await mountComponent({
      shortcutBadgeLabel: "⌘2",
      shortcutBadgeVisible: false,
    });

    expect(normalContainer.querySelector('[data-testid="sidebar-session-shortcut-badge"]')).toBeFalsy();
    expect(normalContainer.querySelector('[aria-label="thread.actions.delete"]')).toBeTruthy();
    expect(
      (normalContainer.querySelector(".right-button") as HTMLElement).getAttribute("data-shortcut-badge-visible"),
    ).toBeNull();
  }, 10000);
});
