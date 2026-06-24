type Feature = {
  title: string;
  description: string;
  icon: React.ReactNode;
};

const FEATURES: Feature[] = [
  {
    title: "Multi-LLM Chat",
    description:
      "Chat with DeepSeek, OpenAI, Gemini, Anthropic, Grok, Ollama and 40+ providers — or any OpenAI-, Gemini-, or Anthropic-compatible endpoint.",
    icon: (
      <path
        d="M8 10h8M8 14h5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: "MCP Tool Calling",
    description:
      "Full Resources, Prompts, and Tools coverage with StreamableHTTP/SSE/Stdio transports, visual debugging, and bundled Node.js runtime.",
    icon: (
      <path
        d="M14.7 6.3a4 4 0 00-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 005.4-5.4l-2.5 2.5-2-2 2.5-2.5z"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: "Skills System",
    description:
      "Install from folders, ZIPs, or URLs. Import & export with Claude Code, Codex, Cursor, Windsurf, Copilot, Kiro, Goose, and more.",
    icon: (
      <path
        d="M12 2l3 6 6 .9-4.5 4.3 1 6.1L12 17l-5.5 3.3 1-6.1L3 8.9 9 8l3-6z"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: "ACP Agent Integration",
    description:
      "Run ACP-compatible agents as first-class models with a native workspace UI. Built-in agents or your own custom commands.",
    icon: (
      <path
        d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 10-4-4 4 4 0 004 4zm6-4a3 3 0 10-2-5.24"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: "Remote Control",
    description:
      "Drive sessions from Telegram, Feishu/Lark, QQBot, Discord, and WeChat iLink. Create sessions, switch models, answer prompts remotely.",
    icon: <path d="M5 12h14M12 5l7 7-7 7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    title: "Rich Chat Experience",
    description:
      "Markdown + code rendering, multi-window parallelism, Artifacts, message retry & forking, multi-modal images, and Mermaid diagrams.",
    icon: (
      <path d="M4 5h16v11H4zM2 20h20M8 9h8M8 12h5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    ),
  },
  {
    title: "Local Models",
    description:
      "Integrated Ollama with download, deploy, and run controls — run models fully offline without touching the command line.",
    icon: (
      <path
        d="M3 12a9 9 0 1018 0 9 9 0 00-18 0zm9-9v18M3 12h18"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    title: "Cross-Platform",
    description:
      "Native builds for Windows, macOS, and Linux with a themed light/dark UI, rich DeepLinks, and encryption-ready data layer.",
    icon: (
      <path
        d="M9 4h6m-3 0v3M5 7h14l-1 13H6L5 7zm4 4v5m6-5v5"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
];

export function Features() {
  return (
    <section id="features" className="relative border-b border-white/5 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Everything you need to build with AI agents
          </h2>
          <p className="mt-4 text-lg text-slate-400">
            Argos brings together models, tools, and agent runtimes in a single, polished desktop app.
          </p>
        </div>
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className="group relative rounded-2xl border border-white/5 bg-ink-soft/60 p-6 transition hover:border-accent/30 hover:bg-ink-soft"
            >
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-accent/20 bg-accent/10 text-accent">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  {feature.icon}
                </svg>
              </div>
              <h3 className="text-base font-semibold text-white">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
