import { Article, ArrowsClockwise, Browsers, Code, GitBranch, PaintBrush } from "@phosphor-icons/react";
import { Reveal } from "~/components/Reveal";

const DETAILS = [
  { icon: Article, label: "Markdown & rich rendering" },
  { icon: Code, label: "CodeMirror code blocks" },
  { icon: PaintBrush, label: "Mermaid & Artifacts" },
  { icon: Browsers, label: "Multi-window & tabs" },
  { icon: ArrowsClockwise, label: "Retry & regenerate" },
  { icon: GitBranch, label: "Fork conversations" },
];

export function Spotlight() {
  return (
    <section className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal className="max-w-2xl">
          <h2 className="text-balance text-4xl font-bold tracking-[-0.03em] text-white sm:text-5xl">
            A workspace built for real work
          </h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-400">
            One window for every conversation. Inline source highlighting, artifacts, diagrams, and multi-modal input,
            with the room to run several agents in parallel.
          </p>
        </Reveal>

        <Reveal delay={80} className="mt-12">
          <figure className="shot-frame">
            <img
              src="/shot-light.png"
              alt="Argos chat workspace in light mode showing rendered markdown, code, and a diagram"
              className="block w-full select-none rounded-[0.9rem]"
              loading="lazy"
              width={1920}
              height={1200}
            />
          </figure>
        </Reveal>

        <ul className="mt-10 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          {DETAILS.map((detail, i) => {
            const Icon = detail.icon;
            return (
              <Reveal as="li" key={detail.label} delay={i * 50} className="flex items-center gap-3">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] text-accent ring-1 ring-white/[0.06]">
                  <Icon size={16} weight="bold" />
                </span>
                <span className="text-sm text-slate-300">{detail.label}</span>
              </Reveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
