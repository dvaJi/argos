import { describe, expect, it, beforeEach } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BuiltinKnowledgeConfig, KnowledgeFileMessage } from "@argos/shared/presenter";
import { KnowledgeRuntime, createFileIngestionPort, type KnowledgeStorePorts } from "@argos/knowledge-runtime";

const fsExists = (path: string): boolean => existsSync(path);

/**
 * Fixed 8-dimensional embedding: direction encodes whether the text mentions
 * "alpha" or "beta" so similarity ranking is deterministic without a provider.
 */
function fakeEmbedding(text: string): number[] {
  const alpha = text.toLowerCase().includes("alpha") ? 1 : 0;
  const beta = text.toLowerCase().includes("beta") ? 1 : 0;
  const base = [alpha, beta, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1];
  const norm = Math.sqrt(base.reduce((s, v) => s + v * v, 0));
  return base.map((v) => v / norm);
}

function createConfig(overrides: Partial<BuiltinKnowledgeConfig> = {}): BuiltinKnowledgeConfig {
  return {
    id: "kb_test",
    description: "test knowledge base",
    enabled: true,
    embedding: { modelId: "fake-embed", providerId: "fake" },
    dimensions: 8,
    normalized: true,
    fragmentsNumber: 3,
    chunkSize: 100,
    chunkOverlap: 10,
    ...overrides,
  };
}

describe("KnowledgeRuntime (daemon, DuckDB round trip)", () => {
  let storageDir: string;
  let config: BuiltinKnowledgeConfig;
  let updatedFiles: KnowledgeFileMessage[];
  let progressEvents: Array<{ fileId: string; completed: number; error: number; total: number }>;
  let runtime: KnowledgeRuntime;

  beforeEach(() => {
    storageDir = join(mkdtempSync(join(tmpdir(), "argos-knowledge-")), "KnowledgeBase");
    config = createConfig();
    updatedFiles = [];
    progressEvents = [];

    const events: KnowledgeStorePorts["events"] = {
      fileUpdated: (file) => updatedFiles.push(file),
      fileProgress: (payload) => progressEvents.push(payload),
    };

    runtime = new KnowledgeRuntime({
      storageDir,
      getKnowledgeConfigs: () => [config],
      ports: {
        ...createFileIngestionPort(events),
        getEmbeddings: async (_providerId, _modelId, texts) => texts.map(fakeEmbedding),
        events,
      },
    });
  });

  it("is supported on this platform", async () => {
    expect(await runtime.isSupported()).toBe(true);
  });

  it("ingests a text file and returns similarity results", async () => {
    const filePath = join(storageDir, "notes.txt");
    writeFileSync(filePath, "alpha content about the alpha project\n", "utf-8");

    const addResult = await runtime.addFile(config.id, filePath);
    expect(addResult.error).toBeUndefined();
    expect(addResult.data?.status).toBe("processing");

    // Wait for the async ingestion pipeline to settle (chunks + file finish).
    await waitFor(async () => {
      const files = await runtime.listFiles(config.id);
      return files[0]?.status === "completed";
    });

    const files = await runtime.listFiles(config.id);
    expect(files).toHaveLength(1);
    expect(files[0].status).toBe("completed");
    expect(files[0].metadata.totalChunks).toBeGreaterThan(0);
    expect(updatedFiles.length).toBeGreaterThan(0);
    expect(progressEvents.length).toBeGreaterThan(0);

    const results = await runtime.similarityQuery(config.id, "alpha");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].metadata.content).toContain("alpha");
  });

  it("validates supported and unsupported files", async () => {
    const txtPath = join(storageDir, "ok.txt");
    writeFileSync(txtPath, "hello alpha", "utf-8");
    const supported = await runtime.validateFile(txtPath);
    expect(supported.isSupported).toBe(true);

    const binPath = join(storageDir, "blob.bin");
    writeFileSync(binPath, new Uint8Array([0, 159, 146, 150]));
    const unsupported = await runtime.validateFile(binPath);
    expect(unsupported.isSupported).toBe(false);
  });

  it("reconciles stores when configs change (syncConfigs)", async () => {
    await runtime.syncConfigs();
    // Updating the snapshot to remove the config should delete the store dir.
    const events: KnowledgeStorePorts["events"] = {
      fileUpdated: () => {},
      fileProgress: () => {},
    };
    const emptyRuntime = new KnowledgeRuntime({
      storageDir,
      getKnowledgeConfigs: () => [config],
      ports: {
        ...createFileIngestionPort(events),
        getEmbeddings: async (_p, _m, texts) => texts.map(fakeEmbedding),
        events,
      },
    });
    await emptyRuntime.syncConfigs();
    await emptyRuntime.delete(config.id);
    // The store is gone: listing again re-creates an empty DuckDB store.
    const files = await emptyRuntime.listFiles(config.id);
    expect(files).toEqual([]);
  });

  it("exposes supported extensions and languages", async () => {
    const extensions = await runtime.getSupportedFileExtensions();
    expect(extensions).toContain("txt");
    expect(extensions).toContain("md");
    const languages = await runtime.getSupportedLanguages();
    expect(languages.length).toBeGreaterThan(0);
  });

  it("resetAll closes stores and clears persisted knowledge data", async () => {
    const filePath = join(storageDir, "reset-notes.txt");
    writeFileSync(filePath, "alpha content\n", "utf-8");
    await runtime.addFile(config.id, filePath);
    await waitFor(async () => {
      const files = await runtime.listFiles(config.id);
      return files[0]?.status === "completed";
    });
    // The store file now exists under <storageDir>/<kbId>.
    expect(fsExists(join(storageDir, config.id))).toBe(true);

    await runtime.resetAll();

    expect(fsExists(join(storageDir, config.id))).toBe(false);
    // Stores re-create lazily: querying again yields an empty base.
    const files = await runtime.listFiles(config.id);
    expect(files).toEqual([]);
  });
});

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Timed out waiting for knowledge ingestion to settle");
}
