import type { ReactNode } from "react";
import { ScrollArea } from "@shadcn/components/ui/scroll-area";

interface SettingsPageShellProps {
  title: string;
  description?: string;
  eyebrow?: string;
  dataTestid?: string;
  actions?: ReactNode;
  children?: ReactNode;
}

export default function SettingsPageShell({
  title,
  description,
  eyebrow,
  dataTestid,
  actions,
  children,
}: SettingsPageShellProps) {
  return (
    <ScrollArea className="h-full w-full">
      <main
        data-testid={dataTestid}
        className="mx-auto flex min-h-full w-full max-w-7xl min-w-0 flex-col gap-4 p-4 lg:p-6"
      >
        <header className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {eyebrow && <div className="text-xs font-medium text-muted-foreground">{eyebrow}</div>}
            <h1 className="truncate text-xl font-semibold text-foreground">{title}</h1>
            {description && <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
        </header>
        {children}
      </main>
    </ScrollArea>
  );
}
