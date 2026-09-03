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
        title: "Argos - The Open-Source Control Plane for AI Coding Agents",
      },
      {
        name: "description",
        content:
          "Run agents, models, MCP tools, and skills in one open-source workspace. 40+ providers, ACP agents, remote control, desktop app or self-hosted server. Bring your own keys.",
      },
      { name: "theme-color", content: "#050507" },
      { property: "og:title", content: "Argos - The Open-Source Control Plane for AI Coding Agents" },
      {
        property: "og:description",
        content:
          "Run agents, models, MCP tools, and skills in one open-source workspace. Desktop app or self-hosted server, with your own keys.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "/icon.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico" },
      { rel: "icon", type: "image/png", href: "/icon.png" },
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
        <div className="noise-overlay" aria-hidden="true" />
        {children}
        <Scripts />
      </body>
    </html>
  );
}
