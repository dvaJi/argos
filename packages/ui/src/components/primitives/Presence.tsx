"use client";

import { type CSSProperties, type ReactNode, useEffect, useState } from "react";

/* ─────────────────────────────────────────────────────────
 * PRESENCE — keep children mounted while their exit plays
 *
 * A tiny, dependency-free alternative to <AnimatePresence>.
 * On `show`, children mount hidden and transition in (fade,
 * rise, focus). On hide, they transition out first and are
 * removed from the DOM once the exit settles. Both directions
 * share one easing curve on compositor-friendly properties,
 * so interrupted toggles reverse smoothly instead of
 * restarting. Honors prefers-reduced-motion.
 * ───────────────────────────────────────────────────────── */

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

interface PresenceProps {
  /** Whether children should be visible (and mounted). */
  show: boolean;
  children: ReactNode;
  /** Applied to the wrapper; use for layout/positioning. */
  className?: string;
  /** Extra static styles; animation styles always win. */
  style?: CSSProperties;
  /** Enter transition length. */
  enterMs?: number;
  /** Exit transition length; also how long children stay mounted. */
  exitMs?: number;
  /** Vertical travel on enter; exit settles back ~60% of it. */
  offsetPx?: number;
}

export default function Presence({
  show,
  children,
  className,
  style,
  enterMs = 260,
  exitMs = 180,
  offsetPx = 10,
}: PresenceProps) {
  const [mounted, setMounted] = useState(show);
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION_QUERY).matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = () => setReducedMotion(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (show) {
      // One frame to commit the hidden state before transitioning in.
      let raf2 = 0;
      const raf1 = requestAnimationFrame(() => {
        setMounted(true);
        raf2 = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
      };
    }
    let timer = 0;
    const raf = requestAnimationFrame(() => {
      setVisible(false);
      timer = window.setTimeout(() => setMounted(false), reducedMotion ? 0 : exitMs);
    });
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [show, exitMs, reducedMotion]);

  if (!mounted) return null;

  const duration = reducedMotion ? 0 : visible ? enterMs : exitMs;
  const hiddenOffset = show ? offsetPx : Math.round(offsetPx * 0.6);

  return (
    <div
      aria-hidden={!show}
      className={className}
      style={{
        ...style,
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : `translate3d(0, ${hiddenOffset}px, 0) scale(0.985)`,
        filter: visible ? "none" : "blur(3px)",
        transition: duration
          ? `opacity ${duration}ms ${EASE}, transform ${duration}ms ${EASE}, filter ${duration}ms ${EASE}`
          : "none",
        pointerEvents: visible ? undefined : "none",
        willChange: "opacity, transform, filter",
      }}
    >
      {children}
    </div>
  );
}
