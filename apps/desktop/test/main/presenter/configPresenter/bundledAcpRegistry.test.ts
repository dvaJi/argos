import { describe, expect, it, vi } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bundledManifest from "../../../../resources/acp-registry/registry.json";

// `test/setup.ts` globally mocks `fs` (and stubs `path.join`); the real module
// is required to inspect the bundled snapshot on disk.
const importRealFs = async () => await vi.importActual<typeof import("node:fs")>("node:fs");

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

// Anchored on this module's URL: relative specifiers resolve correctly in
// vitest.
const resourcesRoot = fileURLToPath(new URL("../../../../resources/acp-registry", import.meta.url));
const iconsDir = path.join(resourcesRoot, "icons");
const CDN_ICON_PREFIX = "https://cdn.agentclientprotocol.com/registry/";

// The bundled registry.json is a refreshed snapshot of the upstream ACP
// registry (agents come and go), so assertions here must hold for any
// snapshot: structural invariants only — never a specific agent.

describe("Bundled ACP registry manifest", () => {
  it("parses and has unique agent ids", () => {
    expect(manifest.version).toBeTruthy();
    expect(Array.isArray(manifest.agents)).toBe(true);
    expect(manifest.agents.length).toBeGreaterThan(0);
    const ids = manifest.agents.map((agent) => agent.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every agent an id, name, version, and a distribution entry", () => {
    for (const agent of manifest.agents) {
      expect(agent.id, "agent id").toBeTruthy();
      expect(agent.name, `${agent.id} name`).toBeTruthy();
      expect(agent.version, `${agent.id} version`).toBeTruthy();
      expect(agent.distribution, `${agent.id} distribution`).toBeTruthy();
    }
  });

  it("only declares npx distributions with a package name and array args", () => {
    for (const agent of manifest.agents) {
      const npx = agent.distribution?.npx;
      if (!npx) continue;
      expect(npx.package, `${agent.id} npx package`).toMatch(/^@?[a-z0-9-][^@]*@[0-9]/);
      if (npx.args) {
        expect(Array.isArray(npx.args), `${agent.id} npx args`).toBe(true);
      }
    }
  });

  it("ships a local svg icon for every CDN-cached agent icon", async () => {
    const fs = await importRealFs();
    const localIcons = new Set(fs.readdirSync(iconsDir));
    const cached = manifest.agents.filter(
      (agent) =>
        typeof agent.icon === "string" && agent.icon.startsWith(CDN_ICON_PREFIX) && agent.icon.endsWith(".svg"),
    );
    expect(cached.length).toBeGreaterThan(0);
    for (const agent of cached) {
      expect(agent.id).toMatch(/^[A-Za-z0-9._-]+$/);
      expect(localIcons.has(`${agent.id}.svg`), `missing icon for ${agent.id}`).toBe(true);
    }
  });

  it("keeps icon files small and svg-shaped", async () => {
    const fs = await importRealFs();
    for (const name of fs.readdirSync(iconsDir)) {
      expect(name).toMatch(/\.svg$/);
      const content = fs.readFileSync(path.join(iconsDir, name), "utf8");
      // Some upstream icons carry an `<?xml …?>` prolog before the root <svg>.
      expect(content).toMatch(/<svg\b/);
      expect(content.length).toBeLessThan(256 * 1024);
    }
  });
});
