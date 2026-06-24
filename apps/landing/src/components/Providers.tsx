const PROVIDERS = [
  "DeepSeek",
  "OpenAI",
  "Anthropic",
  "Gemini",
  "Grok",
  "Moonshot / Kimi",
  "Ollama",
  "AWS Bedrock",
  "Azure OpenAI",
  "Vertex AI",
  "GitHub Models",
  "GitHub Copilot",
  "xAI",
  "Zhipu",
  "Doubao",
  "DashScope",
  "Groq",
  "OpenRouter",
  "Together",
  "LM Studio",
  "302.AI",
  "ModelScope",
  "SiliconFlow",
  "PPIO",
  "Vercel AI Gateway",
];

export function Providers() {
  return (
    <section id="providers" className="border-b border-white/5 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            40+ model providers, one interface
          </h2>
          <p className="mt-4 text-lg text-slate-400">
            From cloud APIs to local models. If it speaks OpenAI, Gemini, or Anthropic, Argos speaks it too.
          </p>
        </div>
        <div className="mt-14 flex flex-wrap justify-center gap-3">
          {PROVIDERS.map((provider) => (
            <span
              key={provider}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-accent/40 hover:text-accent"
            >
              {provider}
            </span>
          ))}
          <span className="rounded-full border border-dashed border-white/15 px-4 py-2 text-sm font-medium text-slate-500">
            + any compatible endpoint
          </span>
        </div>
      </div>
    </section>
  );
}
