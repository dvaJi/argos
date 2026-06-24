/// <reference types="vite/client" />
import type { ReactNode } from "react";
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import appCss from "~/styles/app.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        title: "Argos — Powerful Open-Source AI Agent Platform",
      },
      {
        name: "description",
        content:
          "Argos unifies models, tools, and agents: multi-LLM chat, MCP tool calling, Skills, ACP integration, and remote control. Open-source desktop app for Windows, macOS, and Linux.",
      },
      { name: "theme-color", content: "#0b1020" },
      { property: "og:title", content: "Argos — Open-Source AI Agent Platform" },
      {
        property: "og:description",
        content: "Multi-LLM chat, MCP tools, Skills, ACP agents, and remote control in one open-source desktop app.",
      },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}
