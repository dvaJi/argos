import { PlugsConnected, Robot, Sparkle, type Icon } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Reveal } from "~/components/Reveal";

type AgentRow = {
  title: string;
  description: string;
  icon: Icon;
  aside: ReactNode;
};

function SettingsPath({ path }: { path: string }) {
  return (
    <code className="inline-flex items-center rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2 font-mono text-xs text-slate-300">
      {path}
    </code>
  );
}

const ROWS: AgentRow[] = [
  {
    title: "Connect ACP agents",
    description:
      "Any ACP-compatible runtime becomes a first-class entry in the model selector, with a native workspace UI. Enable a built-in agent or add your own command.",
    icon: Robot,
    aside: <SettingsPath path="Settings → ACP Agents" />,
  },
  {
    title: "Attach MCP tools",
    description:
      "Full Resources, Prompts, and Tools coverage with visual debugging when a server misbehaves. A bundled Bun runtime executes servers without extra setup.",
    icon: PlugsConnected,
    aside: (
      <div className="flex flex-wrap gap-2">
        {["StreamableHTTP", "SSE", "stdio"].map((transport) => (
          <code
            key={transport}
            className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-1 font-mono text-[11px] text-slate-400"
          >
            {transport}
          </code>
        ))}
      </div>
    ),
  },
  {
    title: "Install Skills",
    description:
      "Standard Agent Skills spec. Install from folders, ZIPs, or URLs, and import or export packs with Claude Code, Codex, Cursor, and GitHub Copilot.",
    icon: Sparkle,
    aside: <SettingsPath path="Settings → Skills" />,
  },
];

export function Agents() {
  return (
    <section id="agents" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">Agent-first</p>
          <h2 className="mt-4 text-balance text-4xl font-bold tracking-[-0.03em] text-white sm:text-5xl">
            Made for agents to plug in.
          </h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-400">
            Argos speaks the protocols your agents already use. Three surfaces, no vendor lock-in, all running on your
            machine.
          </p>
        </Reveal>

        <Reveal delay={80} className="mt-14">
          <ul className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
            {ROWS.map((row) => {
              const Icon = row.icon;
              return (
                <li
                  key={row.title}
                  className="group grid gap-5 py-8 transition-colors duration-300 first:pt-10 last:pb-10 hover:bg-white/[0.015] lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] lg:items-center lg:gap-10 lg:px-6"
                >
                  <div className="flex items-center gap-4">
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] text-slate-300 ring-1 ring-white/[0.06] transition-colors duration-300 group-hover:text-accent group-hover:ring-accent/25">
                      <Icon size={22} weight="regular" />
                    </span>
                    <h3 className="text-xl font-semibold tracking-tight text-white">{row.title}</h3>
                  </div>
                  <p className="max-w-[58ch] text-[15px] leading-relaxed text-slate-400">{row.description}</p>
                  <div className="lg:justify-self-end">{row.aside}</div>
                </li>
              );
            })}
          </ul>
        </Reveal>

        <Reveal delay={120}>
          <p className="mt-10 max-w-3xl text-sm leading-relaxed text-slate-500">
            Driving Argos from your own tooling? The daemon exposes{" "}
            <code className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[13px] text-slate-300">
              POST /api/v1/route
            </code>{" "}
            and a WebSocket event stream at{" "}
            <code className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[13px] text-slate-300">
              /api/v1/events
            </code>
            . See the{" "}
            <a
              href="/docs"
              className="font-medium text-slate-300 underline decoration-white/15 underline-offset-4 transition-colors duration-300 hover:text-white"
            >
              daemon handbook
            </a>
            .
          </p>
        </Reveal>
      </div>
    </section>
  );
}
