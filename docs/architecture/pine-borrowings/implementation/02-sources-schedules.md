# 02 — Sources and Schedules

This adds the first external inputs: a source contract, a daemon supervisor, six adapters, a webhook ingress, secret handling, and cron schedules. The output of this stage is an event in the log, not yet an agent turn.

> **v1 scope:** [../fit-for-argos.md](../fit-for-argos.md) keeps **folder**, **webhook**, and **schedules**. The HTTP/feed/command/calendar adapters remain reference designs until a user story requires them.

## 1. Source contract

Add `packages/automation-runtime/src/sources/types.ts`:

```ts
import type { z } from "zod";
import type { EventTrust, SourceStatus } from "../types";

export interface SourceEmitInput {
  type: string;
  payload: unknown;
  dedupeKey?: string;
  replyTo?: string;
}

export interface SourceContext {
  readonly sourceId: string;
  readonly sourceName: string;
  readonly dataDir: string;
  readonly allowedRoots: readonly string[];
  readonly signal: AbortSignal;
  readonly now: () => number;
  readonly emit: (input: SourceEmitInput) => void;
  readonly setStatus: (patch: Partial<SourceStatus>) => void;
  readonly log: (level: "debug" | "info" | "warn" | "error", message: string) => void;
  readonly secret: (ref: string) => Promise<string | undefined>;
  readonly isPathAllowed: (path: string) => boolean;
}

export interface SourceInstance {
  start(): Promise<void>;
  stop(): Promise<void>;
  send?: (input: unknown) => Promise<void>;
}

export interface SourceDefinition<TOptions = unknown> {
  type: string;
  description: string;
  optionsSchema: z.ZodType<TOptions>;
  eventTypeSchema: z.ZodType<string>;
  sendSchema?: z.ZodType<unknown>;
  create(options: TOptions, ctx: SourceContext): SourceInstance;
}
```

`dev/README.md` rule: the adapter reports facts; it never decides trust, never writes SQL, never calls a model.

## 2. Registry

`packages/automation-runtime/src/sources/registry.ts`:

```ts
import type { SourceDefinition } from "./types";

export class SourceTypeRegistry {
  private readonly definitions = new Map<string, SourceDefinition>();

  register(definition: SourceDefinition): void {
    if (this.definitions.has(definition.type)) throw new Error(`Duplicate source type: ${definition.type}`);
    this.definitions.set(definition.type, definition);
  }

  get(type: string): SourceDefinition | undefined {
    return this.definitions.get(type);
  }

  list(): SourceDefinition[] {
    return [...this.definitions.values()];
  }

  parseOptions(type: string, options: unknown): unknown {
    const definition = this.get(type);
    if (!definition) throw new Error(`Unknown source type: ${type}`);
    return definition.optionsSchema.parse(options);
  }
}
```

Register built-ins in `packages/automation-runtime/src/sources/index.ts`. The daemon constructs one registry at startup and passes it to the supervisor.

## 3. Supervisor

`apps/daemon/src/host/daemonSourceSupervisor.ts`:

```ts
import type { IEventPublisher } from "@argos/backend-core";
import type { AutomationEvent, SourceDefinition, SourceInstance, SourceStatus } from "@argos/automation-runtime";
import type { SourceTypeRegistry } from "@argos/automation-runtime/sources";
import type { AutomationSourceRow } from "./daemonAutomationRepository";
import type { DaemonAutomationRuntime } from "./daemonAutomationRuntime";

interface RunningSource {
  row: AutomationSourceRow;
  instance: SourceInstance;
  controller: AbortController;
  status: SourceStatus;
}

export class DaemonSourceSupervisor {
  private readonly running = new Map<string, RunningSource>();
  private readonly startAttempts = new Map<string, { count: number; nextAt: number }>();
  private reconcileTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly deps: {
      repository: DaemonAutomationRuntime["repository"];
      registry: SourceTypeRegistry;
      runtime: DaemonAutomationRuntime;
      eventPublisher: IEventPublisher;
      resolveSourceConfig: (row: AutomationSourceRow) => Promise<unknown>;
      isPathAllowed: (path: string) => boolean;
      resolveSecret: (ref: string) => Promise<string | undefined>;
      dataDir: string;
    },
  ) {}

  start(): void {
    this.reconcileTimer = setInterval(() => void this.reconcile(), 5_000);
    this.reconcileTimer.unref?.();
    void this.reconcile();
  }

  async stop(): Promise<void> {
    if (this.reconcileTimer) clearInterval(this.reconcileTimer);
    this.reconcileTimer = null;
    await Promise.all([...this.running.keys()].map((id) => this.stopSource(id)));
  }

  async reconcile(): Promise<void> {
    const rows = this.deps.repository.listSources();
    const wanted = new Set(
      rows
        .filter((row) => row.enabled && (row.startAlways || this.deps.repository.countSubscriptions(row.id) > 0))
        .map((row) => row.id),
    );
    for (const id of [...this.running.keys()]) if (!wanted.has(id)) await this.stopSource(id);
    for (const row of rows) {
      if (!wanted.has(row.id) || this.running.has(row.id)) continue;
      const attempt = this.startAttempts.get(row.id);
      if (attempt && attempt.count > 0 && Date.now() < attempt.nextAt) continue;
      await this.startSource(row);
    }
  }

  private async startSource(row: AutomationSourceRow): Promise<void> {
    const definition = this.deps.registry.get(row.type);
    if (!definition) {
      await this.persistStatus(row.id, { state: "failing", lastError: `Unknown source type: ${row.type}` });
      return;
    }
    const controller = new AbortController();
    let status: SourceStatus = {
      state: "starting",
      since: Date.now(),
      lastEventAt: null,
      lastError: null,
      consecutiveFailures: 0,
      dropped: 0,
      lastEventId: null,
      ...row.status,
    };
    const ctx = {
      sourceId: row.id,
      sourceName: row.name,
      dataDir: this.deps.dataDir,
      allowedRoots: row.allowedRoots,
      signal: controller.signal,
      now: Date.now,
      emit: (input) => {
        const event = this.deps.runtime.emit({
          topic: `source/${row.name}/${input.type}`,
          type: input.type,
          payload: input.payload,
          sourceId: row.id,
          sourceName: row.name,
          trust: row.trust,
          dedupeKey: input.dedupeKey,
          replyTo: input.replyTo,
        });
        status = { ...status, lastEventAt: event.createdAt, lastEventId: event.id };
        void this.persistStatus(row.id, status);
      },
      setStatus: (patch) => {
        status = { ...status, ...patch };
        void this.persistStatus(row.id, status);
      },
      log: (level, message) => console[level === "debug" ? "log" : level](`[source:${row.name}] ${message}`),
      secret: this.deps.resolveSecret,
      isPathAllowed: this.deps.isPathAllowed,
    };
    try {
      const options = definition.optionsSchema.parse(await this.deps.resolveSourceConfig(row));
      const instance = definition.create(options, ctx);
      await instance.start();
      status = { ...status, state: "running", since: Date.now(), lastError: null, consecutiveFailures: 0 };
      this.running.set(row.id, { row, instance, controller, status });
      this.startAttempts.delete(row.id);
      await this.persistStatus(row.id, status);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const count = (this.startAttempts.get(row.id)?.count ?? 0) + 1;
      const nextAt = Date.now() + Math.min(15 * 60_000, 1_000 * 2 ** Math.min(count, 10));
      this.startAttempts.set(row.id, { count, nextAt });
      await this.persistStatus(row.id, { state: "failing", lastError: message, consecutiveFailures: count });
    }
  }

  private async stopSource(id: string): Promise<void> {
    const running = this.running.get(id);
    if (!running) return;
    this.running.delete(id);
    running.controller.abort();
    try {
      await running.instance.stop();
    } catch (error) {
      console.warn(`[source:${running.row.name}] stop failed`, error);
    }
    await this.persistStatus(id, { ...running.status, state: "stopped", since: Date.now() });
  }

  private async persistStatus(id: string, status: SourceStatus): Promise<void> {
    this.deps.repository.setSourceStatus(id, status);
    this.deps.eventPublisher.publish("automation.source.status", { sourceId: id, status });
  }
}
```

Important details:

- `allowedRoots` comes from the source row/config, not from the adapter. `AutomationSourceRow.allowedRoots` is the parsed `allowed_roots_json` column. The daemon resolves `~`, checks the configured root is inside a registered workspace or an explicitly allowed directory, and passes the resolved list.
- The supervisor reconciles every 5 seconds. A source that is `start: "always"` runs without a subscription; otherwise the first subscription starts it and the last unsubscribe stops it.
- A failed start backs off exponentially up to 15 minutes. A running source handles its own poll backoff.
- Status is persisted on every change. The UI reads it from `automationSources.list`.

## 4. Webhook ingress

The daemon's HTTP pipeline runs `authorize(request, authConfig)` before route dispatch (`apps/daemon/src/index.ts:1037`). Webhooks carry their own secret and must be handled **before** that gate, next to `/api/v1/pair`.

Insert after the pair handler and before `authorize`:

```ts
if (request.method === "POST" && url.pathname.startsWith("/api/v1/hooks/")) {
  const name = decodeURIComponent(url.pathname.slice("/api/v1/hooks/".length));
  return await automationRuntime.handleWebhook(request, name);
}
```

Webhook options:

```ts
const webhookOptionsSchema = zod.object({
  secretRef: zod.string().optional(),
  hmac: zod.boolean().default(false),
  open: zod.boolean().default(false),
  topic: zod.string().optional(),
  ratePerMinute: zod.number().int().min(1).max(600).default(120),
});
```

`DaemonAutomationRuntime.handleWebhook`:

```ts
async handleWebhook(request: Request, name: string): Promise<Response> {
  const source = this.repository.getSourceByName(name);
  if (!source || source.type !== "webhook" || !source.enabled) {
    return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
  }
  const config = webhookOptionsSchema.parse(JSON.parse(source.configJson));
  if (!this.webhookLimiter.consume(source.id)) {
    return new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 });
  }
  const body = await readBodyLimited(request, 1024 * 1024);
  if (!body.ok) return new Response(JSON.stringify({ error: "body_too_large" }), { status: 413 });
  const secret = config.secretRef ? await this.resolveSecret(config.secretRef) : undefined;
  if (!verifyWebhook(request, body.bytes, secret, config)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(body.text);
  } catch {
    payload = { text: body.text };
  }
  this.emit({
    topic: config.topic || `hook/${name}`,
    type: "request",
    payload,
    sourceName: name,
    sourceId: source.id,
    trust: source.trust,
    dedupeKey: request.headers.get("x-argos-delivery") ?? undefined,
  });
  return new Response(JSON.stringify({ accepted: true }), { status: 202 });
}
```

`verifyWebhook`:

- Bearer: `Authorization: Bearer <secret>`; compare with `crypto.timingSafeEqual` after length check.
- HMAC: `X-Argos-Signature: sha256=<hex>` over the raw bytes; compare constant-time.
- If no secret is configured, the source must be marked `open: true` and `argos check` must list it. Default is closed.

Rate limit: token bucket per source (default 120/min, burst 20). Store in memory; reset on restart. Do not use the auth-failure limiter.

## 5. Folder source

`packages/automation-runtime/src/sources/folder.ts`:

```ts
import chokidar from "chokidar";
import { stat } from "node:fs/promises";
import path from "node:path";
import zod from "zod";

export const folderOptionsSchema = zod.object({
  path: zod.string().min(1),
  glob: zod.string().optional(),
  ignore: zod.array(zod.string()).default([]),
  recursive: zod.boolean().default(true),
  debounceMs: zod.number().int().min(50).max(60_000).default(250),
});

export const folderSource: SourceDefinition<zod.infer<typeof folderOptionsSchema>> = {
  type: "folder",
  description: "A new or changed file in a folder",
  optionsSchema: folderOptionsSchema,
  eventTypeSchema: zod.enum(["new", "changed", "removed"]),
  create(options, ctx) {
    let watcher: chokidar.FSWatcher | null = null;
    const pending = new Map<string, ReturnType<typeof setTimeout>>();
    return {
      async start() {
        watcher = chokidar.watch(options.path, {
          ignoreInitial: true,
          followSymlinks: false,
          depth: options.recursive ? undefined : 0,
          ignored: options.ignore,
          awaitWriteFinish: { stabilityThreshold: options.debounceMs, pollInterval: 100 },
        });
        const emit = async (kind: "new" | "changed" | "removed", filePath: string) => {
          const resolved = path.resolve(filePath);
          if (!ctx.isPathAllowed(resolved)) return;
          if (kind !== "removed" && !(await stat(resolved)).isFile()) return;
          const info = kind === "removed" ? null : await stat(resolved);
          ctx.emit({
            type: kind,
            dedupeKey: `${resolved}:${info?.mtimeMs ?? 0}:${info?.size ?? 0}`,
            payload: {
              path: resolved,
              relativePath: path.relative(options.path, resolved),
              size: info?.size ?? null,
              mtime: info?.mtimeMs ?? null,
              kind,
            },
          });
        };
        watcher.on("add", (p) => schedule("new", p));
        watcher.on("change", (p) => schedule("changed", p));
        watcher.on("unlink", (p) => schedule("removed", p));
        watcher.on("error", (error) => ctx.log("error", String(error)));
        const schedule = (kind: "new" | "changed" | "removed", filePath: string) => {
          const key = `${kind}:${filePath}`;
          const previous = pending.get(key);
          if (previous) clearTimeout(previous);
          pending.set(key, setTimeout(() => {
            pending.delete(key);
            void emit(kind, filePath);
          }, options.debounceMs));
        };
      },
      async stop() {
        for (const timer of pending.values()) clearTimeout(timer);
        pending.clear();
        await watcher?.close();
        watcher = null;
      },
    };
  },
};
```

Path policy: the daemon must resolve `options.path` and reject it unless it is inside a registered workspace or an explicitly allowed automation root. The adapter's `isPathAllowed` is a second check, not the first.

## 6. HTTP source

Options:

```ts
export const httpOptionsSchema = zod.object({
  url: zod.string().url(),
  method: zod.enum(["GET", "POST"]).default("GET"),
  headers: zod.record(zod.string(), zod.string()).default({}),
  body: zod.string().optional(),
  intervalMs: zod.number().int().min(5_000).max(86_400_000).default(60_000),
  jsonPath: zod.string().optional(),
  match: zod.string().optional(),
  allowLocal: zod.boolean().default(false),
  timeoutMs: zod.number().int().min(1_000).max(60_000).default(15_000),
});
```

Flow:

1. On start, perform one baseline fetch and store `{ etag, lastModified, hash, value }` in the supervisor status.
2. Every `intervalMs`, fetch again. Send `If-None-Match`/`If-Modified-Since`. A `304` is a no-op.
3. Extract the watched value: `jsonPath` (dot path), `match` (first capture group), else the body hash.
4. Emit `changed` only when the value/hash differs from the baseline.
5. On failure, double the interval up to 15 minutes; reset on success.

SSRF guard:

```ts
async function assertAllowedUrl(raw: string, allowLocal: boolean): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http(s) URLs are allowed");
  if (allowLocal) return url;
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error(`URL resolves to a private address: ${url.hostname}`);
  }
  return url;
}
```

`isPrivateAddress` must cover IPv4 loopback/private/link-local and IPv6 `::1`, `fc00::/7`, `fe80::/10`, and IPv4-mapped addresses. Fetch with `redirect: "manual"`; follow at most one redirect and only to the same host and a public address. Re-resolve at connect time to reduce DNS rebinding.

## 7. Feed source

Use `fast-xml-parser` (small, no native deps) inside the adapter. Normalize RSS/Atom entries to `{ id, title, link, publishedAt, summary }`. On start, record the current entry ids as the baseline; emit only entries not in the baseline, oldest first. Cap at 50 entries per poll. Store the last 500 ids in status.

## 8. Command source

Two modes:

- `poll`: run the command every `intervalMs`, compare stdout hash. Emit `changed` with `{ stdout, exitCode }` when it differs. Baseline is the first run.
- `follow`: spawn once with `stdio: ["ignore", "pipe", "pipe"]`, read lines, emit `line` per line. On exit, restart with exponential backoff unless stopped.

Execution rules:

- `command` is a string path or executable; `args` is an array. Never use a shell.
- `cwd` must be inside an allowed root.
- Env is a minimal allowlist plus configured `env`; do not inherit the daemon's full environment.
- Timeout (default 30 s for poll) kills the process. Output is capped at 64 KB per event and 1 MB per run.
- On stop, send `SIGTERM`, wait 2 s, then `SIGKILL`.

## 9. Calendar source

Options: `{ url, intervalMs, timezone? }`. Use `ical.js` to parse the iCal body. Normalize each `VEVENT` to `{ uid, start, end, summary, location }`. The baseline is a map keyed by `uid`; compare `start + summary` to detect moves. Emit `added`, `moved`, `removed`. First poll is a baseline.

## 10. Secrets

Add `apps/daemon/src/host/automationSecretStore.ts`:

```ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";

export class AutomationSecretStore {
  private readonly key: Buffer;

  constructor(private readonly db: BunDatabase, dataDir: string) {
    const keyPath = join(dataDir, "automation.key");
    if (!existsSync(keyPath)) {
      writeFileSync(keyPath, randomBytes(32), { mode: 0o600 });
      chmodSync(keyPath, 0o600);
    }
    this.key = readFileSync(keyPath);
    this.db.exec(`CREATE TABLE IF NOT EXISTS argos_automation_secrets (
      name TEXT PRIMARY KEY, value_enc TEXT NOT NULL, created_at INTEGER NOT NULL
    )`);
  }

  set(name: string, value: string): void {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const payload = [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64")).join(".");
    this.db.prepare(
      "INSERT INTO argos_automation_secrets (name, value_enc, created_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(name) DO UPDATE SET value_enc = excluded.value_enc, created_at = excluded.created_at",
    ).run(name, payload, Date.now());
  }

  get(name: string): string | undefined {
    const row = this.db.prepare("SELECT value_enc FROM argos_automation_secrets WHERE name = ?").get(name) as
      | { value_enc: string }
      | undefined;
    if (!row) return undefined;
    const [ivB64, tagB64, dataB64] = row.value_enc.split(".");
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  }
}
```

Resolution order for `${NAME}`: process environment first, then the secret store. Store values are never returned by routes; `automationSources.list` returns only the `${...}` references. Add a `redactSecrets(text, values)` helper for logs and event previews (values of 8+ chars).

## 11. Cron schedules

Cron is an extension of the existing scheduler, not a second one.

### Shared types

`packages/shared/src/scheduledTasks.ts`:

```ts
export const SCHEDULED_TASK_TRIGGER_KINDS = ["once", "daily", "weekly", "cron", "every"] as const;

export type ScheduledTaskTrigger =
  | { kind: "once"; firesAt: number }
  | { kind: "daily"; hour: number; minute: number }
  | { kind: "weekly"; dayOfWeek: number; hour: number; minute: number }
  | { kind: "cron"; expression: string; timezone: string; misfire: "skip" | "run-once" | "run-all" }
  | { kind: "every"; everyMs: number; anchorAt?: number };
```

### Contracts

`scheduledTasks.routes.ts` adds:

```ts
zod.object({
  kind: zod.literal("cron"),
  expression: zod.string().min(1).max(200),
  timezone: zod.string().default("local"),
  misfire: zod.enum(["skip", "run-once", "run-all"]).default("run-once"),
}),
zod.object({
  kind: zod.literal("every"),
  everyMs: zod.number().int().positive(),
  anchorAt: zod.number().int().nonnegative().optional(),
}),
```

Bump `SCHEDULED_TASKS_VERSION` to `2`. `normalizeScheduledTasksConfig` accepts version 1 tasks and fills `timezone: "local"`, `misfire: "run-once"`.

### Next-fire computation

Add `croner` as a dependency of `packages/backend-core` and isolate it in `scheduled/cron.ts`:

```ts
import { Cron } from "croner";

export function nextCronFireAt(expression: string, timezone: string, after: number): number | null {
  const cron = new Cron(expression, {
    timezone: timezone === "local" ? undefined : timezone,
    paused: true,
  });
  const next = cron.nextRun(new Date(after));
  return next ? next.getTime() : null;
}
```

`computeNextFireAt` in `normalize.ts` adds:

```ts
if (task.trigger.kind === "cron") return nextCronFireAt(task.trigger.expression, task.trigger.timezone, after);
if (task.trigger.kind === "every") {
  const anchor = task.trigger.anchorAt ?? task.createdAt;
  if (after < anchor) return anchor;
  const elapsed = after - anchor;
  return anchor + (Math.floor(elapsed / task.trigger.everyMs) + 1) * task.trigger.everyMs;
}
```

### Misfire

`ScheduledTasksService.runStartupPass()` currently backfills one-shot tasks. Add:

```ts
if (task.enabled && task.trigger.kind === "cron") {
  const missed = lastFiredAt && computeNextFireAt(task, lastFiredAt) < now;
  if (missed && task.trigger.misfire === "run-once") void this.fireAndPersist(task);
  if (missed && task.trigger.misfire === "run-all") {
    // bounded: at most 20 occurrences, oldest first
  }
}
```

`skip` does nothing. `run-all` must be bounded; a daemon down for a month must not fire thousands of times.

### Target existing session

Extend the `prompt` action:

```ts
zod.object({
  kind: zod.literal("prompt"),
  title: zod.string().max(200),
  message: zod.string().max(20_000),
  autoSend: zod.boolean(),
  agentId: zod.string().optional(),
  providerId: zod.string().optional(),
  modelId: zod.string().optional(),
  systemPrompt: zod.string().max(20_000).optional(),
  target: zod
    .discriminatedUnion("kind", [
      zod.object({ kind: zod.literal("new-session") }),
      zod.object({ kind: zod.literal("session"), sessionId: zod.string().min(1) }),
    ])
    .default({ kind: "new-session" }),
}),
```

`runPromptAutoSend` branches: `session` calls `sessionCreator.sendToExistingSession(sessionId, message)`; `new-session` keeps the current path. Add that method to `SessionCreator` and implement it in `DaemonScheduledTasks` with `providerExecutionPort.sendMessage`.

### Desktop duplicate

`apps/desktop/src/main/presenter/scheduledTasks/normalize.ts` has a duplicate `computeNextFireAt`. Update both, or extract the function into `@argos/backend-core` and import it from desktop. Prefer the extraction to prevent drift.

### UI

`packages/ui/settings/components/ScheduledTasksSettings.tsx` adds a trigger type selector with a cron expression field, timezone, misfire policy, and a live "next fire" preview. The preview can be computed client-side with the same `croner` package or shown after save from the route output.

## 12. Routes and UI for sources

Add to the automation contracts:

```text
automationSources.list|get|upsert|remove|start|stop|test
```

- `upsert` input includes `type`, `name`, `config`, `scope`, `trust`, `enabled`, `startAlways`.
- The daemon validates `config` with the registered type's `optionsSchema` **before** writing.
- `test` starts the source in a temporary context and returns the first event or a timeout error; do not persist the source.
- `list` returns `status` from `status_json`, subscription count, and the config with secrets still as `${...}` references.

UI: `packages/ui/api/AutomationClient.ts` (factory, mirror `ScheduledTasksClient.ts`), `packages/ui/src/pages/AutomationsPage.tsx` with a Sources tab, and `packages/ui/src/components/automation/SourceEditor.tsx` generated from the source type's option schema. Expose the schema descriptors through an `automationSources.types` route so the form fields and the server validation cannot drift.

## 13. Tests

- Source registry: duplicate type rejection; option parsing.
- Supervisor: first subscription starts a source; last unsubscribe stops it; `startAlways` runs without subscriptions; failed start backs off; stop aborts.
- Folder: add/change/remove events; path outside root rejected; ignored directory skipped.
- Webhook: valid bearer/HMAC accepted; invalid rejected; body >1 MB rejected; rate limit; unknown name 404; valid event persisted.
- HTTP: SSRF (loopback, private, IPv6, DNS rebinding), cross-host redirect, 304 no-op, change emits once.
- Feed: baseline emits nothing; new entry emits once; duplicate id ignored.
- Command: poll change emits once; follow emits lines; stop kills the process; shell metacharacters are not interpreted.
- Calendar: added/moved/removed diffs.
- Secrets: round-trip encrypt/decrypt; `${ENV}` precedence; redaction.
- Cron: every minute, DST spring-forward/fall-back, leap day, timezone conversion, `run-once` after downtime, bounded `run-all`.
- Schedule target: existing session receives the prompt; new session path unchanged.

## 14. Exit criteria

- [ ] A file dropped into a configured folder produces an event row and a UI log entry.
- [ ] A signed webhook produces an event; an unsigned one is rejected.
- [ ] A cron schedule fires at the right local time across a DST boundary.
- [ ] Source status shows running/failing/stopped and survives restart.
- [ ] No secret value appears in a route response, log line, or event preview.
- [ ] Sources with no subscriptions do no I/O.
- [ ] All new timers/processes/watchers stop on daemon shutdown.
