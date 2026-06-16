import { useState, useRef, useEffect, useCallback } from "react";
import type { ScrollInfo } from "./types";

const MESSAGE_HIGHLIGHT_CLASS = "message-highlight";
const MAX_SCROLL_RETRIES = 12;
const SCROLL_RETRY_DELAY = 80;
const HIGHLIGHT_DURATION = 2000;
const PLACEHOLDER_POSITION_THRESHOLD = 5000;

type DynamicScrollerHandle = {
  scrollToBottom?: () => void;
  scrollToItem?: (index: number) => void;
};

type MutableRef<T> = { current: T };

export interface UseMessageScrollOptions {
  dynamicScrollerRef?: MutableRef<DynamicScrollerHandle | null>;
  shouldAutoFollow?: MutableRef<boolean>;
  autoScrollEnabled?: MutableRef<boolean>;
  scrollAnchor?: MutableRef<HTMLDivElement | undefined>;
}

const nextTick = (cb: () => void) => queueMicrotask(cb);

export function useMessageScroll(options?: UseMessageScrollOptions) {
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const ownScrollAnchorRef = useRef<HTMLDivElement>(null);
  const scrollAnchor = options?.scrollAnchor ?? ownScrollAnchorRef;

  const [aboveThreshold, setAboveThreshold] = useState(false);
  const [scrollInfo, setScrollInfo] = useState<ScrollInfo>({
    viewportHeight: 0,
    contentHeight: 0,
    scrollTop: 0,
  });

  const intersectionObserverRef = useRef<IntersectionObserver | null>(null);
  const scrollRetryTimerRef = useRef<number | null>(null);
  const scrollRetryTokenRef = useRef(0);
  const bottomScrollRetryTimerRef = useRef<number | null>(null);
  const bottomScrollCancelTokenRef = useRef(0);
  const pendingScrollTargetIdRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<number | null>(null);

  const updateScrollInfoImmediate = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    setScrollInfo({
      viewportHeight: container.clientHeight,
      contentHeight: container.scrollHeight,
      scrollTop: container.scrollTop,
    });
  }, []);

  const updateScrollInfo = useCallback(() => {
    if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(updateScrollInfoImmediate, 16);
  }, [updateScrollInfoImmediate]);

  const handleScroll = useCallback(() => {
    updateScrollInfo();
  }, [updateScrollInfo]);

  const scrollToBottomBase = useCallback(
    (_smooth = false) => {
      const container = messagesContainerRef.current;
      if (!container) return;

      const targetTop = Math.max(container.scrollHeight - container.clientHeight, 0);
      container.scrollTop = targetTop;
      updateScrollInfoImmediate();
    },
    [updateScrollInfoImmediate],
  );

  const scheduleScrollToBottom = useCallback(
    (force = false) => {
      if (bottomScrollRetryTimerRef.current) {
        clearTimeout(bottomScrollRetryTimerRef.current);
        bottomScrollRetryTimerRef.current = null;
      }
      const currentBottomToken = ++bottomScrollCancelTokenRef.current;

      nextTick(() => {
        const shouldAutoFollow = options?.shouldAutoFollow;
        const autoScrollEnabled = options?.autoScrollEnabled;
        const canAutoFollow = autoScrollEnabled ? autoScrollEnabled.current : true;
        if (force && shouldAutoFollow) {
          if (canAutoFollow) {
            shouldAutoFollow.current = true;
          }
        }

        if (!force && !canAutoFollow) {
          updateScrollInfo();
          return;
        }

        if (!force && shouldAutoFollow && !shouldAutoFollow.current) {
          updateScrollInfo();
          return;
        }

        const dynamicScrollerRef = options?.dynamicScrollerRef;
        const scroller = dynamicScrollerRef?.current;
        const scrollToBottomFn = scroller?.scrollToBottom;

        if (scrollToBottomFn) {
          let retryCount = 0;
          let lastScrollHeight = 0;

          const attemptScrollToBottom = () => {
            if (currentBottomToken !== bottomScrollCancelTokenRef.current) return;
            scrollToBottomFn();

            nextTick(() => {
              bottomScrollRetryTimerRef.current = window.setTimeout(() => {
                bottomScrollRetryTimerRef.current = null;
                if (currentBottomToken !== bottomScrollCancelTokenRef.current) return;

                const container = messagesContainerRef.current;
                if (!container) {
                  updateScrollInfo();
                  return;
                }

                const currentScrollHeight = container.scrollHeight;
                const currentScrollTop = container.scrollTop;
                const viewportHeight = container.clientHeight;
                const distanceToBottom = currentScrollHeight - currentScrollTop - viewportHeight;

                const isAtBottom = distanceToBottom <= 1;
                const heightStillChanging = currentScrollHeight !== lastScrollHeight;
                lastScrollHeight = currentScrollHeight;

                if (!isAtBottom && heightStillChanging && retryCount < MAX_SCROLL_RETRIES) {
                  retryCount++;
                  attemptScrollToBottom();
                } else {
                  updateScrollInfo();
                }
              }, SCROLL_RETRY_DELAY);
            });
          };

          attemptScrollToBottom();
        } else {
          scrollToBottomBase();
        }
      });
    },
    [options, updateScrollInfo, scrollToBottomBase],
  );

  const scrollToBottom = useCallback((force = false) => scheduleScrollToBottom(force), [scheduleScrollToBottom]);

  const highlightMessage = useCallback((target: HTMLElement) => {
    target.classList.add(MESSAGE_HIGHLIGHT_CLASS);
    setTimeout(() => target.classList.remove(MESSAGE_HIGHLIGHT_CLASS), HIGHLIGHT_DURATION);
  }, []);

  const scrollToMessageBase = useCallback(
    (messageId: string) => {
      nextTick(() => {
        const messageElement = document.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement | null;
        if (messageElement) {
          messageElement.scrollIntoView({ block: "start" });
          highlightMessage(messageElement);
        }
        updateScrollInfoImmediate();
      });
    },
    [updateScrollInfoImmediate, highlightMessage],
  );

  const scrollToMessage = useCallback(
    (messageId: string, itemsGetter?: () => Array<{ id: string }>) => {
      const dynamicScrollerRef = options?.dynamicScrollerRef;
      const scroller = dynamicScrollerRef?.current;
      const scrollToItemFn = scroller?.scrollToItem;

      if (!scrollToItemFn || !itemsGetter) {
        scrollToMessageBase(messageId);
        return;
      }

      const items = itemsGetter();
      const index = items.findIndex((item) => item.id === messageId);

      if (index === -1) return;

      pendingScrollTargetIdRef.current = messageId;

      const tryApplyCenterAndHighlight = () => {
        const container = messagesContainerRef.current;
        if (!container) return false;

        const target = container.querySelector(`[data-message-id="${messageId}"]`) as HTMLElement | null;
        if (!target) return false;

        const targetRect = target.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const targetTop = targetRect.top - containerRect.top + container.scrollTop;

        if (
          Math.abs(targetTop) > PLACEHOLDER_POSITION_THRESHOLD &&
          (targetTop < 0 || targetTop > container.scrollHeight)
        ) {
          return false;
        }

        target.scrollIntoView({ block: "start", behavior: "instant" });
        updateScrollInfo();
        highlightMessage(target);
        pendingScrollTargetIdRef.current = null;
        return true;
      };

      if (scrollRetryTimerRef.current) clearTimeout(scrollRetryTimerRef.current);
      scrollRetryTimerRef.current = null;

      const currentToken = ++scrollRetryTokenRef.current;
      let retryCount = 0;

      const attemptScroll = () => {
        if (currentToken !== scrollRetryTokenRef.current) return;

        scrollToItemFn(index);
        nextTick(() => {
          setTimeout(() => {
            if (tryApplyCenterAndHighlight()) return;

            if (++retryCount < MAX_SCROLL_RETRIES) {
              scrollRetryTimerRef.current = window.setTimeout(() => {
                scrollRetryTimerRef.current = null;
                attemptScroll();
              }, SCROLL_RETRY_DELAY);
            } else {
              pendingScrollTargetIdRef.current = null;
            }
          }, SCROLL_RETRY_DELAY);
        });
      };

      attemptScroll();
    },
    [options, updateScrollInfo, scrollToMessageBase, highlightMessage],
  );

  const handleVirtualScrollUpdate = useCallback(() => {
    if (!pendingScrollTargetIdRef.current) return;
    const container = messagesContainerRef.current;
    if (!container) return;

    const target = container.querySelector(
      `[data-message-id="${pendingScrollTargetIdRef.current}"]`,
    ) as HTMLElement | null;
    if (!target) return;

    const messageId = pendingScrollTargetIdRef.current;
    pendingScrollTargetIdRef.current = null;
    scrollToMessageBase(messageId);
  }, [scrollToMessageBase]);

  const setupScrollObserver = useCallback(() => {
    if (intersectionObserverRef.current) {
      intersectionObserverRef.current.disconnect();
    }

    intersectionObserverRef.current = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        setAboveThreshold(!entry.isIntersecting);
        updateScrollInfoImmediate();
      },
      {
        root: messagesContainerRef.current,
        rootMargin: "0px 0px 20px 0px",
        threshold: 0,
      },
    );

    if (scrollAnchor.current) {
      intersectionObserverRef.current.observe(scrollAnchor.current);
    }

    updateScrollInfoImmediate();
  }, [updateScrollInfoImmediate, scrollAnchor]);

  useEffect(() => {
    return () => {
      if (intersectionObserverRef.current) {
        intersectionObserverRef.current.disconnect();
        intersectionObserverRef.current = null;
      }

      if (scrollRetryTimerRef.current) {
        clearTimeout(scrollRetryTimerRef.current);
        scrollRetryTimerRef.current = null;
      }

      if (bottomScrollRetryTimerRef.current) {
        clearTimeout(bottomScrollRetryTimerRef.current);
        bottomScrollRetryTimerRef.current = null;
      }
      bottomScrollCancelTokenRef.current++;

      pendingScrollTargetIdRef.current = null;
    };
  }, []);

  return {
    messagesContainerRef,
    scrollAnchor,
    aboveThreshold,

    scrollInfo,

    scrollToBottom,
    scrollToBottomBase,
    scrollToMessage,
    scrollToMessageBase,
    handleScroll,
    updateScrollInfo: updateScrollInfoImmediate,
    setupScrollObserver,
    handleVirtualScrollUpdate,
    highlightMessage,
  };
}
