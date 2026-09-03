import { Broadcast, ChatCircleDots, Cpu, Globe, type Icon, Layout, TextT } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { Reveal } from "~/components/Reveal";

type Feature = {
  title: string;
  description: string;
  icon: Icon;
  span: string;
  accent?: boolean;
  visual?: ReactNode;
};

const PROVIDER_ICONS = ["deepseek", "google", "anthropic", "x", "ollama", "openrouter"];

function ProviderIconRow() {
  return (
    <div className="mt-auto flex items-center gap-3 pt-6">
      {PROVIDER_ICONS.map((slug) => (
        <img
          key={slug}
          src={`https://cdn.simpleicons.org/${slug}/8a94a6`}
          alt=""
          aria-hidden="true"
          loading="lazy"
          className="h-5 w-auto opacity-70"
        />
      ))}
      <span className="font-mono text-xs text-slate-500">40+</span>
    </div>
  );
}

function SearchChips() {
  return (
    <div className="mt-auto flex flex-wrap gap-1.5 pt-5">
      {["BoSearch", "Brave Search", "Custom engine"].map((engine) => (
        <span
          key={engine}
          className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2 py-1 font-mono text-[11px] text-slate-400"
        >
          {engine}
        </span>
      ))}
    </div>
  );
}

const FEATURES: Feature[] = [
  {
    title: "Multi-LLM chat",
    description:
      "DeepSeek, Gemini, Anthropic, Grok, Ollama, and any OpenAI-, Gemini-, or Anthropic-compatible endpoint. Switch models per conversation.",
    icon: ChatCircleDots,
    span: "lg:col-span-2 lg:row-span-2",
    accent: true,
    visual: <ProviderIconRow />,
  },
  {
    title: "Browser workspace",
    description:
      "The daemon serves the same chat and workspace shell over HTTP. Pair a browser session and leave Electron closed.",
    icon: Broadcast,
    span: "lg:col-span-2",
  },
  {
    title: "Built-in search",
    description: "BoSearch and Brave Search ship as MCP integrations; add any engine via a search-assistant model.",
    icon: Globe,
    span: "lg:col-span-1",
    visual: <SearchChips />,
  },
  {
    title: "Local and offline",
    description: "Integrated Ollama: download, deploy, and run models fully offline.",
    icon: Cpu,
    span: "lg:col-span-1",
  },
  {
    title: "Rich rendering",
    description: "Markdown, syntax highlighting, Mermaid diagrams, and Artifacts in every conversation.",
    icon: TextT,
    span: "lg:col-span-2",
  },
  {
    title: "Parallel sessions",
    description: "Multi-window, multi-tab parallelism with retry, regenerate, and conversation forks.",
    icon: Layout,
    span: "lg:col-span-2",
  },
];

export function Features() {
  return (
    <section id="features" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal className="max-w-2xl">
          <h2 className="text-balance text-4xl font-bold tracking-[-0.03em] text-white sm:text-5xl">
            One window for the whole workflow
          </h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-400">
            No browser tab sprawl, no context switching between five chat windows. The pieces sit next to each other.
          </p>
        </Reveal>

        <div className="mt-14 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:auto-rows-[minmax(0,1fr)]">
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
                  {feature.visual}
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
