const LOGOS: { slug: string; name: string }[] = [
  { slug: "deepseek", name: "DeepSeek" },
  { slug: "google", name: "Google Gemini" },
  { slug: "anthropic", name: "Anthropic" },
  { slug: "x", name: "xAI Grok" },
  { slug: "github", name: "GitHub Models" },
  { slug: "ollama", name: "Ollama" },
  { slug: "openrouter", name: "OpenRouter" },
  { slug: "mistralai", name: "Mistral" },
  { slug: "huggingface", name: "Hugging Face" },
  { slug: "googlecloud", name: "Vertex AI" },
  { slug: "alibabacloud", name: "DashScope" },
  { slug: "meta", name: "Llama" },
];

export function Providers() {
  return (
    <section id="providers" className="relative py-20 sm:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-center text-sm text-slate-500">Works with the providers you already use</p>

        <ul className="mt-10 grid grid-cols-3 items-center gap-x-6 gap-y-10 sm:grid-cols-4 md:grid-cols-6">
          {LOGOS.map((logo) => (
            <li key={logo.slug} className="flex justify-center">
              <img
                src={`https://cdn.simpleicons.org/${logo.slug}/ffffff`}
                alt={logo.name}
                loading="lazy"
                className="h-7 w-auto opacity-50 transition-opacity duration-300 hover:opacity-100"
              />
            </li>
          ))}
        </ul>

        <p className="mx-auto mt-12 max-w-xl text-center text-sm leading-relaxed text-slate-500">
          Plus OpenAI, AWS Bedrock, Azure, and any OpenAI, Gemini, or Anthropic-compatible endpoint. That is 40+
          providers in one interface.
        </p>
      </div>
    </section>
  );
}
