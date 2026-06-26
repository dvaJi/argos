import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { useInView } from "~/lib/reveal";

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: ElementType;
} & Omit<HTMLAttributes<HTMLElement>, "className">;

/**
 * Wraps children in a `.reveal` element that transitions in when scrolled into view.
 * Use `delay` (ms) to stagger within a group. Reduced-motion users see content immediately.
 */
export function Reveal({ children, className = "", delay = 0, as, ...rest }: RevealProps) {
  const Tag = (as ?? "div") as ElementType;
  const { ref, inView } = useInView<HTMLDivElement>();
  return (
    <Tag
      ref={ref}
      className={`reveal ${inView ? "is-visible" : ""} ${className}`}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}
