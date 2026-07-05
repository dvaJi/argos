import { homedir, tmpdir } from "node:os";
import path from "node:path";
import fs from "node:fs";
import matter from "gray-matter";
import { SkillPresenter, type SkillHostPorts } from "@argos/skills-runtime";
import type { SkillMetadata } from "@shared/types/skill";
import type { IEventPublisher } from "@argos/backend-core";

/** Minimal in-memory session-state port (daemon v1 has no session-skill persistence). */
const daemonSessionStatePort = {
  hasNewSession: async () => false,
  getPersistedNewSessionSkills: () => [],
  setPersistedNewSessionSkills: () => {},
  repairImportedLegacySessionSkills: async () => [],
};

/** Inline skill discovery (no worker thread) — scans for SKILL.md frontmatter. */
function discoverSkillsInline(input: {
  skillsDir: string;
  sidecarDirName: string;
  maxDepth: number;
}): Promise<{ skills: SkillMetadata[]; warnings: unknown[] }> {
  const skills: SkillMetadata[] = [];
  const warnings: unknown[] = [];
  if (!fs.existsSync(input.skillsDir)) return Promise.resolve({ skills, warnings });

  const walk = (dir: string, depth: number) => {
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
            const raw = fs.readFileSync(skillMd, "utf-8");
            const parsed = matter(raw);
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
          walk(fullPath, depth + 1);
        }
      }
    }
  };

  walk(input.skillsDir, 0);
  return Promise.resolve({ skills, warnings });
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
  }) {
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
    this.presenter = new SkillPresenter(deps.configPresenter as never, daemonSessionStatePort as never, ports);
  }
}
