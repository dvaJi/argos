import * as React from "react";

import { cn } from "#shadcn/lib/utils";

type ScrollAreaProps = React.ComponentProps<"div"> & {
  type?: "auto" | "always" | "scroll" | "hover";
  scrollHideDelay?: number;
};

function ScrollArea({
  className,
  children,
  type: _type,
  scrollHideDelay: _scrollHideDelay,
  ...props
}: ScrollAreaProps) {
  return (
    <div
      data-slot="scroll-area"
      className={cn(
        "relative overflow-auto rounded-[inherit] outline-none transition-[color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1",
        className,
      )}
      {...props}
    >
      <div data-slot="scroll-area-viewport" className="min-h-full min-w-full rounded-[inherit]">
        {children}
      </div>
    </div>
  );
}

function ScrollBar(_props: React.ComponentProps<"div"> & { orientation?: "horizontal" | "vertical" }) {
  return null;
}

export { ScrollArea,  };
