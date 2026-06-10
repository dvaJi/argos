import { Icon } from "@iconify/react";

export function BrowserPlaceholder() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-background text-muted-foreground">
      <Icon icon="lucide:globe" className="mb-4 h-16 w-16 opacity-30" />
      <p className="text-lg font-medium">Enter a URL to start browsing</p>
      <p className="mt-2 text-sm opacity-60">
        Type a web address in the URL bar above to open it in the embedded browser
      </p>
    </div>
  );
}
