import { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@iconify/react";
import { useSpotlightStore, type SpotlightItem } from "#/stores/ui/spotlight";

export default function SpotlightOverlay() {
  const spotlightStore = useSpotlightStore();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultsContainerRef = useRef<HTMLDivElement | null>(null);
  const pointerActivatedItemId = useRef<string | null>(null);
  const activeChangeSource = useRef<"keyboard" | "mouse">("keyboard");
  const mouseEnterRaf = useRef(0);
  const pendingMouseEnterId = useRef<string | number | null>(null);

  const focusInput = useCallback((): number => {
    return window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  }, []);

  const resolveItemTitle = useCallback((item: SpotlightItem): string => {
    if (item.title) return item.title;
    if (item.titleKey) return item.titleKey;
    return "";
  }, []);

  const highlightSegments = useCallback(
    (value: string) => {
      const query = spotlightStore.query.trim();
      if (!query) return [{ text: value, match: false }];

      const lowerValue = value.toLowerCase();
      const lowerQuery = query.toLowerCase();
      const segments: Array<{ text: string; match: boolean }> = [];
      let searchIndex = 0;
      let matchIndex = lowerValue.indexOf(lowerQuery);

      while (matchIndex !== -1) {
        if (matchIndex > searchIndex) {
          segments.push({ text: value.slice(searchIndex, matchIndex), match: false });
        }
        segments.push({
          text: value.slice(matchIndex, matchIndex + query.length),
          match: true,
        });
        searchIndex = matchIndex + query.length;
        matchIndex = lowerValue.indexOf(lowerQuery, searchIndex);
      }

      if (searchIndex < value.length) {
        segments.push({ text: value.slice(searchIndex), match: false });
      }

      return segments.length > 0 ? segments : [{ text: value, match: false }];
    },
    [spotlightStore.query],
  );

  const handleKeydown = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        spotlightStore.closeSpotlight();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        activeChangeSource.current = "keyboard";
        spotlightStore.moveActiveItem(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        activeChangeSource.current = "keyboard";
        spotlightStore.moveActiveItem(-1);
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        activeChangeSource.current = "keyboard";
        spotlightStore.setActiveItem(0);
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        activeChangeSource.current = "keyboard";
        spotlightStore.setActiveItem(spotlightStore.results.length - 1);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        void spotlightStore.executeActiveItem();
      }
    },
    [spotlightStore],
  );

  const handleItemMouseEnter = useCallback(
    (item: SpotlightItem) => {
      const currentIndex = spotlightStore.results.findIndex((r) => r.id === item.id);
      if (currentIndex === -1 || spotlightStore.activeIndex === currentIndex) return;
      pendingMouseEnterId.current = item.id;
      if (mouseEnterRaf.current !== 0) return;
      mouseEnterRaf.current = window.requestAnimationFrame(() => {
        mouseEnterRaf.current = 0;
        const targetId = pendingMouseEnterId.current;
        pendingMouseEnterId.current = null;
        if (targetId === null) return;
        const foundItem = spotlightStore.results.find((r) => r.id === targetId);
        if (!foundItem) return;
        const targetIndex = spotlightStore.results.findIndex((r) => r.id === targetId);
        if (targetIndex < 0 || spotlightStore.activeIndex === targetIndex) return;
        activeChangeSource.current = "mouse";
        spotlightStore.setActiveItem(targetIndex);
      });
    },
    [spotlightStore],
  );

  const handleItemMouseDown = useCallback(
    (event: React.MouseEvent, item: SpotlightItem) => {
      if (event.button !== 0) return;
      event.preventDefault();
      pointerActivatedItemId.current = item.id;
      void spotlightStore.executeItem(item);
      window.setTimeout(() => {
        if (pointerActivatedItemId.current === item.id) {
          pointerActivatedItemId.current = null;
        }
      }, 0);
    },
    [spotlightStore],
  );

  const handleItemClick = useCallback(
    (item: SpotlightItem) => {
      if (pointerActivatedItemId.current === item.id) {
        pointerActivatedItemId.current = null;
        return;
      }
      void spotlightStore.executeItem(item);
    },
    [spotlightStore],
  );

  useEffect(() => {
    if (!spotlightStore.open) return;
    const focusTimer = focusInput();
    return () => {
      window.clearTimeout(focusTimer);
    };
  }, [spotlightStore.open, spotlightStore.activationKey, focusInput]);

  useEffect(() => {
    if (
      !spotlightStore.open ||
      spotlightStore.activeIndex < 0 ||
      spotlightStore.activeIndex >= spotlightStore.results.length
    )
      return;
    if (activeChangeSource.current === "mouse") return;

    const scrollTimer = setTimeout(() => {
      resultsContainerRef.current
        ?.querySelector<HTMLElement>('[data-spotlight-active="true"]')
        ?.scrollIntoView({ block: "nearest" });
    }, 0);

    return () => clearTimeout(scrollTimer);
  }, [spotlightStore.open, spotlightStore.activeIndex, spotlightStore.results.length]);

  if (!spotlightStore.open) return null;

  return createPortal(
    <div
      className="window-no-drag-region fixed inset-0 z-[90] flex items-start justify-center px-4 pt-16"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) spotlightStore.closeSpotlight();
      }}
    >
      <div className="spotlight-panel window-no-drag-region flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl backdrop-blur-[26px]">
        <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
          <Icon icon="lucide:search" className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={spotlightStore.query}
            className="h-9 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="Search conversations, settings..."
            onChange={(e) => spotlightStore.setQuery(e.target.value)}
            onKeyDown={handleKeydown as unknown as React.KeyboardEventHandler<HTMLInputElement>}
          />
        </div>

        <div ref={resultsContainerRef} className="max-h-[28rem] overflow-y-auto p-2">
          {spotlightStore.results.length > 0 ? (
            spotlightStore.results.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left${
                  index === spotlightStore.activeIndex ? " bg-accent text-accent-foreground" : " text-foreground/90"
                }`}
                data-spotlight-active={index === spotlightStore.activeIndex ? "true" : undefined}
                onMouseEnter={() => handleItemMouseEnter(item)}
                onMouseDown={(e) => handleItemMouseDown(e, item)}
                onClick={() => handleItemClick(item)}
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-background">
                  <Icon icon={item.icon} className="h-4 w-4 text-muted-foreground" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {highlightSegments(resolveItemTitle(item)).map((segment, segmentIndex) =>
                        segment.match ? (
                          <mark
                            key={`${item.id}-title-${segmentIndex}`}
                            className="rounded bg-primary/15 px-0.5 text-inherit"
                          >
                            {segment.text}
                          </mark>
                        ) : (
                          <span key={`${item.id}-title-${segmentIndex}`}>{segment.text}</span>
                        ),
                      )}
                    </span>
                    <span className="shrink-0 rounded-full border border-border/70 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {item.kind}
                    </span>
                  </span>
                  {item.subtitle && (
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.subtitle}</span>
                  )}
                  {item.snippet && (
                    <span className="mt-1 block line-clamp-2 text-xs text-muted-foreground">{item.snippet}</span>
                  )}
                </span>
              </button>
            ))
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center text-muted-foreground">
              <Icon
                icon={spotlightStore.loading ? "lucide:loader-circle" : "lucide:search-x"}
                className={`h-5 w-5${spotlightStore.loading ? " animate-spin" : ""}`}
              />
              <p className="text-sm font-medium">{spotlightStore.loading ? "Searching..." : "No results found"}</p>
              <p className="text-xs">Try a different search term</p>
            </div>
          )}
        </div>

        <div className="border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
          Use arrow keys to navigate, Enter to select, Esc to close
        </div>
      </div>
    </div>,
    document.body,
  );
}
