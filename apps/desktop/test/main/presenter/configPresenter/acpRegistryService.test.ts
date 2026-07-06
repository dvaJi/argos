import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SVGSanitizer } from "@argos/backend-core";

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    __esModule: true,
    ...actual,
    default: actual,
  };
});

type RegistryManifestFixture = {
  version: string;
  agents: Array<{
    id: string;
    name: string;
    version: string;
    icon?: string;
    distribution: {
      npx: {
        package: string;
      };
    };
  }>;
};

const SVG_ICON = '<svg viewBox="0 0 16 16"><path fill="currentColor" d="M0 0h16v16H0z" /></svg>';

describe("AcpRegistryService", () => {
  let tempRoot: string;
  let appRoot: string;
  let userDataRoot: string;
  let sanitizer: SVGSanitizer;

  const importService = async () => {
    const mod = await import("@argos/acp-runtime/config/acpRegistryService");
    return mod.AcpRegistryService;
  };

  const writeBuiltInIcon = (agentId: string, markup: string) => {
    const iconDir = path.join(appRoot, "resources", "acp-registry", "icons");
    fs.mkdirSync(iconDir, { recursive: true });
    fs.writeFileSync(path.join(iconDir, `${agentId}.svg`), markup, "utf-8");
  };

  const writeBuiltInManifest = (manifest: RegistryManifestFixture) => {
    const registryDir = path.join(appRoot, "resources", "acp-registry");
    fs.mkdirSync(registryDir, { recursive: true });
    fs.writeFileSync(path.join(registryDir, "registry.json"), JSON.stringify(manifest), "utf-8");
  };

  const createManifest = (agentId = "claude-acp"): RegistryManifestFixture => ({
    version: "1",
    agents: [
      {
        id: agentId,
        name: "Claude Agent",
        version: "0.22.2",
        icon: `https://cdn.agentclientprotocol.com/registry/v1/latest/${agentId}.svg`,
        distribution: {
          npx: {
            package: "@zed-industries/claude-agent-acp@0.22.2",
          },
        },
      },
    ],
  });

  const createService = async (options?: Record<string, unknown>) => {
    const AcpRegistryService = await importService();
    return new AcpRegistryService({
      userDataDir: () => userDataRoot,
      appPath: () => appRoot,
      sanitizeSvg: (svg: string) => sanitizer.sanitize(svg),
      ...(options as object),
    });
  };

  /** Stub global fetch routing manifest (.json) vs icon (.svg) requests. */
  const stubFetch = (manifestJson: string, icon: { ok: boolean; status?: number; text?: string }) => {
    const fn = vi.fn<(...args: any[]) => any>(async (url: string) => {
      if (String(url).endsWith(".svg")) {
        return icon.ok
          ? { ok: true, text: vi.fn<(...args: any[]) => any>().mockResolvedValue(icon.text ?? "") }
          : { ok: false, status: icon.status ?? 500, statusText: "Unavailable" };
      }
      return { ok: true, text: vi.fn<(...args: any[]) => any>().mockResolvedValue(manifestJson) };
    });
    vi.stubGlobal("fetch", fn);
    return fn;
  };

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "argos-acp-registry-"));
    appRoot = path.join(tempRoot, "app-root");
    userDataRoot = path.join(tempRoot, "user-data");
    fs.mkdirSync(appRoot, { recursive: true });
    fs.mkdirSync(userDataRoot, { recursive: true });
    sanitizer = new SVGSanitizer();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("falls back to bundled icon markup without network fetch in render path", async () => {
    writeBuiltInIcon("claude-acp", SVG_ICON);
    const globalFetch = vi.fn<(...args: any[]) => any>();
    vi.stubGlobal("fetch", globalFetch);

    const service = await createService();

    const markup = await service.getIconMarkup(
      "claude-acp",
      "https://cdn.agentclientprotocol.com/registry/v1/latest/claude-acp.svg",
    );

    expect(markup).toContain('focusable="false"');
    expect(markup).toContain('color="currentColor"');
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("skips the automatic registry refresh when privacy mode is enabled", async () => {
    const manifest = createManifest();
    writeBuiltInManifest(manifest);
    const globalFetch = vi.fn<(...args: any[]) => any>();
    vi.stubGlobal("fetch", globalFetch);

    const service = await createService({ isPrivacyModeEnabled: () => true });

    await service.initialize();

    expect(globalFetch).not.toHaveBeenCalled();
    expect(service.listAgents()).toHaveLength(1);
  });

  it("writes refreshed icon cache and prunes stale cached icons", async () => {
    const manifest = createManifest();
    const fetchFn = stubFetch(JSON.stringify(manifest), { ok: true, text: SVG_ICON });

    const staleIconDir = path.join(userDataRoot, "acp-registry", "icons");
    fs.mkdirSync(staleIconDir, { recursive: true });
    fs.writeFileSync(path.join(staleIconDir, "obsolete.svg"), "<svg></svg>", "utf-8");

    const service = await createService();

    await service.refresh(true);

    expect(fs.existsSync(path.join(staleIconDir, "claude-acp.svg"))).toBe(true);
    expect(fs.existsSync(path.join(staleIconDir, "obsolete.svg"))).toBe(false);

    const markup = await service.getIconMarkup("claude-acp", manifest.agents[0].icon);
    expect(markup).toContain("currentColor");
    expect(fetchFn).toHaveBeenCalledWith(
      "https://cdn.agentclientprotocol.com/registry/v1/latest/claude-acp.svg",
      expect.anything(),
    );
  });

  it("keeps manual refresh available while privacy mode is enabled", async () => {
    const manifest = createManifest();
    writeBuiltInManifest(manifest);
    const fetchFn = stubFetch(JSON.stringify(manifest), { ok: true, text: SVG_ICON });

    const service = await createService({ isPrivacyModeEnabled: () => true });

    await service.refresh(true);

    // manifest + icon both routed through the single global fetch stub
    expect(fetchFn).toHaveBeenCalled();
    expect(service.listAgents()).toHaveLength(1);
  });

  it("preserves existing cached icon when refreshing a new icon fails", async () => {
    const manifest = createManifest();
    stubFetch(JSON.stringify(manifest), { ok: false, status: 503 });

    const iconDir = path.join(userDataRoot, "acp-registry", "icons");
    fs.mkdirSync(iconDir, { recursive: true });
    const oldMarkup = '<svg viewBox="0 0 16 16"><path fill="currentColor" d="M0 0h8v16H0z" /></svg>';
    fs.writeFileSync(path.join(iconDir, "claude-acp.svg"), oldMarkup, "utf-8");

    const service = await createService();

    await service.refresh(true);

    expect(fs.readFileSync(path.join(iconDir, "claude-acp.svg"), "utf-8")).toBe(oldMarkup);

    const markup = await service.getIconMarkup("claude-acp", manifest.agents[0].icon);
    expect(markup).toContain("currentColor");
  });

  it("rejects manifests with duplicate agent ids", async () => {
    const duplicateManifest: RegistryManifestFixture = {
      version: "1",
      agents: [createManifest("claude-acp").agents[0], createManifest("claude-acp").agents[0]],
    };
    const emptyAppRoot = path.join(tempRoot, "empty-app-root");
    const emptyCwd = path.join(tempRoot, "empty-cwd");
    fs.mkdirSync(emptyAppRoot, { recursive: true });
    fs.mkdirSync(emptyCwd, { recursive: true });
    vi.spyOn<(...args: any[]) => any>(process, "cwd").mockReturnValue(emptyCwd);

    const AcpRegistryService = await importService();
    const fetchFn = vi.fn<(...args: any[]) => any>().mockResolvedValue({
      ok: true,
      text: vi.fn<(...args: any[]) => any>().mockResolvedValue(JSON.stringify(duplicateManifest)),
    });
    vi.stubGlobal("fetch", fetchFn);

    const service = new AcpRegistryService({
      userDataDir: () => userDataRoot,
      appPath: () => emptyAppRoot,
      sanitizeSvg: (svg: string) => sanitizer.sanitize(svg),
    });

    await expect(service.refresh(true)).rejects.toThrow("[ACP Registry] No registry snapshot is available.");
  });
});
