import type { ReactNode } from "react";
import { Icon } from "@iconify/react";
import { Button } from "#shadcn/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "#shadcn/components/ui/popover";
import { cn } from "#/lib/utils";

interface FieldHelpPopoverProps {
  title: string;
  children: ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
}

/** Small (?) trigger that opens an explanatory popover next to a form field. */
export default function FieldHelpPopover({
  title,
  children,
  className,
  align = "start",
}: FieldHelpPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("h-5 w-5 shrink-0 text-muted-foreground hover:text-foreground", className)}
            aria-label={`About ${title}`}
          />
        }
      >
        <Icon icon="lucide:circle-help" className="h-3.5 w-3.5" />
      </PopoverTrigger>
      <PopoverContent align={align} className="w-[22rem] max-w-[calc(100vw-2rem)] p-4 text-sm">
        <div className="space-y-2">
          <div className="font-medium">{title}</div>
          <div className="space-y-2 text-xs leading-5 text-muted-foreground">{children}</div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
