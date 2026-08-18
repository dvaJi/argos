import { homedir, tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import matter from "gray-matter";
import { SkillPresenter, type SkillHostPorts } from "@argos/skills-runtime";
import type { SkillMetadata } from "@argos/shared/types/skill";
import type { IEventPublisher } from "@argos/backend-core";

type SessionRepositoryPort = {
  get(sessionId: string): Promise<{ id: string } | null>;
};

type StoredSkillSessionState = {
  activeSkills: string[];
  updatedAt: number;
};

class DaemonSkillSessionStateStore {
  private cache: Map<string, StoredSkillSessionState> | null = null;

  constructor(private readonly filePath: string) {}

  getSkills(conversationId: string): string[] {
    return [...(this.load().get(conversationId)?.activeSkills ?? [])];
  }

  setSkills(conversationId: string, skills: string[]): void {
    const normalized = Array.from(new Set(skills.map((skill) => skill.trim()).filter(Boolean)));
    this.load().set(conversationId, { activeSkills: normalized, updatedAt: Date.now() });
    this.save();
  }

  private load(): Map<string, StoredSkillSessionState> {
    if (this.cache) {
      return this.cache;
    }

    this.cache = new Map();
    if (!fs.existsSync(this.filePath)) {
      return this.cache;
    }

    try {
      // bun-file-io-exception: sync StoreLike-style port consumed synchronously by SkillPresenter.
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf-8")) as Record<
        string,
        StoredSkillSessionState | string[]
      >;
      for (const [conversationId, value] of Object.entries(parsed)) {
        if (Array.isArray(value)) {
          this.cache.set(conversationId, {
            activeSkills: value.map((skill) => skill.trim()).filter(Boolean),
            updatedAt: Date.now(),
          });
          continue;
        }

        this.cache.set(conversationId, {
          activeSkills: Array.isArray(value.activeSkills)
            ? value.activeSkills.map((skill) => skill.trim()).filter(Boolean)
            : [],
          updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : Date.now(),
        });
      }
    } catch (error) {
      console.warn(`[SkillPresenter] Failed to read daemon skill session state at ${this.filePath}:`, error);
      this.cache = new Map();
    }

    return this.cache;
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const payload: Record<string, StoredSkillSessionState> = {};
    for (const [conversationId, value] of this.load()) {
      payload[conversationId] = value;
    }
    // bun-file-io-exception: sync StoreLike-style port consumed synchronously by SkillPresenter.
    fs.writeFileSync(this.filePath, JSON.stringify(payload, null, 2));
  }
}

/** Inline skill discovery (no worker thread) — scans for SKILL.md frontmatter. */
async function discoverSkillsInline(input: {
  skillsDir: string;
  sidecarDirName: string;
  maxDepth: number;
}): Promise<{ skills: SkillMetadata[]; warnings: unknown[] }> {
  const skills: SkillMetadata[] = [];
  const warnings: unknown[] = [];
  if (!fs.existsSync(input.skillsDir)) return { skills, warnings };

  const walk = async (dir: string, depth: number) => {
    if (depth > input.maxDepth) return;
    let entries: string[];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        const skillMd = path.join(fullPath, "SKILL.md");
        if (fs.existsSync(skillMd)) {
          try {
            const parsed = matter(await Bun.file(skillMd).text());
            skills.push({
              name: entry,
              description: String(parsed.data.description ?? parsed.content.slice(0, 120) ?? ""),
              path: skillMd,
              skillRoot: fullPath,
              source: "global",
              sourceLabel: "Argos",
              allowedTools: Array.isArray(parsed.data.allowedTools) ? parsed.data.allowedTools : undefined,
              metadata: parsed.data.metadata,
              platforms: Array.isArray(parsed.data.platforms) ? parsed.data.platforms : undefined,
            });
          } catch (error) {
            warnings.push({ path: skillMd, error: String(error) });
          }
        } else {
          await walk(fullPath, depth + 1);
        }
      }
    }
  };

  await walk(input.skillsDir, 0);
  return { skills, warnings };
}

/**
 * Daemon skill runtime. Owns the shared `SkillPresenter` with daemon host ports
 * (OS paths, event-publisher bridge, inline discovery, no shell open).
 */
export class DaemonSkillRuntime {
  readonly presenter: SkillPresenter;

  constructor(deps: {
    dataDir: string;
    appVersion: string;
    eventPublisher: IEventPublisher;
    configPresenter: unknown;
    sessionRepository: SessionRepositoryPort;
  }) {
    const stateStore = new DaemonSkillSessionStateStore(path.join(deps.dataDir, "skill-session-state.json"));
    const ports: SkillHostPorts = {
      paths: {
        tempDir: () => tmpdir(),
        homeDir: () => homedir(),
        bundledSkillRoots: () => [],
      },
      events: {
        broadcast: (channel, payload) => deps.eventPublisher.publish(channel, payload),
        publish: (eventName, payload) => deps.eventPublisher.publish(eventName, payload),
      },
      services: {
        discoverMetadata: discoverSkillsInline,
      },
    };
    this.presenter = new SkillPresenter(
      deps.configPresenter as never,
      {
        hasNewSession: async (conversationId: string) => Boolean(await deps.sessionRepository.get(conversationId)),
        getPersistedNewSessionSkills: (conversationId: string) => stateStore.getSkills(conversationId),
        setPersistedNewSessionSkills: (conversationId: string, skills: string[]) =>
          stateStore.setSkills(conversationId, skills),
        repairImportedLegacySessionSkills: async (conversationId: string) =>
          (await deps.sessionRepository.get(conversationId)) ? stateStore.getSkills(conversationId) : [],
      },
      ports,
    );
  }
}
