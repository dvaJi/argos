import { describe, expect, it } from "vitest";
import bundledManifest from "../../../../resources/acp-registry/registry.json";
import mimoIcon from "../../../../resources/acp-registry/icons/mimo.svg?raw";

type BundledPackageDistribution = {
  package: string;
  args?: string[];
  env?: Record<string, string>;
};

type BundledAgent = {
  id: string;
  name: string;
  version: string;
  description?: string;
  distribution: {
    npx?: BundledPackageDistribution;
  };
  icon?: string;
};

type BundledManifest = {
  version: string;
  agents: BundledAgent[];
};

const manifest = bundledManifest as BundledManifest;

describe("Bundled ACP registry manifest", () => {
  it("parses and has unique agent ids", () => {
    expect(manifest.version).toBeTruthy();
    expect(Array.isArray(manifest.agents)).toBe(true);
    const ids = manifest.agents.map((agent) => agent.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("includes MiMo-Code with a valid npx distribution", () => {
    const mimo = manifest.agents.find((agent) => agent.id === "mimo");

    expect(mimo).toBeDefined();
    expect(mimo?.name).toBe("MiMo Code");
    expect(mimo?.distribution.npx).toBeDefined();
    expect(mimo?.distribution.npx?.package).toMatch(/^@mimo-ai\/cli@/);
    expect(mimo?.distribution.npx?.args).toEqual(["acp"]);
  });

  it("ships a matching mimo icon alongside the manifest", () => {
    const mimo = manifest.agents.find((agent) => agent.id === "mimo");
    expect(mimo).toBeDefined();

    expect(typeof mimoIcon).toBe("string");
    expect(mimoIcon).toMatch(/^<svg\b/);
  });
});
