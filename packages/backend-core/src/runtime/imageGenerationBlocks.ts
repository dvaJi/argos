import type { AssistantMessageBlock } from "@shared/types/agent-interface";

export const IMAGE_GENERATE_TOOL_NAME = "image_generate";
export const IMAGE_GENERATION_TOOL_SERVER_NAME = "builtin-image-generation";

export function extractImageGenerationBlocks(blocks: AssistantMessageBlock[]): AssistantMessageBlock[] {
  return blocks.filter((block) => {
    if (block.type !== "tool_call") return false;
    const toolCall = (block as any).tool_call;
    return toolCall?.name === IMAGE_GENERATE_TOOL_NAME;
  });
}

export function hasImageGenerationBlocks(blocks: AssistantMessageBlock[]): boolean {
  return extractImageGenerationBlocks(blocks).length > 0;
}
