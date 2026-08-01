import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

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

export interface ManagedAgentSkillRecord {
  name: string;
  sha256: string;
  managedVersion: string;
  installedAt: number;
  updatedAt: number;
}

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
  constructor(
    private readonly dataDir: string,
    private readonly appVersion = "dev",
  ) {}

  getProfileDir(agentId: string): string {
    return path.join(this.dataDir, "agents", normalizeAgentId(agentId), "pi");
  }

  getSettingsPath(agentId: string): string {
    return path.join(this.getProfileDir(agentId), "settings.json");
  }

  getSessionDir(agentId: string): string {
    return path.join(this.getProfileDir(agentId), "sessions");
  }

  getManagedSkillsDir(agentId: string): string {
    return path.join(this.getProfileDir(agentId), ".argos", "skills");
  }

  getManagedSkillsRegistryPath(agentId: string): string {
    return path.join(this.getProfileDir(agentId), ".argos", "skills-registry.json");
  }

  ensureProfile(agentId: string): string {
    const profileDir = this.getProfileDir(agentId);
    for (const child of ["extensions", "skills", "prompts", "npm", "git", "sessions"]) {
      fs.mkdirSync(path.join(profileDir, child), { recursive: true });
    }
    fs.mkdirSync(this.getManagedSkillsDir(agentId), { recursive: true });

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
    this.registerManagedSkillsLocation(agentId);
    return profileDir;
  }

  listManagedSkills(agentId: string): ManagedAgentSkillRecord[] {
    this.ensureProfile(agentId);
    return this.readManagedSkillsRegistry(agentId);
  }

  validateManagedSkills(agentId: string): Array<ManagedAgentSkillRecord & { exists: boolean; hashMatches: boolean }> {
    this.ensureProfile(agentId);
    return this.readManagedSkillsRegistry(agentId).map((record) => {
      const skillPath = path.join(this.getManagedSkillsDir(agentId), record.name, "SKILL.md");
      const exists = fs.existsSync(skillPath) && fs.statSync(skillPath).isFile();
      const sha256 = exists ? createHash("sha256").update(fs.readFileSync(skillPath)).digest("hex") : "";
      return { ...record, exists, hashMatches: exists && sha256 === record.sha256 };
    });
  }

  writeManagedSkill(
    agentId: string,
    input: { name: string; description: string; instructions: string },
  ): ManagedAgentSkillRecord {
    this.ensureProfile(agentId);
    const name = this.normalizeSkillName(input.name);
    const description = input.description.trim();
    const instructions = input.instructions.trim();
    if (!description) throw new Error("A managed skill description is required.");
    if (!instructions) throw new Error("Managed skill instructions are required.");

    const content = `---\nname: ${name}\ndescription: ${JSON.stringify(description.replace(/\r?\n/g, " "))}\n---\n\n${instructions}\n`;
    const sha256 = createHash("sha256").update(content).digest("hex");
    const skillDir = path.join(this.getManagedSkillsDir(agentId), name);
    fs.mkdirSync(skillDir, { recursive: true });
    const skillPath = path.join(skillDir, "SKILL.md");
    const temporaryPath = `${skillPath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporaryPath, content, "utf8");
    this.atomicRename(temporaryPath, skillPath);

    const now = Date.now();
    const registry = this.readManagedSkillsRegistry(agentId);
    const existing = registry.find((entry) => entry.name === name);
    const record: ManagedAgentSkillRecord = {
      name,
      sha256,
      managedVersion: this.appVersion,
      installedAt: existing?.installedAt ?? now,
      updatedAt: now,
    };
    this.writeManagedSkillsRegistry(agentId, [...registry.filter((entry) => entry.name !== name), record]);
    return record;
  }

  removeManagedSkill(agentId: string, requestedName: string): boolean {
    this.ensureProfile(agentId);
    const name = this.normalizeSkillName(requestedName);
    const skillsRoot = path.resolve(this.getManagedSkillsDir(agentId));
    const skillDir = path.resolve(skillsRoot, name);
    if (path.dirname(skillDir) !== skillsRoot) throw new Error("Managed skill path escaped its root.");
    const existed = fs.existsSync(skillDir);
    if (existed) fs.rmSync(skillDir, { recursive: true, force: true });
    const registry = this.readManagedSkillsRegistry(agentId).filter((entry) => entry.name !== name);
    this.writeManagedSkillsRegistry(agentId, registry);
    return existed;
  }

  removeProfile(agentId: string): boolean {
    const profileRoot = path.resolve(path.join(this.dataDir, "agents"));
    const profileDir = path.resolve(this.getProfileDir(agentId));
    if (path.dirname(path.dirname(profileDir)) !== profileRoot) throw new Error("Agent profile path escaped its root.");
    const existed = fs.existsSync(profileDir);
    if (existed) fs.rmSync(profileDir, { recursive: true, force: true });
    return existed;
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

  private registerManagedSkillsLocation(agentId: string): void {
    const managedSkillsDir = this.getManagedSkillsDir(agentId);
    const settings = this.readSettings(agentId);
    const skills = Array.isArray(settings.skills) ? settings.skills : [];
    if (skills.includes(managedSkillsDir)) return;
    this.writeSettings(agentId, { ...settings, skills: [...skills, managedSkillsDir] });
  }

  private normalizeSkillName(value: string): string {
    const name = value.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) {
      throw new Error("Skill names must be 1-64 lowercase letters, numbers, or hyphen-separated words.");
    }
    return name;
  }

  /**
   * Atomic-rename with a Windows fallback: POSIX rename atomically replaces an
   * existing destination, but on Windows rename fails when the target exists, so
   * remove the target and retry. Keeps updates portable across platforms.
   */
  private atomicRename(temporaryPath: string, targetPath: string): void {
    try {
      fs.renameSync(temporaryPath, targetPath);
    } catch {
      fs.rmSync(targetPath, { force: true });
      fs.renameSync(temporaryPath, targetPath);
    }
  }

  private readManagedSkillsRegistry(agentId: string): ManagedAgentSkillRecord[] {
    const registryPath = this.getManagedSkillsRegistryPath(agentId);
    if (!fs.existsSync(registryPath)) return [];
    try {
      const parsed = JSON.parse(fs.readFileSync(registryPath, "utf8")) as { skills?: ManagedAgentSkillRecord[] };
      return Array.isArray(parsed.skills) ? parsed.skills : [];
    } catch (error) {
      // A corrupt registry must not be silently treated as empty: that would let
      // subsequent writes overwrite integrity records and lose track of skills.
      throw new Error(
        `Managed skills registry for agent ${agentId} is corrupt and could not be parsed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  private writeManagedSkillsRegistry(agentId: string, skills: ManagedAgentSkillRecord[]): void {
    const registryPath = this.getManagedSkillsRegistryPath(agentId);
    fs.mkdirSync(path.dirname(registryPath), { recursive: true });
    const temporaryPath = `${registryPath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify({ version: 1, skills }, null, 2)}\n`, "utf8");
    this.atomicRename(temporaryPath, registryPath);
  }
}
