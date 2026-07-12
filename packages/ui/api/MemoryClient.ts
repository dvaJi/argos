import type { ArgosBridge } from "@argos/shared-contracts/bridge";
import {
  memoryAddRoute,
  memoryClearRoute,
  memoryDeleteRoute,
  memoryGetStatusRoute,
  memoryListRoute,
  memorySearchRoute,
  type MemoryAddResult,
  type MemoryItem,
  type MemorySearchResult,
  type MemoryStatusDto,
} from "@argos/shared-contracts/routes";
import type { AgentMemoryCategory } from "@argos/shared/types/agent-memory";
import { getArgosBridge } from "./core";

type MemoryAddKind = "episodic" | "semantic";

type MemoryAddInputBase = {
  content: string;
  importance?: number;
};

type MemoryAddByKindInput = MemoryAddInputBase & {
  kind?: MemoryAddKind;
  category?: never;
};

type MemoryAddByCategoryInput = MemoryAddInputBase & {
  kind?: never;
  category: AgentMemoryCategory;
};

export type MemoryAddInput = MemoryAddByKindInput | MemoryAddByCategoryInput;

type MemoryAddPayload = {
  agentId: string;
  content: string;
  kind?: MemoryAddKind;
  category?: AgentMemoryCategory;
  importance?: number;
};

export function createMemoryClient(bridge: ArgosBridge = getArgosBridge()) {
  async function list(agentId: string): Promise<MemoryItem[]> {
    const result = await bridge.invoke(memoryListRoute.name, { agentId });
    return result.memories;
  }

  async function getStatus(agentId: string): Promise<MemoryStatusDto> {
    const result = await bridge.invoke(memoryGetStatusRoute.name, { agentId });
    return result.status;
  }

  async function search(agentId: string, query: string, options?: { limit?: number }): Promise<MemorySearchResult[]> {
    const result = await bridge.invoke(memorySearchRoute.name, {
      agentId,
      query,
      limit: options?.limit,
    });
    return result.results;
  }

  async function add(agentId: string, input: MemoryAddInput): Promise<MemoryAddResult> {
    const payload: MemoryAddPayload = {
      agentId,
      content: input.content,
      importance: input.importance,
    };
    if (input.category !== undefined) {
      payload.category = input.category;
    } else if (input.kind !== undefined) {
      payload.kind = input.kind;
    }

    const result = await bridge.invoke(memoryAddRoute.name, payload);
    return result.result;
  }

  async function remove(agentId: string, memoryId: string): Promise<boolean> {
    const result = await bridge.invoke(memoryDeleteRoute.name, { agentId, memoryId });
    return result.ok;
  }

  async function clear(agentId: string): Promise<number> {
    const result = await bridge.invoke(memoryClearRoute.name, { agentId });
    return result.removed;
  }

  return {
    list,
    getStatus,
    search,
    add,
    remove,
    clear,
  };
}

export type MemoryClient = ReturnType<typeof createMemoryClient>;
