import { useState, useEffect } from "react";
export interface SpotlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface UseOnBoardingOptions {
  visible?: boolean;
  padding?: number;
  radius?: number;
  edgeInset?: number;
}
export function useOnBoarding(targetEl: HTMLElement | null, options: UseOnBoardingOptions = {}) {
  const padding = options.padding ?? 12;
  const radius = options.radius ?? 24;
  const edgeInset = options.edgeInset ?? 16;
  const [viewportWidth, setViewportWidth] = useState(
    typeof document !== "undefined" ? document.documentElement.clientWidth : 0,
  );
  const [viewportHeight, setViewportHeight] = useState(
    typeof document !== "undefined" ? document.documentElement.clientHeight : 0,
  );
  const [targetBounds, setTargetBounds] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });
  const updateTargetBounds = (_viewportWidth?: number, _viewportHeight?: number) => {
    if (!targetEl) return;
    const rect = targetEl.getBoundingClientRect();
    setTargetBounds({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });
  };
  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(document.documentElement.clientWidth);
      setViewportHeight(document.documentElement.clientHeight);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);
  useEffect(() => {
    if (!targetEl) return;
    // ResizeObserver fires once right after observe(), which provides the
    // initial measurement — no synchronous call needed here.
    const observer = new ResizeObserver(() => {
      updateTargetBounds();
    });
    observer.observe(targetEl);
    return () => observer.disconnect();
  }, [targetEl, updateTargetBounds]);
  useEffect(() => {
    void Promise.resolve().then(() => updateTargetBounds(viewportWidth, viewportHeight));
  }, [viewportWidth, viewportHeight, updateTargetBounds]);
  const spotlightRect = (() => {
    const isVisible = options.visible === undefined ? true : options.visible;
    if (
      !isVisible ||
      !targetEl ||
      targetBounds.width < 1 ||
      targetBounds.height < 1 ||
      viewportWidth < 1 ||
      viewportHeight < 1
    ) {
      return null;
    }
    const top = Math.max(targetBounds.y - padding, edgeInset);
    const left = Math.max(targetBounds.x - padding, edgeInset);
    const width = Math.min(targetBounds.width + padding * 2, Math.max(viewportWidth - left - edgeInset, 0));
    const height = Math.min(targetBounds.height + padding * 2, Math.max(viewportHeight - top - edgeInset, 0));
    if (width <= 0 || height <= 0) {
      return null;
    }
    return {
      x: left,
      y: top,
      width,
      height,
    };
  })();
  const cutoutPathD = (() => {
    const rect = spotlightRect;
    if (!rect) return "";
    const r = Math.floor(Math.max(Math.min(radius, rect.width / 2, rect.height / 2), 0));
    const vx = rect.x + r;
    const vy = rect.y;
    const innerWidth = rect.width - r * 2;
    const innerHeight = rect.height - r * 2;
    return (
      `M${vx},${vy} h${innerWidth} ` +
      `a${r},${r} 0 0 1 ${r},${r} v${innerHeight} ` +
      `a${r},${r} 0 0 1 -${r},${r} h-${innerWidth} ` +
      `a${r},${r} 0 0 1 -${r},-${r} v-${innerHeight} ` +
      `a${r},${r} 0 0 1 ${r},-${r} z`
    );
  })();
  const pathD = (() => {
    const outer = `M${viewportWidth},0L0,0L0,${viewportHeight}L${viewportWidth},${viewportHeight}L${viewportWidth},0Z`;
    if (!cutoutPathD) return outer;
    return `${outer} ${cutoutPathD}`;
  })();
  return {
    spotlightRect,
    viewportWidth,
    viewportHeight,
    pathD,
    cutoutPathD,
  };
}
