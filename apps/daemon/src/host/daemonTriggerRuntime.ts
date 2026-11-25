import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import type { Database as BunDatabase } from "bun:sqlite";
import type { IEventPublisher, ProviderExecutionPort, SessionRepository } from "@argos/backend-core";
import type { CreateSessionInput } from "@argos/shared/types/agent-interface";
import type { TriggerRecord, TriggerTrust, TriggerType, TriggerUpsertInput } from "@argos/shared/triggers";
import { triggersUpdatedEvent } from "@argos/shared-contracts/events/triggers.events";
import { watch, type FSWatcher } from "chokidar";

interface TriggerRow {
  id: string;
  name: string;
  type: TriggerType;
  config_json: string;
  prompt: string;
  agent_id: string;
  session_id: string | null;
  trust: TriggerTrust;
  enabled: number;
  secret: string | null;
  last_run_at: number | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

type TriggerSessionPort = SessionRepository & {
  setRestricted?(sessionId: string, enabled: boolean): Promise<void>;
  queuePendingInput?(sessionId: string, input: { text: string }): Promise<unknown>;
};

export class DaemonTriggerRuntime {
  private readonly watchers = new Map<string, FSWatcher>();
  private stopped = false;

  constructor(
    private readonly deps: {
      db: BunDatabase;
      eventPublisher: IEventPublisher;
      sessionRepository: TriggerSessionPort;
      providerExecutionPort: Pick<
        ProviderExecutionPort,
        "sendMessage" | "getActiveGeneration"
      >;
    },
  ) {
    this.ensureSchema();
  }

  private ensureSchema(): void {
    this.deps.db.exec(`
      CREATE TABLE IF NOT EXISTS argos_triggers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        config_json TEXT NOT NULL,
        prompt TEXT NOT NULL,
        agent_id TEXT NOT NULL DEFAULT 'argos',
        session_id TEXT,
        trust TEXT NOT NULL DEFAULT 'outside',
        enabled INTEGER NOT NULL DEFAULT 1,
        secret TEXT,
        last_run_at INTEGER,
        last_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  }

  start(): void {
    this.stopped = false;
    this.reconcileWatchers();
  }

  stop(): void {
    this.stopped = true;
    for (const watcher of this.watchers.values()) void watcher.close();
    this.watchers.clear();
  }

  list(): TriggerRecord[] {
    const rows = this.deps.db.prepare("SELECT * FROM argos_triggers ORDER BY created_at DESC").all() as TriggerRow[];
    return rows.map((row) => this.toRecord(row));
  }

  upsert(input: TriggerUpsertInput): TriggerRecord {
    const now = Date.now();
    const existing = input.id
      ? (this.deps.db.prepare("SELECT * FROM argos_triggers WHERE id = ?").get(input.id) as TriggerRow | undefined)
      : undefined;
    if (input.type === "folder") {
      const folder = input.config.path?.trim();
      if (!folder) throw new Error("A folder trigger needs a path.");
      if (!existsSync(folder) || !statSync(folder).isDirectory()) {
        throw new Error(`Folder does not exist: ${folder}`);
      }
    }
    const id = existing?.id ?? input.id ?? randomUUID();
    const secret = existing?.secret ?? (input.type === "webhook" ? randomBytes(24).toString("hex") : null);
    const row: TriggerRow = {
      id,
      name: input.name.trim(),
      type: input.type,
      config_json: JSON.stringify(input.config ?? {}),
      prompt: input.prompt,
      agent_id: input.agentId,
      session_id: input.sessionId ?? null,
      trust: input.trust ?? existing?.trust ?? "outside",
      enabled: input.enabled === false ? 0 : 1,
      secret,
      last_run_at: existing?.last_run_at ?? null,
      last_error: existing?.last_error ?? null,
      created_at: existing?.created_at ?? now,
      updated_at: now,
    };
    this.deps.db
      .prepare(
        `INSERT INTO argos_triggers
         (id, name, type, config_json, prompt, agent_id, session_id, trust, enabled, secret, last_run_at, last_error, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name, type = excluded.type, config_json = excluded.config_json, prompt = excluded.prompt,
           agent_id = excluded.agent_id, session_id = excluded.session_id, trust = excluded.trust,
           enabled = excluded.enabled, secret = excluded.secret, updated_at = excluded.updated_at`,
      )
      .run(
        row.id,
        row.name,
        row.type,
        row.config_json,
        row.prompt,
        row.agent_id,
        row.session_id,
        row.trust,
        row.enabled,
        row.secret,
        row.last_run_at,
        row.last_error,
        row.created_at,
        row.updated_at,
      );
    const existingWatcher = this.watchers.get(row.id);
    if (existingWatcher) {
      void existingWatcher.close();
      this.watchers.delete(row.id);
    }
    this.publish(row.id);
    this.reconcileWatchers();
    return this.toRecord(row);
  }

  remove(id: string): boolean {
    const result = this.deps.db.prepare("DELETE FROM argos_triggers WHERE id = ?").run(id);
    if (result.changes > 0) {
      this.publish(id);
      this.reconcileWatchers();
    }
    return result.changes > 0;
  }

  toggle(id: string, enabled: boolean): TriggerRecord {
    const row = this.getRow(id);
    if (!row) throw new Error(`Unknown trigger: ${id}`);
    this.deps.db
      .prepare("UPDATE argos_triggers SET enabled = ?, updated_at = ? WHERE id = ?")
      .run(enabled ? 1 : 0, Date.now(), id);
    this.publish(id);
    this.reconcileWatchers();
    return this.toRecord(this.getRow(id)!);
  }

  async handleWebhook(id: string, request: Request): Promise<Response> {
    const row = this.getRow(id);
    if (!row || !row.enabled || row.type !== "webhook") {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    if (!this.verifySecret(request, row.secret)) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
    const text = await request.text();
    if (text.length > 1024 * 1024) {
      return Response.json({ error: "body_too_large" }, { status: 413 });
    }
    let payload: unknown = text;
    try {
      payload = JSON.parse(text);
    } catch {
      // Keep the raw text.
    }
    void this.run(row, payload);
    return Response.json({ accepted: true }, { status: 202 });
  }

  private verifySecret(request: Request, secret: string | null): boolean {
    if (!secret) return false;
    const header = request.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    const a = Buffer.from(token);
    const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  private async run(row: TriggerRow, payload: unknown): Promise<void> {
    const text = [
      row.prompt,
      "",
      `Trigger: ${row.name}`,
      "Payload:",
      typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
    ].join("\n");
    try {
      let sessionId = row.session_id;
      if (sessionId) {
        if (row.trust === "outside") await this.deps.sessionRepository.setRestricted?.(sessionId, true);
      } else {
        const input: CreateSessionInput = {
          agentId: row.agent_id,
          message: "",
          restricted: row.trust === "outside",
        };
        const session = await this.deps.sessionRepository.create(input, -1);
        sessionId = session.id;
      }
      const active = this.deps.providerExecutionPort.getActiveGeneration?.(sessionId);
      if (active && this.deps.sessionRepository.queuePendingInput) {
        await this.deps.sessionRepository.queuePendingInput(sessionId, { text });
      } else {
        await this.deps.providerExecutionPort.sendMessage(sessionId, {
          text,
          provenance: {
            trust: row.trust === "outside" ? "untrusted" : "owner",
            runKind: "event",
          },
        });
      }
      this.setStatus(row.id, { last_run_at: Date.now(), last_error: null });
    } catch (error) {
      this.setStatus(row.id, {
        last_run_at: Date.now(),
        last_error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private setStatus(id: string, patch: { last_run_at: number; last_error: string | null }): void {
    this.deps.db
      .prepare("UPDATE argos_triggers SET last_run_at = ?, last_error = ?, updated_at = ? WHERE id = ?")
      .run(patch.last_run_at, patch.last_error, Date.now(), id);
    this.publish(id);
  }

  private reconcileWatchers(): void {
    if (this.stopped) return;
    const rows = this.deps.db
      .prepare("SELECT * FROM argos_triggers WHERE type = 'folder' AND enabled = 1")
      .all() as TriggerRow[];
    const wanted = new Set(rows.map((row) => row.id));
    for (const [id, watcher] of this.watchers) {
      if (!wanted.has(id)) {
        void watcher.close();
        this.watchers.delete(id);
      }
    }
    for (const row of rows) {
      if (this.watchers.has(row.id)) continue;
      const config = JSON.parse(row.config_json) as { path?: string; pattern?: string };
      if (!config.path) continue;
      const watcher = watch(config.path, {
        ignoreInitial: true,
        followSymlinks: false,
        awaitWriteFinish: { stabilityThreshold: 250, pollInterval: 100 },
      });
      watcher.on("add", (filePath) => {
        if (config.pattern && !matchesPattern(path.basename(filePath), config.pattern)) return;
        void this.run(row, { kind: "file", path: path.resolve(filePath), name: path.basename(filePath) });
      });
      watcher.on("error", (error) => {
        this.setStatus(row.id, {
          last_run_at: row.last_run_at ?? Date.now(),
          last_error: error instanceof Error ? error.message : String(error),
        });
      });
      this.watchers.set(row.id, watcher);
    }
  }

  private getRow(id: string): TriggerRow | undefined {
    return this.deps.db.prepare("SELECT * FROM argos_triggers WHERE id = ?").get(id) as TriggerRow | undefined;
  }

  private toRecord(row: TriggerRow): TriggerRecord {
    const config = JSON.parse(row.config_json) as { path?: string; pattern?: string };
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      config,
      prompt: row.prompt,
      agentId: row.agent_id,
      sessionId: row.session_id,
      trust: row.trust,
      enabled: row.enabled === 1,
      webhookPath: row.type === "webhook" ? `/api/v1/hooks/${row.id}` : null,
      secret: row.secret,
      lastRunAt: row.last_run_at,
      lastError: row.last_error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private publish(id: string): void {
    this.deps.eventPublisher.publish(triggersUpdatedEvent.name, { triggerId: id, version: Date.now() });
  }
}

function matchesPattern(name: string, pattern: string): boolean {
  if (pattern.includes("*")) {
    const suffix = pattern.slice(pattern.indexOf("*") + 1);
    return name.endsWith(suffix);
  }
  return name === pattern;
}
