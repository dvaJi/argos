/**
 * Lab (model vendor) detection for ACP model lists: groups models by lab and
 * gives each lab a display name and logo. ACP agents report models in many
 * shapes — explicit groups, `org/model` prefixes (OpenRouter / Hugging Face
 * style), or bare ids (`claude-sonnet-5-5`) — so detection goes explicit
 * group → prefix → model-family pattern.
 *
 * Logos are mapped explicitly per lab (not substring-matched like
 * `ModelIcon`), so `google`, `cohere`, `nvidia`… resolve and short ids like
 * `o1` can't collide with unrelated names.
 */
import ai21Icon from "#/assets/llm-icons/ai21.svg";
import anthropicIcon from "#/assets/llm-icons/claude-color.svg";
import baichuanIcon from "#/assets/llm-icons/baichuan-color.svg";
import baiduIcon from "#/assets/llm-icons/baidu-color.svg";
import bytedanceIcon from "#/assets/llm-icons/doubao-color.svg";
import cohereIcon from "#/assets/llm-icons/cohere-color.svg";
import deepseekIcon from "#/assets/llm-icons/deepseek-color.svg";
import googleIcon from "#/assets/llm-icons/google-color.svg";
import internlmIcon from "#/assets/llm-icons/internlm-color.svg";
import metaIcon from "#/assets/llm-icons/meta-color.svg";
import microsoftIcon from "#/assets/llm-icons/azureai-color.svg";
import minimaxIcon from "#/assets/llm-icons/minimax-color.svg";
import mistralIcon from "#/assets/llm-icons/mistral-color.svg";
import moonshotIcon from "#/assets/llm-icons/moonshot.svg";
import amazonIcon from "#/assets/llm-icons/nova-color.svg";
import nvidiaIcon from "#/assets/llm-icons/nvidia-color.svg";
import openaiIcon from "#/assets/llm-icons/openai.svg";
import perplexityIcon from "#/assets/llm-icons/perplexity-color.svg";
import qwenIcon from "#/assets/llm-icons/qwen-color.svg";
import stepfunIcon from "#/assets/llm-icons/stepfun-color.svg";
import tencentIcon from "#/assets/llm-icons/hunyuan-color.svg";
import tiiIcon from "#/assets/llm-icons/tii-color.svg";
import upstageIcon from "#/assets/llm-icons/upstage-color.svg";
import xaiIcon from "#/assets/llm-icons/xai.svg";
import xiaomiIcon from "#/assets/llm-icons/xiaomi.png";
import yiIcon from "#/assets/llm-icons/yi.svg";
import zhipuIcon from "#/assets/llm-icons/zhipu-color.svg";

export interface LabInfo {
  name: string;
  icon: string;
  /** Single-color (`currentColor`) logo: render as a mask tinted with the text color. */
  mono?: boolean;
}

/** Known labs by canonical id. */
export const LABS: Record<string, LabInfo> = {
  anthropic: { name: "Anthropic", icon: anthropicIcon },
  openai: { name: "OpenAI", icon: openaiIcon, mono: true },
  google: { name: "Google", icon: googleIcon },
  xai: { name: "xAI", icon: xaiIcon, mono: true },
  meta: { name: "Meta", icon: metaIcon },
  mistral: { name: "Mistral", icon: mistralIcon },
  deepseek: { name: "DeepSeek", icon: deepseekIcon },
  qwen: { name: "Qwen", icon: qwenIcon },
  moonshot: { name: "Moonshot", icon: moonshotIcon, mono: true },
  zhipu: { name: "Zhipu", icon: zhipuIcon },
  minimax: { name: "MiniMax", icon: minimaxIcon },
  cohere: { name: "Cohere", icon: cohereIcon },
  perplexity: { name: "Perplexity", icon: perplexityIcon },
  ai21: { name: "AI21", icon: ai21Icon, mono: true },
  nvidia: { name: "NVIDIA", icon: nvidiaIcon },
  microsoft: { name: "Microsoft", icon: microsoftIcon },
  amazon: { name: "Amazon", icon: amazonIcon },
  baidu: { name: "Baidu", icon: baiduIcon },
  bytedance: { name: "ByteDance", icon: bytedanceIcon },
  tencent: { name: "Tencent", icon: tencentIcon },
  stepfun: { name: "StepFun", icon: stepfunIcon },
  yi: { name: "01.AI", icon: yiIcon, mono: true },
  baichuan: { name: "Baichuan", icon: baichuanIcon },
  internlm: { name: "InternLM", icon: internlmIcon },
  upstage: { name: "Upstage", icon: upstageIcon },
  tii: { name: "TII", icon: tiiIcon },
  xiaomi: { name: "Xiaomi", icon: xiaomiIcon },
};

/** Model-family patterns for agents that send bare ids (`claude-sonnet-5-5`, `gpt-5.1`). */
const LAB_PATTERNS: Array<[RegExp, string]> = [
  [/\b(claude|sonnet|opus|haiku|fable|mythos)\b/, "anthropic"],
  [/\b(gpt|codex|o[1-9](-mini|-pro)?|chatgpt|dall-e)\b/, "openai"],
  [/\b(gemini|gemma|palm)\b/, "google"],
  [/\bgrok\b/, "xai"],
  [/\bllama\b/, "meta"],
  [/\b(mistral|mixtral|codestral|devstral|magistral|ministral|pixtral)\b/, "mistral"],
  [/\bdeepseek\b/, "deepseek"],
  [/\b(qwen|qwq)\b/, "qwen"],
  [/\bkimi\b/, "moonshot"],
  [/\b(glm|chatglm)\b/, "zhipu"],
  [/\bminimax\b/, "minimax"],
  [/\b(command|aya)\b/, "cohere"],
  [/\bsonar\b/, "perplexity"],
  [/\bjamba\b/, "ai21"],
  [/\bnemotron\b/, "nvidia"],
  [/\bphi\b/, "microsoft"],
  [/\bnova\b/, "amazon"],
  [/\bernie\b/, "baidu"],
  [/\b(doubao|seed)\b/, "bytedance"],
  [/\bhunyuan\b/, "tencent"],
  [/\bstep\b/, "stepfun"],
  [/\bbaichuan\b/, "baichuan"],
  [/\binternlm\b/, "internlm"],
  [/\bsolar\b/, "upstage"],
  [/\bfalcon\b/, "tii"],
  [/\bmimo\b/, "xiaomi"],
];

/** Org / vendor spellings (OpenRouter, Hugging Face, agent group ids) → canonical lab id. */
const LAB_ALIASES: Record<string, string> = {
  claude: "anthropic",
  gemini: "google",
  "google-deepmind": "google",
  deepmind: "google",
  "x-ai": "xai",
  grok: "xai",
  "meta-llama": "meta",
  facebook: "meta",
  llama: "meta",
  mistralai: "mistral",
  "z-ai": "zhipu",
  zai: "zhipu",
  "zai-org": "zhipu",
  zhipuai: "zhipu",
  thudm: "zhipu",
  glm: "zhipu",
  "deepseek-ai": "deepseek",
  moonshotai: "moonshot",
  kimi: "moonshot",
  minimaxai: "minimax",
  "minimax-ai": "minimax",
  alibaba: "qwen",
  "alibaba-cloud": "qwen",
  "qwen-ai": "qwen",
  cohereforai: "cohere",
  coherelabs: "cohere",
  "perplexity-ai": "perplexity",
  ai21labs: "ai21",
  "ai21-labs": "ai21",
  aws: "amazon",
  "amazon-bedrock": "amazon",
  azure: "microsoft",
  wenxin: "baidu",
  "bytedance-seed": "bytedance",
  "bytedance-research": "bytedance",
  doubao: "bytedance",
  hunyuan: "tencent",
  "01-ai": "yi",
  zeroone: "yi",
  "baichuan-inc": "baichuan",
  "internlm-ai": "internlm",
  "shanghai-ai-lab": "internlm",
  tiiuae: "tii",
  xiaomimimo: "xiaomi",
};

/**
 * Canonical lab id for a raw org/group name, or null when it isn't a known
 * lab. Tries the tables, then strips common org suffixes (`ai`, `-ai`,
 * `-org`, `-inc`, `-labs`) — only accepted when the result is a known lab,
 * so `openai` never becomes `open`.
 */
export const canonicalLab = (raw: string): string | null => {
  const id = raw
    .trim()
    .toLowerCase()
    .replace(/[\s_.]+/g, "-");
  const lookup = (key: string) => (LABS[key] ? key : (LAB_ALIASES[key] ?? null));
  const direct = lookup(id);
  if (direct) return direct;
  for (const suffix of ["-org", "-inc", "-labs", "labs", "-ai", "ai"]) {
    if (!id.endsWith(suffix)) continue;
    const stripped = lookup(id.slice(0, -suffix.length));
    if (stripped) return stripped;
  }
  return null;
};

/** Lab id inferred from a bare model id / label, or null. */
export const inferLabFromModel = (value: string, label: string): string | null => {
  const haystack = `${value} ${label}`.toLowerCase().replace(/[_.]/g, "-");
  return LAB_PATTERNS.find(([pattern]) => pattern.test(haystack))?.[1] ?? null;
};
