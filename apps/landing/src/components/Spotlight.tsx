import {
  ArrowsLeftRight,
  ChatCenteredDots,
  Desktop,
  LinkSimple,
  Pulse,
  StopCircle,
  type Icon,
} from "@phosphor-icons/react";
import { Reveal } from "~/components/Reveal";

const CHANNELS = ["Telegram", "Discord", "Feishu / Lark", "QQBot", "WeChat iLink"];

const DETAILS: { icon: Icon; label: string }[] = [
  { icon: LinkSimple, label: "Pair over a one-time URL" },
  { icon: ChatCenteredDots, label: "Answer pending prompts" },
  { icon: ArrowsLeftRight, label: "Switch models remotely" },
  { icon: StopCircle, label: "Stop a runaway generation" },
  { icon: Pulse, label: "Check runtime status" },
  { icon: Desktop, label: "Open the session on desktop" },
];

export function Spotlight() {
  return (
    <section className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6">
        <Reveal className="max-w-2xl">
          <h2 className="text-balance text-4xl font-bold tracking-[-0.03em] text-white sm:text-5xl">
            Step away. Stay in the loop.
          </h2>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-400">
            A session does not stop when you leave your desk. Drive it from a paired browser or your messaging app.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {CHANNELS.map((channel) => (
              <span
                key={channel}
                className="rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1.5 font-mono text-xs text-slate-300"
              >
                {channel}
              </span>
            ))}
          </div>
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
