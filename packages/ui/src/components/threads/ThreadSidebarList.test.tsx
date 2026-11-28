import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UISession } from "#/stores/ui/session";
import { settleSession, snoozeSession, threadSidebarStore } from "#/stores/ui/threadSidebar";

/**
 * Order guard for the thread sidebar (docs/issues/thread-sidebar-order-and-scroll): sections, published rows
 * (`onVisibleRowsChange`, which feeds Alt/⌘+N), shortcut badges and ArrowDown navigation must all follow the
 * same sequence — Pinned, Working, Active, Snoozed, Settled.
 */

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn<() => void>() }));

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useNavigate: () => navigate,
}));
vi.mock("#api/ConfigClient", () => ({
  createConfigClient: () => ({
    getSetting: async () => undefined,
    setSetting: async () => undefined,
    onAgentsChanged: () => () => {},
    onEntriesChanged: () => () => {},
  }),
}));
vi.mock("#api/SessionClient", () => ({ createSessionClient: () => ({}) }));
// The real session store binds Electron IPC at import; the list only reads state, so back it with a plain store.
vi.mock("#/stores/ui/session", async () => {
  const { Store } = await import("@tanstack/store");
  const { useSelector } = await import("@tanstack/react-store");
  const sessionStore = new Store({
    sessions: [] as UISession[],
    activeSessionId: null as string | null,
    hasLoadedInitialPage: false,
    hasMore: false,
    loading: false,
    loadingMore: false,
  });
  return {
    sessionStore,
    useSessionStore: () => useSelector(sessionStore),
    clearSessionContextForMachineSwitch: () => undefined,
    fetchSessions: async () => undefined,
    onSessionUnarchived: () => () => {},
  };
});

const MINUTE = 60_000;
const SECTION_LABELS = ["Pinned threads", "Working threads", "Active threads", "Snoozed threads", "Settled threads"];

const makeSession = (id: string, overrides: Partial<UISession> = {}): UISession => ({
  id,
  title: `Thread ${id}`,
  agentId: "agent-1",
  status: "none",
  projectDir: "",
  isPinned: false,
  isDraft: false,
  sessionKind: "regular",
  parentSessionId: null,
  subagentEnabled: false,
  subagentMeta: null,
  createdAt: Date.now() - 10 * MINUTE,
  updatedAt: Date.now() - 5 * MINUTE,
  ...overrides,
});

/** One or two threads per section; ties inside a section break on id, so the numeric prefix is the row order. */
const THREADS: UISession[] = [
  makeSession("1-pinned", { isPinned: true }),
  makeSession("2-working-open", { status: "working" }),
  makeSession("3-working", { status: "working" }),
  makeSession("4-active", { status: "new_results" }),
  makeSession("5-active"),
  makeSession("6-snoozed"),
  makeSession("7-settled"),
];

const flush = async () => {
  for (let i = 0; i < 8; i++) await act(async () => await Promise.resolve());
};

/** Fresh stores for every run: recent activity keeps everything but the explicit settle/snooze out of Settled. */
const seed = async () => {
  const { sessionStore } = await import("#/stores/ui/session");
  sessionStore.setState((prev) => ({
    ...prev,
    sessions: [],
    activeSessionId: null,
    hasLoadedInitialPage: true,
    hasMore: false,
    loading: false,
    loadingMore: false,
  }));
  threadSidebarStore.setState((prev) => ({
    ...prev,
    overrideById: {},
    snoozeById: {},
    workingSinceById: {},
    returnedAtById: {},
    shelfExpanded: { working: false, snoozed: false, settled: false },
  }));
  settleSession("7-settled");
  snoozeSession("6-snoozed", Date.now() + 60 * MINUTE);
  // A collapsed shelf still shows the open thread, so Working keeps this row.
  sessionStore.setState((prev) => ({ ...prev, sessions: THREADS, activeSessionId: "2-working-open" }));
  await flush();
};

const cleanupQueue: Array<() => Promise<void>> = [];

const rowIds = (container: HTMLElement) =>
  [...container.querySelectorAll("[data-testid='thread-sidebar-row']")].map((row) =>
    row.getAttribute("data-session-id"),
  );

async function mount() {
  const { default: ThreadSidebarList } = await import("./ThreadSidebarList");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let published: UISession[] = [];

  // Mirrors WindowSideBar: the shell keeps the published rows in state and numbers Alt/⌘+N from them.
  const Shell = () => {
    const [rows, setRows] = useState<UISession[]>([]);
    const getShortcutBadge = (sessionId: string) => {
      const index = rows.findIndex((row) => row.id === sessionId);
      return index >= 0 && index < 10 ? String(index + 1) : null;
    };
    return (
      <ThreadSidebarList
        getShortcutBadge={getShortcutBadge}
        onVisibleRowsChange={(rows) => {
          published = rows;
          setRows(rows);
        }}
      />
    );
  };

  await act(async () => root.render(<Shell />));
  await flush();
  cleanupQueue.push(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  const searchInput = () => container.querySelector<HTMLInputElement>("[data-testid='thread-sidebar-search']")!;
  return {
    container,
    rows: () => rowIds(container),
    published: () => published.map((row) => row.id),
    badges: () =>
      [...container.querySelectorAll("[data-testid='sidebar-session-shortcut-badge']")].map(
        (badge) => badge.textContent,
      ),
    navSelected: () =>
      container
        .querySelector("[data-testid='thread-sidebar-row'][data-nav-selected='true']")
        ?.getAttribute("data-session-id"),
    async click(testId: string) {
      await act(async () => {
        container.querySelector<HTMLButtonElement>(`[data-testid='${testId}']`)!.click();
      });
      await flush();
    },
    async search(query: string) {
      await act(async () => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(searchInput(), query);
        searchInput().dispatchEvent(new Event("input", { bubbles: true }));
      });
      await flush();
    },
    async press(key: string) {
      await act(async () => {
        searchInput().dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      });
      await flush();
    },
  };
}

/** What the user sees top to bottom, next to what the shell is told and what it numbers. */
const readOrder = (ui: Awaited<ReturnType<typeof mount>>) => ({
  sections: [...ui.container.querySelectorAll("section")].map((section) => section.getAttribute("aria-label")),
  rows: ui.rows(),
  published: ui.published(),
  badges: ui.badges(),
});

const expectedOrder = (ids: string[]) => ({
  sections: SECTION_LABELS,
  rows: ids,
  published: ids,
  badges: ids.map((_, index) => String(index + 1)),
});

describe("ThreadSidebarList order", () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    // jsdom has no layout; the list scrolls the ArrowDown selection into view.
    Element.prototype.scrollIntoView = vi.fn<(arg?: boolean | ScrollIntoViewOptions) => void>();
  });

  afterEach(async () => {
    for (const cleanup of cleanupQueue.splice(0)) await cleanup();
  });

  it("renders Working above Active and numbers only the visible rows", async () => {
    await seed();
    const ui = await mount();

    // Shelves start collapsed: the other working row is not rendered, so it takes no number.
    expect(readOrder(ui)).toEqual(expectedOrder(["1-pinned", "2-working-open", "4-active", "5-active"]));

    await ui.click("thread-sidebar-working-toggle");
    expect(readOrder(ui)).toEqual(expectedOrder(["1-pinned", "2-working-open", "3-working", "4-active", "5-active"]));
  });

  it("walks ArrowDown through the rows in visual order while searching", async () => {
    await seed();
    const ui = await mount();
    await ui.search("Thread");

    // Search bypasses the collapsed shelves, so every row is on screen.
    const expected = THREADS.map((thread) => thread.id);
    expect(readOrder(ui)).toEqual(expectedOrder(expected));
    for (const id of expected) {
      await ui.press("ArrowDown");
      expect(ui.navSelected()).toBe(id);
    }
    await ui.press("ArrowDown");
    expect(ui.navSelected()).toBe("7-settled");
  });
});
