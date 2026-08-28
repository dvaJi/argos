import { useMemo, useState } from "react";
import { useStore } from "@tanstack/react-store";
import { providerStore } from "#/stores/providerStore";
import { agentStore } from "#/stores/ui/agent";
import AcpAgentIcon from "./AcpAgentIcon";
import cherryinColorIcon from "#/assets/llm-icons/cherryin-color.png";
import newApiColorIcon from "#/assets/llm-icons/newapi.svg";
import adobeColorIcon from "#/assets/llm-icons/adobe-color.svg";
import zeaburColorIcon from "#/assets/llm-icons/zeabur-color.svg";
import zhipuColorIcon from "#/assets/llm-icons/zhipu-color.svg";
import volcengineColorIcon from "#/assets/llm-icons/volcengine-color.svg";
import wenxinColorIcon from "#/assets/llm-icons/wenxin-color.svg";
import workersaiColorIcon from "#/assets/llm-icons/workersai-color.svg";
import xuanyuanColorIcon from "#/assets/llm-icons/xuanyuan-color.svg";
import yiColorIcon from "#/assets/llm-icons/yi-color.svg";
import upstageColorIcon from "#/assets/llm-icons/upstage-color.svg";
import vertexaiColorIcon from "#/assets/llm-icons/vertexai-color.svg";
import viduColorIcon from "#/assets/llm-icons/vidu-color.svg";
import vllmColorIcon from "#/assets/llm-icons/vllm-color.svg";
import tiangongColorIcon from "#/assets/llm-icons/tiangong-color.svg";
import tiiColorIcon from "#/assets/llm-icons/tii-color.svg";
import togetherColorIcon from "#/assets/llm-icons/together-color.svg";
import tripoColorIcon from "#/assets/llm-icons/tripo-color.svg";
import udionColorIcon from "#/assets/llm-icons/udio-color.svg";
import tencentColorIcon from "#/assets/llm-icons/tencent-color.svg";
import tencentcloudColorIcon from "#/assets/llm-icons/tencentcloud-color.svg";
import sensenovaColorIcon from "#/assets/llm-icons/sensenova-color.svg";
import siliconcloudColorIcon from "#/assets/llm-icons/siliconcloud-color.svg";
import sparkColorIcon from "#/assets/llm-icons/spark-color.svg";
import stabilityColorIcon from "#/assets/llm-icons/stability-color.svg";
import stepfunColorIcon from "#/assets/llm-icons/stepfun-color.svg";
import qingyanColorIcon from "#/assets/llm-icons/qingyan-color.svg";
import qwenColorIcon from "#/assets/llm-icons/qwen-color.svg";
import deepseekColorIcon from "#/assets/llm-icons/deepseek-color.svg";
import openaiColorIcon from "#/assets/llm-icons/openai.svg";
import ollamaColorIcon from "#/assets/llm-icons/ollama.svg";
import doubaoColorIcon from "#/assets/llm-icons/doubao-color.svg";
import dimcodeColorIcon from "#/assets/llm-icons/dimcode.svg";
import minimaxColorIcon from "#/assets/llm-icons/minimax-color.svg";
import mistralColorIcon from "#/assets/llm-icons/mistral-color.svg";
import fireworksColorIcon from "#/assets/llm-icons/fireworks-color.svg";
import zerooneColorIcon from "#/assets/llm-icons/zeroone.svg";
import xaiColorIcon from "#/assets/llm-icons/xai.svg";
import vercelColorIcon from "#/assets/llm-icons/vercel.svg";
import viggleColorIcon from "#/assets/llm-icons/viggle.svg";
import sunoColorIcon from "#/assets/llm-icons/suno.svg";
import syncColorIcon from "#/assets/llm-icons/sync.svg";
import rwkvColorIcon from "#/assets/llm-icons/rwkv.svg";
import ppioColorIcon from "#/assets/llm-icons/ppio-color.svg";
import tokenfluxColorIcon from "#/assets/llm-icons/tokenflux-color.svg";
import moonshotColorIcon from "#/assets/llm-icons/moonshot.svg";
import openrouterColorIcon from "#/assets/llm-icons/openrouter.svg";
import poeColorIcon from "#/assets/llm-icons/poe-color.svg";
import geminiColorIcon from "#/assets/llm-icons/gemini-color.svg";
import opencodeIcon from "#/assets/llm-icons/opencode.svg";
import githubColorIcon from "#/assets/llm-icons/github.svg";
import azureOpenaiColorIcon from "#/assets/llm-icons/azure-color.svg";
import claudeColorIcon from "#/assets/llm-icons/claude-color.svg";
import googleColorIcon from "#/assets/llm-icons/google-color.svg";
import qiniuIcon from "#/assets/llm-icons/qiniu.svg";
import grokColorIcon from "#/assets/llm-icons/grok.svg";
import groqColorIcon from "#/assets/llm-icons/groq.svg";
import hunyuanColorIcon from "#/assets/llm-icons/hunyuan-color.svg";
import dashscopeColorIcon from "#/assets/llm-icons/alibabacloud-color.svg";
import aihubmixColorIcon from "#/assets/llm-icons/aihubmix.png";
import defaultIcon from "#/assets/logo.png";
import metaColorIcon from "#/assets/llm-icons/meta.svg";
import lmstudioColorIcon from "#/assets/llm-icons/lmstudio.svg";
import _302aiIcon from "#/assets/llm-icons/302ai.svg";
import modelscopeColorIcon from "#/assets/llm-icons/modelscope-color.svg";
import awsBedrockIcon from "#/assets/llm-icons/aws-bedrock.svg";
import jiekouColorIcon from "#/assets/llm-icons/jiekou-color.svg";
import zenmuxColorIcon from "#/assets/llm-icons/zenmux-color.svg";
import burncloudColorIcon from "#/assets/llm-icons/burncloud-color.svg";
import xiaomiColorIcon from "#/assets/llm-icons/xiaomi.png";
import o3fanColorIcon from "#/assets/llm-icons/o3-fan.png";
import voiceAiColorIcon from "#/assets/llm-icons/voiceai.svg";
import novitaAiIcon from "#/assets/llm-icons/novitaai.svg";
import astraflowIcon from "#/assets/llm-icons/astraflow.png";

const icons: Record<string, string> = {
  kimi: moonshotColorIcon,
  "kimi-cli": moonshotColorIcon,
  codex: openaiColorIcon,
  "codex-acp": openaiColorIcon,
  "claude-code": claudeColorIcon,
  "claude-code-acp": claudeColorIcon,
  claude: claudeColorIcon,
  "claude-acp": claudeColorIcon,
  opencode: opencodeIcon,
  dimcode: dimcodeColorIcon,
  "dimcode-acp": dimcodeColorIcon,
  o3fan: o3fanColorIcon,
  cherryin: cherryinColorIcon,
  "new-api": newApiColorIcon,
  modelscope: modelscopeColorIcon,
  "302ai": _302aiIcon,
  aihubmix: aihubmixColorIcon,
  dashscope: dashscopeColorIcon,
  hunyuan: hunyuanColorIcon,
  grok: grokColorIcon,
  groq: groqColorIcon,
  qiniu: qiniuIcon,
  gemma: googleColorIcon,
  azure: azureOpenaiColorIcon,
  deepseek: deepseekColorIcon,
  lmstudio: lmstudioColorIcon,
  adobe: adobeColorIcon,
  openai: openaiColorIcon,
  ollama: ollamaColorIcon,
  doubao: doubaoColorIcon,
  minimax: minimaxColorIcon,
  mistral: mistralColorIcon,
  fireworks: fireworksColorIcon,
  zeabur: zeaburColorIcon,
  zeroone: zerooneColorIcon,
  zhipu: zhipuColorIcon,
  vllm: vllmColorIcon,
  volcengine: volcengineColorIcon,
  wenxin: wenxinColorIcon,
  workersai: workersaiColorIcon,
  xai: xaiColorIcon,
  xuanyuan: xuanyuanColorIcon,
  yi: yiColorIcon,
  udio: udionColorIcon,
  upstage: upstageColorIcon,
  vercel: vercelColorIcon,
  vertexai: vertexaiColorIcon,
  vertex: vertexaiColorIcon,
  vidu: viduColorIcon,
  viggle: viggleColorIcon,
  tiangong: tiangongColorIcon,
  tii: tiiColorIcon,
  together: togetherColorIcon,
  tripo: tripoColorIcon,
  stepfun: stepfunColorIcon,
  suno: sunoColorIcon,
  sync: syncColorIcon,
  tencent: tencentColorIcon,
  tencentcloud: tencentcloudColorIcon,
  rwkv: rwkvColorIcon,
  sensenova: sensenovaColorIcon,
  silicon: siliconcloudColorIcon,
  spark: sparkColorIcon,
  stability: stabilityColorIcon,
  ppio: ppioColorIcon,
  tokenflux: tokenfluxColorIcon,
  qingyan: qingyanColorIcon,
  qwen: qwenColorIcon,
  moonshot: moonshotColorIcon,
  openrouter: openrouterColorIcon,
  poe: poeColorIcon,
  gemini: geminiColorIcon,
  github: githubColorIcon,
  anthropic: claudeColorIcon,
  gpt: openaiColorIcon,
  o1: openaiColorIcon,
  o3: openaiColorIcon,
  llama: metaColorIcon,
  o4: openaiColorIcon,
  glm: zhipuColorIcon,
  meta: metaColorIcon,
  "aws-bedrock": awsBedrockIcon,
  jiekou: jiekouColorIcon,
  zenmux: zenmuxColorIcon,
  burncloud: burncloudColorIcon,
  xiaomi: xiaomiColorIcon,
  voiceai: voiceAiColorIcon,
  novita: novitaAiIcon,
  novitaai: novitaAiIcon,
  "novita.ai": novitaAiIcon,
  astraflow: astraflowIcon,
  "astraflow-cn": astraflowIcon,
  default: defaultIcon,
};

const iconKeys = Object.keys(icons);

const monoIconUrls = new Set([
  openaiColorIcon,
  dimcodeColorIcon,
  ollamaColorIcon,
  zerooneColorIcon,
  xaiColorIcon,
  vercelColorIcon,
  viggleColorIcon,
  sunoColorIcon,
  syncColorIcon,
  rwkvColorIcon,
  moonshotColorIcon,
  openrouterColorIcon,
  githubColorIcon,
  qiniuIcon,
  grokColorIcon,
  groqColorIcon,
  metaColorIcon,
  lmstudioColorIcon,
  _302aiIcon,
  awsBedrockIcon,
  voiceAiColorIcon,
  novitaAiIcon,
  opencodeIcon,
]);

interface ModelIconProps {
  modelId: string;
  customClass?: string;
  isDark?: boolean;
}

export default function ModelIcon({ modelId, customClass = "w-4 h-4", isDark = false }: ModelIconProps) {
  const providers = useStore(providerStore, (s) => s.providers);
  const agents = useStore(agentStore, (s) => s.agents);
  const [iconLoadFailed, setIconLoadFailed] = useState(false);

  const provider = useMemo(() => {
    if (!modelId) return undefined;
    return providers.find((item) => item.id === modelId);
  }, [providers, modelId]);

  const iconKey = useMemo(() => {
    const modelIdLower = modelId.toLowerCase();
    const matchedIcon = iconKeys.find((key) => modelIdLower.includes(key));
    if (matchedIcon) return matchedIcon;

    const apiType = provider?.apiType?.toLowerCase();
    if (apiType) {
      const apiMatchedIcon = iconKeys.find((key) => apiType.includes(key));
      if (apiMatchedIcon) return apiMatchedIcon;
    }

    return "default";
  }, [modelId, provider]);

  const dynamicAgentIcon = useMemo(() => {
    if (!modelId) return "";
    return agents.find((agent) => agent.id === modelId)?.icon ?? "";
  }, [agents, modelId]);

  const useDynamicAcpRegistryIcon = useMemo(() => {
    const icon = dynamicAgentIcon.trim();
    return icon.startsWith("https://cdn.agentclientprotocol.com/registry/") && icon.endsWith(".svg");
  }, [dynamicAgentIcon]);

  const invert = useMemo(() => {
    if (dynamicAgentIcon && !iconLoadFailed) return false;
    if (!isDark) return false;
    return monoIconUrls.has(icons[iconKey]);
  }, [dynamicAgentIcon, iconLoadFailed, isDark, iconKey]);

  const resolvedIconSrc = useMemo(
    () => (dynamicAgentIcon && !iconLoadFailed ? dynamicAgentIcon : icons[iconKey]),
    [dynamicAgentIcon, iconLoadFailed, iconKey],
  );

  // Reset the load-failed flag whenever the resolved icon identity changes
  // (render-phase adjustment, replacing a setState-in-effect).
  const [syncedModelId, setSyncedModelId] = useState(modelId);
  const [syncedAgentIcon, setSyncedAgentIcon] = useState(dynamicAgentIcon);
  if (syncedModelId !== modelId || syncedAgentIcon !== dynamicAgentIcon) {
    setSyncedModelId(modelId);
    setSyncedAgentIcon(dynamicAgentIcon);
    setIconLoadFailed(false);
  }

  const handleIconError = () => {
    if (dynamicAgentIcon) {
      setIconLoadFailed(true);
    }
  };

  if (useDynamicAcpRegistryIcon) {
    return (
      <AcpAgentIcon
        agentId={modelId}
        icon={dynamicAgentIcon}
        alt={modelId}
        fallbackText={modelId}
        customClass={customClass}
      />
    );
  }

  return (
    <img
      src={resolvedIconSrc}
      alt={iconKey}
      className={`${customClass} ${invert ? "invert opacity-50" : ""}`}
      style={invert ? { filter: "invert(1)" } : undefined}
      onError={handleIconError}
    />
  );
}
