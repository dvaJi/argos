import type { LLMCoreStreamEvent } from "@argos/shared/types/core/llm-events";
import type { RuntimeStreamState } from "./types";

export function accumulate(state: RuntimeStreamState, event: LLMCoreStreamEvent): void {
  const e = event as any;

  switch (e.type) {
    case "text": {
      const lastBlock = state.blocks.at(-1) as any;
      if (lastBlock && lastBlock.type === "content") {
        lastBlock.content = (lastBlock.content ?? "") + e.content;
      } else {
        state.blocks.push({ type: "content", content: e.content, status: "success", timestamp: Date.now() });
      }
      state.dirty = true;
      break;
    }
    case "reasoning": {
      const lastBlock = state.blocks.at(-1) as any;
      if (lastBlock && lastBlock.type === "reasoning_content") {
        lastBlock.content = (lastBlock.content ?? "") + e.reasoning_content;
      } else {
        state.blocks.push({ type: "reasoning_content", content: e.reasoning_content, status: "success", timestamp: Date.now() });
      }
      state.dirty = true;
      break;
    }
    case "tool_call_start": {
      state.pendingToolCalls.set(e.tool_call_id, {
        name: e.tool_call_name,
        arguments: "",
        blockIndex: state.blocks.length,
        providerOptions: e.provider_options,
      });
      state.blocks.push({
        type: "tool_call",
        tool_call: { id: e.tool_call_id, name: e.tool_call_name, arguments: "" },
        status: "pending",
        timestamp: Date.now(),
      } as any);
      state.dirty = true;
      break;
    }
    case "tool_call_chunk": {
      const pending = state.pendingToolCalls.get(e.tool_call_id);
      if (pending) {
        pending.arguments += e.tool_call_arguments_chunk;
        const block = state.blocks[pending.blockIndex] as any;
        if (block?.tool_call) {
          block.tool_call.arguments = pending.arguments;
        }
      }
      state.dirty = true;
      break;
    }
    case "tool_call_end": {
      const pending = state.pendingToolCalls.get(e.tool_call_id);
      if (pending) {
        const finalArgs = e.tool_call_arguments_complete ?? pending.arguments;
        const block = state.blocks[pending.blockIndex] as any;
        if (block?.tool_call) {
          block.tool_call.arguments = finalArgs;
        }
        state.completedToolCalls.push({
          id: e.tool_call_id,
          name: pending.name,
          arguments: finalArgs,
          ...(pending.providerOptions ? { providerOptions: pending.providerOptions } : {}),
        });
        state.pendingToolCalls.delete(e.tool_call_id);
      }
      state.dirty = true;
      break;
    }
    case "usage": {
      (state.metadata as any).usage = e.usage;
      break;
    }
    case "stop": {
      const reason = (e as any).stop_reason ?? (e as any).reason ?? "complete";
      (state as any).stopReason = reason;
      break;
    }
  }
}

export function finalizeTrailingPendingNarrativeBlocks(state: RuntimeStreamState): void {
  for (let i = state.blocks.length - 1; i >= 0; i--) {
    const block = state.blocks[i] as any;
    if (block.type === "content" && !block.content) {
      state.blocks.splice(i, 1);
    } else {
      break;
    }
  }
}
