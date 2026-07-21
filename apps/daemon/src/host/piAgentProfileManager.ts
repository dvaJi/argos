import fs from "node:fs";
import path from "node:path";

export type PiPackageEntry =
  | string
  | {
      source: string;
      extensions?: string[];
      skills?: string[];
      prompts?: string[];
      themes?: string[];
    };

export interface PiAgentSettings {
  packages?: PiPackageEntry[];
  extensions?: string[];
  skills?: string[];
  prompts?: string[];
  defaultProvider?: string;
  defaultModel?: string;
  defaultThinkingLevel?: string;
  defaultProjectTrust?: "ask" | "always" | "never";
  enableInstallTelemetry?: boolean;
  enableAnalytics?: boolean;
  compaction?: {
    enabled?: boolean;
    reserveTokens?: number;
    keepRecentTokens?: number;
  };
  retry?: {
    enabled?: boolean;
    maxRetries?: number;
    baseDelayMs?: number;
  };
  trustedProjects?: string[];
  appliedArgosDefaults?: string[];
  [key: string]: unknown;
}

const FFF_PACKAGE = "@ff-labs/pi-fff";
const FFF_DEFAULT_ID = "pi-fff-v1";

const normalizeAgentId = (agentId: string): string => {
  const normalized = agentId
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!normalized) {
    throw new Error("A valid agent id is required for the Pi profile.");
  }
  return normalized;
};

const packageSource = (entry: PiPackageEntry): string => (typeof entry === "string" ? entry : entry.source);

/**
 * Owns the filesystem profile used by Pi for one Argos agent. Keeping this
 * concern outside the chat runtime makes package/settings management usable
 * even when the agent has no active session.
 */
export class PiAgentProfileManager {
  constructor(private readonly dataDir: string) {}

  getProfileDir(agentId: string): string {
    return path.join(this.dataDir, "agents", normalizeAgentId(agentId), "pi");
  }

  getSettingsPath(agentId: string): string {
    return path.join(this.getProfileDir(agentId), "settings.json");
  }

  getSessionDir(agentId: string): string {
    return path.join(this.getProfileDir(agentId), "sessions");
  }

  ensureProfile(agentId: string): string {
    const profileDir = this.getProfileDir(agentId);
    for (const child of ["extensions", "skills", "prompts", "npm", "git", "sessions"]) {
      fs.mkdirSync(path.join(profileDir, child), { recursive: true });
    }

    const settingsPath = this.getSettingsPath(agentId);
    if (!fs.existsSync(settingsPath)) {
      this.writeSettings(agentId, {
        packages: [],
        defaultProjectTrust: "ask",
        enableInstallTelemetry: false,
        enableAnalytics: false,
        compaction: { enabled: true },
        retry: { enabled: true, maxRetries: 3, baseDelayMs: 2000 },
      });
    }
    this.applyArgosDefaults(agentId);
    return profileDir;
  }

  readSettings(agentId: string): PiAgentSettings {
    this.ensureProfileDirectories(agentId);
    const settingsPath = this.getSettingsPath(agentId);
    if (!fs.existsSync(settingsPath)) return {};
    try {
      const value = JSON.parse(fs.readFileSync(settingsPath, "utf8")) as unknown;
      return value && typeof value === "object" && !Array.isArray(value) ? (value as PiAgentSettings) : {};
    } catch (error) {
      throw new Error(`Unable to read Pi settings for agent ${agentId}: ${String(error)}`);
    }
  }

  writeSettings(agentId: string, settings: PiAgentSettings): void {
    this.ensureProfileDirectories(agentId);
    const settingsPath = this.getSettingsPath(agentId);
    const temporaryPath = `${settingsPath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
    fs.renameSync(temporaryPath, settingsPath);
  }

  listPackages(agentId: string): PiPackageEntry[] {
    this.ensureProfile(agentId);
    const packages = this.readSettings(agentId).packages;
    return Array.isArray(packages) ? packages : [];
  }

  installPackage(agentId: string, entry: PiPackageEntry): PiPackageEntry[] {
    this.ensureProfile(agentId);
    const source = packageSource(entry).trim();
    if (!source) throw new Error("A Pi package source is required.");
    const settings = this.readSettings(agentId);
    const current = Array.isArray(settings.packages) ? settings.packages : [];
    const next = [...current.filter((item) => packageSource(item) !== source), entry];
    this.writeSettings(agentId, { ...settings, packages: next });
    return next;
  }

  removePackage(agentId: string, source: string): PiPackageEntry[] {
    this.ensureProfile(agentId);
    const settings = this.readSettings(agentId);
    const current = Array.isArray(settings.packages) ? settings.packages : [];
    const next = current.filter((item) => packageSource(item) !== source);
    this.writeSettings(agentId, { ...settings, packages: next });
    return next;
  }

  isProjectTrusted(agentId: string, projectDir: string): boolean {
    const target = path.resolve(projectDir);
    const trusted = this.readSettings(agentId).trustedProjects;
    return Array.isArray(trusted) && trusted.includes(target);
  }

  setProjectTrusted(agentId: string, projectDir: string, value: boolean): boolean {
    const target = path.resolve(projectDir);
    const settings = this.readSettings(agentId);
    const current = Array.isArray(settings.trustedProjects) ? settings.trustedProjects : [];
    const trustedProjects = value
      ? Array.from(new Set([...current, target]))
      : current.filter((item) => item !== target);
    this.writeSettings(agentId, { ...settings, trustedProjects });
    return trustedProjects.includes(target);
  }

  async searchPackages(query: string): Promise<
    Array<{
      name: string;
      version: string;
      description: string;
      publisher?: string;
      updatedAt?: string;
      npmUrl: string;
    }>
  > {
    const terms = ["keywords:pi-package", query.trim()].filter(Boolean).join(" ");
    const url = new URL("https://registry.npmjs.org/-/v1/search");
    url.searchParams.set("text", terms);
    url.searchParams.set("size", "30");
    const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`npm package search failed (${response.status})`);
    const body = (await response.json()) as { objects?: Array<{ package?: Record<string, any> }> };
    return (body.objects ?? [])
      .map((item) => item.package ?? {})
      .filter((item) => typeof item.name === "string")
      .map((item) => ({
        name: String(item.name),
        version: String(item.version ?? ""),
        description: String(item.description ?? ""),
        publisher: typeof item.publisher?.username === "string" ? item.publisher.username : undefined,
        updatedAt: typeof item.date === "string" ? item.date : undefined,
        npmUrl: `https://www.npmjs.com/package/${encodeURIComponent(String(item.name))}`,
      }));
  }

  private ensureProfileDirectories(agentId: string): void {
    fs.mkdirSync(this.getProfileDir(agentId), { recursive: true });
  }

  private applyArgosDefaults(agentId: string): void {
    const settings = this.readSettings(agentId);
    const applied = Array.isArray(settings.appliedArgosDefaults) ? settings.appliedArgosDefaults : [];
    if (applied.includes(FFF_DEFAULT_ID)) return;
    const packages = Array.isArray(settings.packages) ? settings.packages : [];
    const nextPackages = packages.some((entry) => packageSource(entry) === FFF_PACKAGE)
      ? packages
      : [...packages, FFF_PACKAGE];
    this.writeSettings(agentId, {
      ...settings,
      packages: nextPackages,
      appliedArgosDefaults: [...applied, FFF_DEFAULT_ID],
    });
  }
}
