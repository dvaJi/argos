import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryManagerPanel } from "#settings/components/MemoryManagerPanel";
import type { MemoryClient } from "#settings/components/MemoryManagerPanel";

vi.mock("#/components/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const sampleMemory = {
  id: "mem-1",
  agentId: "agent-1",
  kind: "semantic" as const,
  category: "project_fact",
  content: "repo uses pnpm",
  importance: 0.6,
  status: "embedded" as const,
  sourceSession: null,
  sourceEntryIds: null,
  supersededBy: null,
  createdAt: 1000,
};

function createMockClient(overrides: Partial<MemoryClient> = {}): MemoryClient {
  return {
    list: vi.fn(async () => [sampleMemory]),
    getStatus: vi.fn(async () => ({ total: 1, pendingEmbedding: 0, hasPersona: false })),
    search: vi.fn(async () => []),
    add: vi.fn(async () => ({ action: "created" as const, memoryId: "mem-2" })),
    remove: vi.fn(async () => true),
    clear: vi.fn(async () => 1),
    ...overrides,
  } as unknown as MemoryClient;
}

describe("MemoryManagerPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and renders memories on mount", async () => {
    const client = createMockClient();
    render(<MemoryManagerPanel agentId="agent-1" client={client} />);

    await waitFor(() => expect(client.list).toHaveBeenCalledWith("agent-1"));
    expect(client.getStatus).toHaveBeenCalledWith("agent-1");
    expect(await screen.findByText("repo uses pnpm")).toBeInTheDocument();
  });

  it("renders the empty state when there are no memories", async () => {
    const client = createMockClient({
      list: vi.fn(async () => []),
      getStatus: vi.fn(async () => ({ total: 0, pendingEmbedding: 0, hasPersona: false })),
    });
    render(<MemoryManagerPanel agentId="agent-1" client={client} />);

    expect(await screen.findByText("No memories yet.")).toBeInTheDocument();
  });

  it("shows the degraded hint when embeddings are not configured", async () => {
    const client = createMockClient();
    render(<MemoryManagerPanel agentId="agent-1" hasEmbeddingConfigured={false} client={client} />);

    await screen.findByText("repo uses pnpm");
    expect(screen.getByText(/Embeddings are not configured/)).toBeInTheDocument();
  });

  it("disables the add toggle when memory is disabled", async () => {
    const client = createMockClient();
    render(<MemoryManagerPanel agentId="agent-1" memoryEnabled={false} client={client} />);

    await screen.findByText("repo uses pnpm");
    expect(screen.getByText(/Memory is disabled/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add memory/i })).toBeDisabled();
  });
});
