import { Broadcast, ChatCircleDots, Cpu, type Icon, PlugsConnected, Robot, Sparkle } from "@phosphor-icons/react";
import { Reveal } from "~/components/Reveal";

type Feature = {
  title: string;
  description: string;
  icon: Icon;
  span: string;
  accent?: boolean;
  tag?: string;
};

const FEATURES: Feature[] = [
  {
    title: "Multi-LLM chat",
    description:
      "DeepSeek, Gemini, Anthropic, Grok, Ollama and 40+ providers, or any compatible endpoint. Switch models per conversation.",
    icon: ChatCircleDots,
    span: "lg:col-span-2 lg:row-span-2",
    accent: true,
  },
  {
    title: "MCP tool calling",
    description: "Full Resources, Prompts, and Tools. StreamableHTTP, SSE, and stdio with visual debugging.",
    icon: PlugsConnected,
    span: "lg:col-span-2",
  },
  {
    title: "ACP agents",
    description: "Run ACP-compatible agents as first-class models with a native workspace UI.",
    icon: Robot,
    span: "lg:col-span-1",
  },
  {
    title: "Skills",
    description: "Install from folders, ZIPs, or URLs. Swap with Claude Code, Codex, Cursor and more.",
    icon: Sparkle,
    span: "lg:col-span-1",
  },
  {
    title: "Remote control",
    description:
      "Drive sessions from Telegram, Discord, Feishu, QQ, and WeChat. Switch models and answer prompts away from the desk.",
    icon: Broadcast,
    span: "lg:col-span-2",
  },
  {
    title: "Local & offline",
    description: "Integrated Ollama: download, deploy, and run models fully offline from one UI.",
    icon: Cpu,
    span: "lg:col-span-2",
    tag: "No cloud needed",
  },
];

export function Features() {
  return (
    <section id="features" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal className="max-w-2xl">
          <h2 className="text-balance text-4xl font-bold tracking-[-0.03em] text-white sm:text-5xl">
            Everything an agent workflow needs
          </h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-400">
            Models, tools, and runtimes in a single native app. No browser tabs, no context switching between five
            different chat windows.
          </p>
        </Reveal>

        <div className="mt-14 grid auto-rows-[minmax(0,1fr)] grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <Reveal
                key={feature.title}
                delay={i * 60}
                className={`${feature.span} ${feature.accent ? "surface bg-gradient-to-br from-accent/[0.08] to-transparent" : "surface"}`}
              >
                <div className="flex h-full flex-col p-6 sm:p-7">
                  <span
                    className={`mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl ${
                      feature.accent
                        ? "bg-accent/10 text-accent ring-1 ring-accent/25"
                        : "bg-white/[0.04] text-slate-300 ring-1 ring-white/[0.06]"
                    }`}
                  >
                    <Icon size={22} weight="regular" />
                  </span>

                  <h3 className="text-lg font-semibold text-white">{feature.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-400">{feature.description}</p>

                  {feature.tag && (
                    <span className="mt-auto pt-5">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[11px] font-medium text-slate-300">
                        {feature.tag}
                      </span>
                    </span>
                  )}
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
