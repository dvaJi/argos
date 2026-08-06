import "./assets/main.css";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import {} from "#shadcn/components/ui/tooltip";
import { router } from "./router";
import "katex/dist/katex.min.css";
import { ensureMarkdownWorkers } from "./lib/markdownWorkerLifecycle";
import { preloadIcons } from "./lib/iconLoader";

declare global {
  interface Window {
    __argosRuntimeKind?: string;
  }
}

window.__argosRuntimeKind ??= "electron";

ensureMarkdownWorkers().catch((error) => {
  console.error("Failed to initialize markdown workers:", error);
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 300_000,
    },
  },
});

const root = createRoot(document.getElementById("app")!);
root.render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);

setTimeout(() => {
  preloadIcons().catch((error) => {
    console.error("Failed to preload icons:", error);
  });
}, 0);
