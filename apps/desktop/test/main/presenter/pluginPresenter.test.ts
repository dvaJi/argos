import { createHash } from "node:crypto";
import fs from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { app, BrowserWindow } from "electron";
import { zipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron-store", () => ({
  default: class MockElectronStore {
    private data: Record<string, unknown>;

    constructor(options?: { defaults?: Record<string, unknown> }) {
      this.data = JSON.parse(JSON.stringify(options?.defaults ?? {}));
    }

    get(key: string) {
      return this.data[key];
    }

    set(key: string, value: unknown) {
      this.data[key] = value;
    }
  },
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    default: actual,
  };
});

vi.mock("#/lib/paths", () => ({
  getPreloadPath: vi.fn((name: string) => `/mock/preload/${name}`),
}));

vi.mock("electron", () => ({
  app: {
    getName: vi.fn(() => "Argos"),
    getVersion: vi.fn(() => "0.2.3"),
    getAppPath: vi.fn(() => process.cwd()),
    getPath: vi.fn((_name: string) => path.join(os.tmpdir(), "argos-plugin-presenter-user-data")),
    isPackaged: false,
    on: vi.fn(),
    quit: vi.fn(),
  },
  BrowserWindow: vi.fn(function MockBrowserWindow(this: Record<string, unknown>) {
    this.loadURL = vi.fn();
    this.loadFile = vi.fn();
    this.on = vi.fn();
    this.show = vi.fn();
    this.focus = vi.fn();
    this.close = vi.fn();
    this.isDestroyed = vi.fn(() => false);
    this.webContents = {
      send: vi.fn(),
      on: vi.fn(),
      setWindowOpenHandler: vi.fn(),
    };
    return this;
  }) as unknown as new (options?: Record<string, unknown>) => BrowserWindow,
  shell: {
    openExternal: vi.fn(),
    openPath: vi.fn(),
  },
}));

const tempRoots: string[] = [];
const originalCwd = process.cwd();
const repoRoot = path.resolve(process.cwd(), "../..");
const readRepoFile = (relativePath: string) => readFile(path.join(repoRoot, relativePath), "utf8");

type CreatePluginPresenterOptions = {
  appPath?: string;
  isPackaged?: boolean;
  resourcesPath?: string;
  mcpEnabled?: boolean;
  arch?: NodeJS.Architecture;
};

const createPluginPresenter = async (
  platform: NodeJS.Platform,
  optionsOrAppPath: CreatePluginPresenterOptions | string = process.cwd(),
) => {
  const options = typeof optionsOrAppPath === "string" ? { appPath: optionsOrAppPath } : optionsOrAppPath;
  const { PluginPresenter } = await import("#/presenter/pluginPresenter");
  const mcpServers: Record<string, unknown> = {};
  const configPresenter = {
    getMcpServers: vi.fn<(...args: any[]) => any>().mockImplementation(async () => mcpServers),
    addMcpServer: vi.fn<(...args: any[]) => any>().mockImplementation(async (serverName: string, config: unknown) => {
      mcpServers[serverName] = config;
    }),
    updateMcpServer: vi
      .fn<(...args: any[]) => any>()
      .mockImplementation(async (serverName: string, config: unknown) => {
        mcpServers[serverName] = config;
      }),
    removeMcpServer: vi.fn<(...args: any[]) => any>().mockImplementation(async (serverName: string) => {
      delete mcpServers[serverName];
    }),
    getMcpEnabled: vi.fn<(...args: any[]) => any>().mockResolvedValue(options.mcpEnabled ?? true),
  };
  const mcpPresenter = {
    isReady: vi.fn<(...args: any[]) => any>(() => true),
    isServerRunning: vi.fn<(...args: any[]) => any>().mockResolvedValue(false),
    startServer: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
    stopServer: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
  };
  const skillPresenter = {
    unregisterPluginSkillsByOwner: vi.fn<(...args: any[]) => any>().mockResolvedValue(undefined),
  };
  const { PluginRuntimeRegistry } = await import("@argos/mcp-runtime");
  const pluginRuntime = new PluginRuntimeRegistry({
    isServerRunning: () => false,
    startServer: vi.fn(),
    stopServer: vi.fn(),
  } as any);
  const presenter = new PluginPresenter({
    platform,
    arch: options.arch,
    appPath: options.appPath ?? process.cwd(),
    isPackaged: options.isPackaged,
    resourcesPath: options.resourcesPath,
    configPresenter,
    mcpPresenter,
    skillPresenter,
    pluginRuntime,
  } as any);
  return Object.assign(presenter, {
    __mocks: {
      configPresenter,
      mcpPresenter,
      skillPresenter,
    },
  });
};

const createBundledFixture = async (
  options: {
    appPath?: string;
    packageRoot?: string;
    pluginId?: string;
    name?: string;
    includeSettings?: boolean;
  } = {},
) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "argos-plugin-test-"));
  tempRoots.push(root);
  const appPath = options.appPath ?? path.join(root, "app");
  const userDataPath = path.join(root, "userData");
  const packageRoot = options.packageRoot ?? path.join(appPath, "plugins");
  const packagePath = path.join(packageRoot, "argos-plugin-fixture-0.2.3-darwin-x64.dcplugin");
  const runtimeRelativePath = `runtime/darwin/${process.arch}/fixture-runtime`;
  const pluginId = options.pluginId ?? "com.argos.plugins.fixture";
  const includeSettings = options.includeSettings ?? false;
  const manifest = {
    id: pluginId,
    name: options.name ?? "Fixture Runtime",
    version: "0.2.3",
    publisher: "Argos",
    engines: {
      argos: ">=0.2.3",
      platforms: ["darwin"],
    },
    activationEvents: ["onEnable"],
    capabilities: includeSettings
      ? ["runtime.manage", "mcp.register", "settings.contribute"]
      : ["runtime.manage", "mcp.register"],
    source: {
      type: "argos-official",
      url: "https://github.com/dvaJi/argos/releases/download/v0.2.3/argos-plugin-fixture-0.2.3-darwin-x64.dcplugin",
      publisher: "Argos",
    },
    runtime: {
      id: "fixture-runtime",
      type: "external-helper",
      displayName: "Fixture Runtime",
      detect: [`plugin:${runtimeRelativePath}`],
    },
    mcpServers: [
      {
        id: "fixture-runtime",
        displayName: "Fixture Runtime",
        transport: "stdio",
        command: "${runtime.fixture-runtime.command}",
        args: ["mcp"],
        autoApprove: [],
      },
    ],
    ...(includeSettings
      ? {
          settingsContributions: [
            {
              id: "fixture-settings",
              title: "Fixture Settings",
              placement: "plugins",
              entry: "settings/index.html",
              preloadTypes: "types/settings-preload.d.ts",
            },
          ],
        }
      : {}),
  };
  const files: Record<string, Uint8Array> = {
    "plugin.json": new TextEncoder().encode(`${JSON.stringify(manifest, null, 2)}\n`),
    [runtimeRelativePath]: new TextEncoder().encode("#!/bin/sh\necho fixture-runtime 1.0.0\n"),
  };
  if (includeSettings) {
    files["settings/index.html"] = new TextEncoder().encode("<!doctype html><title>Fixture Settings</title>\n");
    files["types/settings-preload.d.ts"] = new TextEncoder().encode("interface Window { argosPlugin?: unknown }\n");
  }
  const checksums = Object.fromEntries(
    Object.entries(files).map(([filePath, content]) => [
      filePath,
      createHash("sha256").update(Buffer.from(content)).digest("hex"),
    ]),
  );
  files["checksums.json"] = new TextEncoder().encode(`${JSON.stringify(checksums, null, 2)}\n`);

  await mkdir(packageRoot, { recursive: true });
  await mkdir(userDataPath, { recursive: true });
  await writeFile(packagePath, Buffer.from(zipSync(files, { level: 6 })));
  vi.mocked<(...args: any[]) => any>(app.getPath).mockImplementation((name: string) => {
    if (name === "userData") {
      return userDataPath;
    }
    if (name === "temp" || name === "home") {
      return root;
    }
    return "/mock/path";
  });

  return {
    appPath,
    userDataPath,
    pluginId: manifest.id,
    packagePath,
  };
};

const createDirectoryFixture = async (
  options: {
    appPath?: string;
    pluginId?: string;
    name?: string;
  } = {},
) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "argos-plugin-dir-test-"));
  tempRoots.push(root);
  const appPath = options.appPath ?? path.join(root, "app");
  const userDataPath = path.join(root, "userData");
  const pluginId = options.pluginId ?? "com.argos.plugins.fixture";
  const pluginRoot = path.join(appPath, "plugins", pluginId);
  const installedRoot = path.join(userDataPath, "plugins", pluginId);
  const currentManifest = {
    id: pluginId,
    name: options.name ?? "Fixture Settings Plugin",
    version: "0.2.3",
    publisher: "Argos",
    engines: {
      argos: ">=0.2.3",
      platforms: ["darwin"],
    },
    activationEvents: ["onEnable"],
    capabilities: ["mcp.register", "settings.contribute"],
    source: {
      type: "argos-official",
      url: "https://github.com/dvaJi/argos/releases/download/v0.2.3/argos-plugin-fixture-0.2.3-darwin-x64.dcplugin",
      publisher: "Argos",
    },
    mcpServers: [
      {
        id: "fixture-tools",
        displayName: "Fixture Tools",
        transport: "stdio",
        command: "node",
        args: ["${plugin.root}/mcp/serve.mjs"],
        env: {},
        autoApprove: ["all"],
      },
    ],
    settingsContributions: [
      {
        id: "fixture-settings",
        title: "Fixture Settings",
        placement: "plugins",
        entry: "settings/index.html",
        preloadTypes: "types/settings-preload.d.ts",
      },
    ],
  };
  const staleInstalledManifest = {
    ...currentManifest,
    capabilities: ["mcp.register"],
    mcpServers: [
      {
        id: "fixture-tools",
        displayName: "Fixture Tools",
        transport: "stdio",
        command: "node",
        args: ["${plugin.root}/mcp/legacy.mjs"],
        env: {
          FIXTURE_APP_ID: "",
        },
        autoApprove: ["all"],
      },
    ],
  };
  delete (staleInstalledManifest as { settingsContributions?: unknown }).settingsContributions;

  await mkdir(path.join(pluginRoot, "mcp"), { recursive: true });
  await mkdir(path.join(pluginRoot, "settings"), { recursive: true });
  await mkdir(path.join(pluginRoot, "types"), { recursive: true });
  await mkdir(path.join(installedRoot, "mcp"), { recursive: true });
  await mkdir(installedRoot, { recursive: true });
  await writeFile(path.join(pluginRoot, "plugin.json"), `${JSON.stringify(currentManifest, null, 2)}\n`);
  await writeFile(path.join(pluginRoot, "mcp", "serve.mjs"), 'console.log("serve")\n');
  await writeFile(path.join(pluginRoot, "settings", "index.html"), "<!doctype html><title>Fixture Settings</title>\n");
  await writeFile(
    path.join(pluginRoot, "types", "settings-preload.d.ts"),
    "interface Window { argosPlugin?: unknown }\n",
  );
  await writeFile(path.join(installedRoot, "plugin.json"), `${JSON.stringify(staleInstalledManifest, null, 2)}\n`);
  await writeFile(path.join(installedRoot, "mcp", "legacy.mjs"), 'console.log("legacy")\n');
  vi.mocked<(...args: any[]) => any>(app.getPath).mockImplementation((name: string) => {
    if (name === "userData") {
      return userDataPath;
    }
    if (name === "temp" || name === "home") {
      return root;
    }
    return "/mock/path";
  });

  return {
    appPath,
    pluginId,
    pluginRoot,
    installedRoot,
    userDataPath,
  };
};

// These tests read the built-in CUA plugin manifest (plugins/cua/plugin.json).
// Skip when absent (e.g. fresh checkout, CI without the runtime build) rather
// than fail; the path resolves from the repository root.
describe.skipIf(!fs.existsSync(path.join(repoRoot, "plugins", "cua", "plugin.json")))("PluginPresenter", () => {
  afterEach(async () => {
    process.chdir(originalCwd);
    vi.mocked<(...args: any[]) => any>(app.getPath).mockImplementation(() => "/mock/path");
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("targets the CUA official plugin by platform and arch", { timeout: 60_000 }, async () => {
    const darwinPresenter = await createPluginPresenter("darwin", { arch: "arm64", appPath: repoRoot });
    const winX64Presenter = await createPluginPresenter("win32", { arch: "x64", appPath: repoRoot });
    const linuxX64Presenter = await createPluginPresenter("linux", { arch: "x64", appPath: repoRoot });
    const winIa32Presenter = await createPluginPresenter("win32", { arch: "ia32", appPath: repoRoot });
    const manifest = JSON.parse(await readRepoFile("plugins/cua/plugin.json"));

    expect(manifest.engines.platforms).toEqual(["darwin", "win32", "linux"]);
    expect(manifest.engines.targets).toEqual(["darwin/arm64", "darwin/x64", "win32/x64", "win32/arm64", "linux/x64"]);
    expect((await darwinPresenter.listPlugins()).map((plugin) => plugin.id)).toContain("com.argos.plugins.cua");
    expect((await winX64Presenter.listPlugins()).map((plugin) => plugin.id)).toContain("com.argos.plugins.cua");
    expect((await linuxX64Presenter.listPlugins()).map((plugin) => plugin.id)).toContain("com.argos.plugins.cua");
    expect((await winIa32Presenter.listPlugins()).map((plugin) => plugin.id)).not.toContain("com.argos.plugins.cua");
  });

  it("lists bundled official plugins as installed and enables them by materializing the package", async () => {
    const fixture = await createBundledFixture();
    const presenter = await createPluginPresenter("darwin", fixture.appPath);

    const plugins = await presenter.listPlugins();
    const plugin = plugins.find((item) => item.id === fixture.pluginId);
    expect(plugin).toMatchObject({
      id: fixture.pluginId,
      installed: true,
      enabled: false,
      trusted: true,
      trustState: "trusted",
    });

    const result = await presenter.enablePlugin(fixture.pluginId);
    expect(result.ok).toBe(true);
    expect(result.status).toMatchObject({
      id: fixture.pluginId,
      installed: true,
      enabled: true,
      runtime: {
        state: "installed",
        version: "fixture-runtime 1.0.0",
      },
    });
    expect(fs.existsSync(path.join(fixture.userDataPath, "plugins", fixture.pluginId, "plugin.json"))).toBe(true);

    const disabled = await presenter.disablePlugin(fixture.pluginId);
    expect(disabled.ok).toBe(true);
    expect(disabled.status).toMatchObject({
      id: fixture.pluginId,
      installed: true,
      enabled: false,
    });
  });

  it("restores plugin settings from the installed manifest when stored resources are missing", async () => {
    const fixture = await createBundledFixture({ includeSettings: true });
    const presenter = await createPluginPresenter("darwin", fixture.appPath);
    vi.clearAllMocks();

    const enabled = await presenter.enablePlugin(fixture.pluginId);

    expect(enabled.ok).toBe(true);
    expect(enabled.status).toMatchObject({
      id: fixture.pluginId,
      enabled: true,
      settings: {
        id: "fixture-settings",
        ownerPluginId: fixture.pluginId,
        title: "Fixture Settings",
      },
    });

    (presenter as any).store.set("resources", []);

    const plugin = await presenter.getPlugin(fixture.pluginId);

    expect(plugin).toMatchObject({
      id: fixture.pluginId,
      enabled: true,
      settings: {
        id: "fixture-settings",
        ownerPluginId: fixture.pluginId,
        title: "Fixture Settings",
      },
    });

    const action = await presenter.invokeAction(fixture.pluginId, "settings.open");

    expect(action).toMatchObject({ ok: true });
    expect(BrowserWindow).toHaveBeenCalledTimes(1);
    expect(vi.mocked<(...args: any[]) => any>(BrowserWindow).mock.results[0]?.value.loadFile).toHaveBeenCalledWith(
      path.join(fixture.userDataPath, "plugins", fixture.pluginId, "settings", "index.html"),
      {
        query: {
          pluginId: fixture.pluginId,
        },
      },
    );
  });

  it("opens settings for a disabled packaged plugin that declares a settings contribution", async () => {
    const fixture = await createBundledFixture({ includeSettings: true });
    const presenter = await createPluginPresenter("darwin", fixture.appPath);
    vi.clearAllMocks();

    const plugin = (await presenter.listPlugins()).find((item) => item.id === fixture.pluginId);

    expect(plugin).toMatchObject({
      id: fixture.pluginId,
      enabled: false,
      settings: {
        id: "fixture-settings",
        ownerPluginId: fixture.pluginId,
        title: "Fixture Settings",
      },
    });

    const action = await presenter.invokeAction(fixture.pluginId, "settings.open");

    expect(action).toMatchObject({ ok: true });
    expect(BrowserWindow).toHaveBeenCalledTimes(1);
    expect(vi.mocked<(...args: any[]) => any>(BrowserWindow).mock.results[0]?.value.loadFile).toHaveBeenCalledWith(
      path.join(fixture.userDataPath, "plugins", fixture.pluginId, "settings", "index.html"),
      {
        query: {
          pluginId: fixture.pluginId,
        },
      },
    );
  });

  it("uses the current official manifest when an installed copy lacks settings metadata", async () => {
    const fixture = await createBundledFixture({ includeSettings: true });
    const presenter = await createPluginPresenter("darwin", fixture.appPath);

    const enabled = await presenter.enablePlugin(fixture.pluginId);
    expect(enabled.ok).toBe(true);

    const disabled = await presenter.disablePlugin(fixture.pluginId);
    expect(disabled.ok).toBe(true);

    const installedManifestPath = path.join(fixture.userDataPath, "plugins", fixture.pluginId, "plugin.json");
    const installedManifest = JSON.parse(await readFile(installedManifestPath, "utf8"));
    delete installedManifest.settingsContributions;
    await writeFile(installedManifestPath, `${JSON.stringify(installedManifest, null, 2)}\n`);
    vi.clearAllMocks();

    const plugin = await presenter.getPlugin(fixture.pluginId);

    expect(plugin).toMatchObject({
      id: fixture.pluginId,
      enabled: false,
      settings: {
        id: "fixture-settings",
        ownerPluginId: fixture.pluginId,
        title: "Fixture Settings",
      },
    });

    const action = await presenter.invokeAction(fixture.pluginId, "settings.open");

    expect(action).toMatchObject({ ok: true });
    expect(BrowserWindow).toHaveBeenCalledTimes(1);
    expect(vi.mocked<(...args: any[]) => any>(BrowserWindow).mock.results[0]?.value.loadFile).toHaveBeenCalledWith(
      path.join(fixture.userDataPath, "plugins", fixture.pluginId, "settings", "index.html"),
      {
        query: {
          pluginId: fixture.pluginId,
        },
      },
    );
  });

  it("prefers workspace plugin metadata over a stale installed directory copy in development", async () => {
    const fixture = await createDirectoryFixture();
    const presenter = await createPluginPresenter("darwin", fixture.appPath);
    vi.clearAllMocks();

    const plugin = await presenter.getPlugin(fixture.pluginId);

    expect(plugin).toMatchObject({
      id: fixture.pluginId,
      enabled: false,
      settings: {
        id: "fixture-settings",
        ownerPluginId: fixture.pluginId,
        title: "Fixture Settings",
      },
    });

    const action = await presenter.invokeAction(fixture.pluginId, "settings.open");

    expect(action).toMatchObject({ ok: true });
    expect(BrowserWindow).toHaveBeenCalledTimes(1);
    expect(vi.mocked<(...args: any[]) => any>(BrowserWindow).mock.results[0]?.value.loadFile).toHaveBeenCalledWith(
      path.join(fixture.installedRoot, "settings", "index.html"),
      {
        query: {
          pluginId: fixture.pluginId,
        },
      },
    );
  });

  it("refreshes stale same-version installs before startup activation and preserves config", async () => {
    const fixture = await createDirectoryFixture();
    const presenter = await createPluginPresenter("darwin", fixture.appPath);
    const config = {
      appId: "cli_fixture_app_id",
      appSecret: "fixture-secret",
      brand: "telegram",
      preset: "preset.default",
    };
    await writeFile(path.join(fixture.installedRoot, "config.json"), `${JSON.stringify(config)}\n`);
    (presenter as any).store.set("installations", [
      {
        pluginId: fixture.pluginId,
        version: "0.2.3",
        path: fixture.installedRoot,
        enabled: true,
        trusted: true,
        source: "argos-official",
        installedAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);

    await presenter.initialize();

    const installedManifest = JSON.parse(await readFile(path.join(fixture.installedRoot, "plugin.json"), "utf8"));
    const configAfterRefresh = JSON.parse(await readFile(path.join(fixture.installedRoot, "config.json"), "utf8"));
    const servers = await presenter.__mocks.configPresenter.getMcpServers();

    expect(installedManifest.settingsContributions).toEqual([
      {
        id: "fixture-settings",
        title: "Fixture Settings",
        placement: "plugins",
        entry: "settings/index.html",
        preloadTypes: "types/settings-preload.d.ts",
      },
    ]);
    expect(installedManifest.mcpServers[0].args).toEqual(["${plugin.root}/mcp/serve.mjs"]);
    expect(fs.existsSync(path.join(fixture.installedRoot, "mcp", "serve.mjs"))).toBe(true);
    expect(fs.existsSync(path.join(fixture.installedRoot, "mcp", "legacy.mjs"))).toBe(false);
    expect(configAfterRefresh).toMatchObject(config);
    expect(servers["fixture-tools"]).toMatchObject({
      args: [path.join(fixture.installedRoot, "mcp", "serve.mjs")],
      source: "plugin",
      sourceId: fixture.pluginId,
      enabled: true,
    });
    expect(presenter.__mocks.mcpPresenter.startServer).toHaveBeenCalledWith("fixture-tools");
  });

  it("syncs dev directory installs even when only the plugin files changed", async () => {
    const fixture = await createDirectoryFixture();
    const presenter = await createPluginPresenter("darwin", fixture.appPath);
    const currentManifest = await readFile(path.join(fixture.pluginRoot, "plugin.json"), "utf8");
    const config = {
      appId: "cli_fixture_app_id",
      appSecret: "fixture-secret",
      brand: "telegram",
      preset: "preset.default",
    };

    await writeFile(path.join(fixture.installedRoot, "plugin.json"), currentManifest);
    await writeFile(path.join(fixture.installedRoot, "mcp", "serve.mjs"), 'console.log("stale")\n');
    await writeFile(path.join(fixture.installedRoot, "config.json"), `${JSON.stringify(config)}\n`);
    (presenter as any).store.set("installations", [
      {
        pluginId: fixture.pluginId,
        version: "0.2.3",
        path: fixture.installedRoot,
        enabled: true,
        trusted: true,
        source: "argos-official",
        installedAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);

    await presenter.initialize();

    const serveScript = await readFile(path.join(fixture.installedRoot, "mcp", "serve.mjs"), "utf8");
    const configAfterRefresh = JSON.parse(await readFile(path.join(fixture.installedRoot, "config.json"), "utf8"));

    expect(serveScript).toBe('console.log("serve")\n');
    expect(configAfterRefresh).toMatchObject(config);
    expect(presenter.__mocks.mcpPresenter.startServer).toHaveBeenCalledWith("fixture-tools");
  });

  it("removes persisted plugin state when discovery rejects an installed official plugin", async () => {
    const fixture = await createDirectoryFixture();
    const workspaceManifestPath = path.join(fixture.pluginRoot, "plugin.json");
    const manifest = JSON.parse(await readFile(workspaceManifestPath, "utf8"));
    manifest.toolPolicies = [
      {
        serverId: "fixture-tools",
        tools: {
          fixture_tool: "ask",
        },
      },
    ];
    await writeFile(workspaceManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const presenter = await createPluginPresenter("darwin", fixture.appPath);
    const { getPluginToolPolicy } = await import("#/presenter/pluginPresenter/toolPolicyStore");

    const enabled = await presenter.enablePlugin(fixture.pluginId);
    expect(enabled.ok).toBe(true);
    expect(getPluginToolPolicy("fixture-tools", "fixture_tool")).toBe("ask");

    const rejectedManifest = {
      ...manifest,
      engines: {
        ...manifest.engines,
        platforms: ["linux"],
      },
    };
    await writeFile(workspaceManifestPath, `${JSON.stringify(rejectedManifest, null, 2)}\n`);
    await writeFile(path.join(fixture.installedRoot, "plugin.json"), `${JSON.stringify(rejectedManifest, null, 2)}\n`);

    await presenter.initialize();

    const servers = await presenter.__mocks.configPresenter.getMcpServers();

    expect((presenter as any).store.get("installations")).toEqual([]);
    expect((presenter as any).store.get("resources")).toEqual([]);
    expect((presenter as any).store.get("runtimes")).toEqual([]);
    expect(servers["fixture-tools"]).toBeUndefined();
    expect(getPluginToolPolicy("fixture-tools", "fixture_tool")).toBeNull();
  });

  it("loads official packages only from resources roots in packaged mode", async () => {
    const cwdRoot = await mkdtemp(path.join(os.tmpdir(), "argos-plugin-cwd-"));
    tempRoots.push(cwdRoot);
    const resourcesPath = path.join(cwdRoot, "resources");
    const pluginId = "com.argos.plugins.fixture";
    await createBundledFixture({
      packageRoot: path.join(cwdRoot, "build", "bundled-plugins"),
      pluginId,
      name: "Forged Runtime",
    });
    await createBundledFixture({
      packageRoot: path.join(resourcesPath, "plugins"),
      pluginId,
      name: "Resource Runtime",
    });
    process.chdir(cwdRoot);
    const presenter = await createPluginPresenter("darwin", {
      appPath: path.join(cwdRoot, "app"),
      isPackaged: true,
      resourcesPath,
    });

    const plugins = await presenter.listPlugins();

    const plugin = plugins.find((item) => item.id === pluginId);
    expect(plugin).toMatchObject({
      id: pluginId,
      name: "Resource Runtime",
      trusted: true,
      trustState: "trusted",
    });
  });

  it("loads the vite-plugin-electron plugin settings preload output", async () => {
    const presenterSource = await readFile("src/main/presenter/pluginPresenter/index.ts", "utf8");
    const viteConfigSource = await readFile("vite.config.ts", "utf8");

    expect(viteConfigSource).toContain("pluginSettings: resolve");
    expect(presenterSource).toContain('getPreloadPath("pluginSettings.mjs")');
    expect(presenterSource).not.toContain("../preload/plugin-settings-preload.mjs");
  });

  it("uses the CUA permission probe for runtime checks", async () => {
    const presenterSource = await readFile("src/main/presenter/pluginPresenter/index.ts", "utf8");

    expect(presenterSource).toContain("argos-permission-probe");
    expect(presenterSource).toContain("Runtime permission probe failed");
  });

  it("resolves CUA helper paths, MCP env, and runtime auto-start hooks", async () => {
    const presenterSource = await readFile("src/main/presenter/pluginPresenter/index.ts", "utf8");

    expect(presenterSource).toContain("helperAppPath");
    expect(presenterSource).toContain("resolveHelperAppPath");
    expect(presenterSource).toContain("resolvePluginTemplateRecord");
    expect(presenterSource).toContain("startPluginMcpServersIfReady");
    expect(presenterSource).toContain("this.mcpPresenter.startServer(serverName)");
    expect(presenterSource).not.toContain("if (!(await this.configPresenter.getMcpEnabled()))");
  });

  it("starts plugin MCP servers even when the global MCP switch is off", async () => {
    const fixture = await createBundledFixture();
    const presenter = await createPluginPresenter("darwin", {
      appPath: fixture.appPath,
      mcpEnabled: false,
    });

    const result = await presenter.enablePlugin(fixture.pluginId);

    expect(result.ok).toBe(true);
    expect(presenter.__mocks.mcpPresenter.startServer).toHaveBeenCalledWith("fixture-runtime");
  });

  it("declares the CUA embedded adapter runtime with helper detect preference", async () => {
    const manifest = JSON.parse(await readRepoFile("plugins/cua/plugin.json"));
    const mcpConfig = JSON.parse(await readRepoFile("plugins/cua/mcp/cua-driver.json"));
    const server = manifest.mcpServers.find((item: { id: string }) => item.id === "cua-driver");

    expect(manifest.runtime.adapter).toBe("cua-embedded-v1");
    expect(manifest.runtime.adapterContract).toMatchObject({
      hostBundleId: "com.wefonk.argos.computeruse",
      driverVersion: "0.19.2",
      contractVersion: "0.6.0",
      mcpProtocolVersion: "2025-06-18",
    });
    expect(manifest.runtime.integrityDescriptor).toBe("runtime/${target.platform}/${arch}/integrity.json");
    expect(manifest.runtime.detect[0]).toBe("app-helper:Argos Computer Use.app/Contents/MacOS/argos-cua-driver");
    expect(manifest.runtime.detect).toEqual([
      "app-helper:Argos Computer Use.app/Contents/MacOS/argos-cua-driver",
      "plugin:runtime/darwin/${arch}/Argos Computer Use.app/Contents/MacOS/argos-cua-driver",
      "plugin:runtime/win32/${arch}/cua-driver.exe",
      "plugin:runtime/linux/${arch}/cua-driver",
    ]);
    expect(server.args).toEqual(["mcp", "--embedded"]);
    expect(server.startMode).toBe("onDemand");
    expect(server.surfaces).toEqual(["tools"]);
    expect(server.inheritEnv).toBe("minimal");
    expect(server.env).toBeUndefined();
    expect(mcpConfig).toEqual(server);
  });

  it("keeps destructive CUA tools denied and actions permission-gated", async () => {
    const manifest = JSON.parse(await readRepoFile("plugins/cua/plugin.json"));
    const policy = JSON.parse(await readRepoFile("plugins/cua/policies/tool-policy.json", "utf8"));
    const manifestTools = manifest.toolPolicies.find(
      (item: { serverId: string }) => item.serverId === "cua-driver",
    ).tools;

    expect(manifestTools.click).toBe("ask");
    expect(manifestTools.type_text).toBe("ask");
    expect(manifestTools.set_agent_cursor_theme).toBe("ask");
    expect(manifestTools.kill_app).toBe("deny");
    expect(manifestTools.clipboard_read).toBe("deny");
    expect(manifestTools.mouse_drag).toBe("deny");
    expect(manifestTools.verify_state).toBe("allow");
    expect(manifestTools.check_permissions).toBe("allow");
    expect(policy.tools).toEqual(manifestTools);
  });

  it("pins the CUA runtime to a checksum-verified upstream Rust release", async () => {
    const metadata = JSON.parse(await readRepoFile("plugins/cua/vendor/cua-driver/upstream.json"));
    const buildScript = await readRepoFile("scripts/build-cua-plugin-runtime.mjs");

    expect(metadata).toMatchObject({
      sourceKind: "upstream-release",
      upstreamRepo: "https://github.com/trycua/cua.git",
      upstreamSubdir: "libs/cua-driver/rust",
      tag: "cua-driver-rs-v0.19.2",
      version: "0.19.2",
    });
    expect(metadata.checksumsSha256).toMatch(/^[a-f0-9]{64}$/);
    for (const asset of Object.values<any>(metadata.assets)) {
      expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(buildScript).toContain("verifyPinnedChecksum");
    expect(buildScript).toContain("verifyChecksum");
    expect(buildScript).toContain("writeCuaRuntimeIntegrityDescriptor");
    expect(buildScript).toContain("dump-docs");
  });

  it("keeps the CUA skill instructions tool-first", async () => {
    const files = ["SKILL.md", "README.md", "WEB_APPS.md", "RECORDING.md", "TESTS.md"];
    const contents = await Promise.all(files.map((file) => readRepoFile(`plugins/cua/skills/computer-use/${file}`)));
    const combined = contents.join("\n");

    expect(combined).toContain("list_apps");
    expect(combined).toContain("launch_app");
    expect(combined).toContain("get_window_state");
    expect(combined).toContain("verify_state");
    expect(combined).toContain("check_permissions");
    expect(combined).toContain("Argos Computer Use.app");
    expect(combined).toContain("${PLUGIN_ROOT}");
    expect(combined).toContain("${OWNER_PLUGIN_ID}");
    expect(combined).not.toContain("DeepChat");
    expect(combined).not.toContain("deepchat");
  });

  it("uses the driver permission tool flow for embedded runtime checks", async () => {
    const presenterSource = await readFile("src/main/presenter/pluginPresenter/index.ts", "utf8");

    expect(presenterSource).toContain("checkAdapterRuntimePermissions");
    expect(presenterSource).toContain('ensureRunning(serverName, "runtime-test")');
    expect(presenterSource).toContain("check_permissions");
  });

  it("keeps CUA plugin packaging aligned with the multi-arch bundle flow", async () => {
    const packageJson = JSON.parse(await readRepoFile("package.json"));
    const packageScript = await readRepoFile("scripts/package-plugin.mjs");

    expect(packageJson.scripts["plugin:cua:build:mac:x64"]).toContain("--arch x64");
    expect(packageJson.scripts["build:mac:arm64"]).toContain("plugin:bundle -- --name cua --platform darwin");
    expect(packageScript).toContain("parts[0] === 'runtime'");
    expect(packageScript).toContain("parts[2] !== args.targetArch");
  });
});
