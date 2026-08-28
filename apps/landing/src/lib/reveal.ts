import { useEffect, useRef, useState } from "react";

/**
 * Lightweight scroll-reveal using IntersectionObserver.
 * Prefer this over `window.addEventListener("scroll", ...)`.
 *
 * Returns a ref to attach and a boolean that flips to true once (and stays true).
 * Honors prefers-reduced-motion via the CSS `.reveal` fallback (always visible).
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(options?: {
  threshold?: number;
  rootMargin?: string;
  once?: boolean;
}) {
  const { threshold = 0.18, rootMargin = "0px 0px -8% 0px", once = true } = options ?? {};
  const ref = useRef<T>(null);
  // If IntersectionObserver is unavailable, everything is considered in view
  // from the start (the effect below then has nothing to do). The `window`
  // check keeps SSR output identical to the client's first render.
  const [inView, setInView] = useState(
    () => typeof window !== "undefined" && typeof IntersectionObserver === "undefined",
  );

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (once) observer.unobserve(entry.target);
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { threshold, rootMargin },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [threshold, rootMargin, once]);

  return { ref, inView };
}
