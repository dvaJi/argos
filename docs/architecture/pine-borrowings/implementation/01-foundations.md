# 01 — Automation Foundations

This is the first vertical slice: a pure runtime package, durable event/state storage, typed contracts, a daemon host, and the wiring that makes an event visible in the UI. No external source adapters yet.

## 1. Package layout

Create `packages/automation-runtime` (workspace package, no Electron, no Bun-only globals, no daemon imports).

```text
packages/automation-runtime/
  package.json
  tsconfig.json
  src/
    index.ts
    types.ts
    topics.ts
    templates.ts
    filters.ts
    routes.ts          # route definition types + pure evaluator helpers
    state.ts           # shared-state port
    sources/           # added in 02
  test/
    topics.test.ts
    templates.test.ts
    filters.test.ts
```

`package.json`:

```json
{
  "name": "@argos/automation-runtime",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./sources": "./src/sources/index.ts"
  },
  "scripts": {
    "typecheck": "bun check",
    "test": "bun test"
  },
  "dependencies": {
    "zod": "catalog:"
  }
}
```

Add the package to the root workspace list if it is not globbed, and to `turbo.json` only if it needs a build. The repo runs TypeScript sources directly in Bun; do not add a bundler.

## 2. Core types

`src/types.ts`:

```ts
export type EventTrust = "owner" | "untrusted";

export interface AutomationEvent<TPayload = unknown> {
  id: string;
  topic: string;
  sourceId: string | null;
  sourceName: string | null;
  type: string;
  trust: EventTrust;
  payload: TPayload;
  createdAt: number;
  traceId: string | null;
  depth: number;
  dedupeKey: string | null;
  replyTo: string | null;
}

export type SourceState = "idle" | "starting" | "running" | "failing" | "stopped";

export interface SourceStatus {
  state: SourceState;
  since: number;
  lastEventAt: number | null;
  lastError: string | null;
  consecutiveFailures: number;
  dropped: number;
  lastEventId: string | null;
}

export type FilterOperator = "eq" | "ne" | "in" | "gt" | "gte" | "lt" | "lte" | "exists" | "contains" | "regex";

export type FilterCondition =
  | { [K in FilterOperator]?: unknown }
  | unknown;

export interface TemplateContext {
  payload: unknown;
  topic: string;
  source: string | null;
  id: string;
  ts: number;
  time: string;
  state: Record<string, unknown>;
  result?: unknown;
}

export interface RouteDefinition {
  id: string;
  name: string;
  enabled: boolean;
  on: string | string[];
  when?: Record<string, FilterCondition>;
  debounceMs?: number;
  throttleMs?: number;
  key?: string;
  actions: {
    set?: Record<string, string>;
    call?: { prompt: string; system?: string; model?: string };
    publish?: { topic: string; payload?: unknown };
    agent?: {
      agentId: string;
      session: string;
      prompt?: string;
      whenBusy?: "queue" | "steer";
      priority?: number;
    };
  };
}
```

## 3. Topic matcher

`src/topics.ts`:

```ts
const SEGMENT = /^[a-z0-9][a-z0-9._-]*$/;

export function isValidTopic(topic: string): boolean {
  if (!topic || topic.length > 200) return false;
  const segments = topic.split("/");
  return segments.length > 0 && segments.every((segment) => SEGMENT.test(segment));
}

export function isValidPattern(pattern: string): boolean {
  if (!pattern || pattern.length > 200) return false;
  const segments = pattern.split("/");
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    if (segment === "#") return i === segments.length - 1;
    if (segment !== "+" && !SEGMENT.test(segment)) return false;
  }
  return true;
}

export function topicMatches(pattern: string, topic: string): boolean {
  if (!isValidPattern(pattern) || !isValidTopic(topic)) return false;
  const p = pattern.split("/");
  const t = topic.split("/");
  let pi = 0;
  let ti = 0;
  while (pi < p.length) {
    const segment = p[pi];
    if (segment === "#") return true; // matches the rest, including zero segments
    if (ti >= t.length) return false;
    if (segment !== "+" && segment !== t[ti]) return false;
    pi += 1;
    ti += 1;
  }
  return ti === t.length;
}
```

Tests must cover `source/#` matching `source` itself, `#` matching everything, `+` matching exactly one segment, empty segments, uppercase rejection, and `#` not at the end.

## 4. Templates and filters

`src/templates.ts` — type-preserving single-path templates:

```ts
export function resolvePath(root: unknown, path: string): unknown {
  if (!path) return root;
  let current = root;
  for (const key of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

const EXACT = /^\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}$/;
const INLINE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export function renderTemplate(template: string, ctx: TemplateContext): unknown {
  const exact = EXACT.exec(template);
  if (exact) return resolvePath(ctx, exact[1]);
  return template.replace(INLINE, (_match, path: string) => {
    const value = resolvePath(ctx, path);
    if (value === undefined || value === null) return "";
    return typeof value === "string" ? value : JSON.stringify(value);
  });
}

export function renderString(template: string, ctx: TemplateContext): string {
  const value = renderTemplate(template, ctx);
  return typeof value === "string" ? value : value === undefined ? "" : JSON.stringify(value);
}
```

`resolvePath` must support `payload.a.b`, `state.house/mode`, `topic`, `id`, `ts`, `time`, and `result`. For `state.<key>` with slashes, split on the first `.` only:

```ts
export function resolveContextPath(ctx: TemplateContext, path: string): unknown {
  if (path === "payload") return ctx.payload;
  if (path.startsWith("payload.")) return resolvePath(ctx.payload, path.slice("payload.".length));
  if (path.startsWith("state.")) return ctx.state[path.slice("state.".length)];
  if (path === "result") return ctx.result;
  if (path === "topic") return ctx.topic;
  if (path === "source") return ctx.source;
  if (path === "id") return ctx.id;
  if (path === "ts") return ctx.ts;
  if (path === "time") return ctx.time;
  return undefined;
}
```

`src/filters.ts`:

```ts
const OPERATORS = new Set(["eq", "ne", "in", "gt", "gte", "lt", "lte", "exists", "contains", "regex"]);

function isConditionObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value).some((key) => OPERATORS.has(key));
}

export function evaluateCondition(actual: unknown, condition: unknown): boolean {
  if (!isConditionObject(condition)) return Object.is(actual, condition);
  if ("eq" in condition && !Object.is(actual, condition.eq)) return false;
  if ("ne" in condition && Object.is(actual, condition.ne)) return false;
  if ("in" in condition) {
    const list = condition.in;
    if (!Array.isArray(list) || !list.some((item) => Object.is(item, actual))) return false;
  }
  if ("exists" in condition && Boolean(condition.exists) !== (actual !== undefined && actual !== null)) return false;
  if ("gt" in condition && !(typeof actual === "number" && actual > Number(condition.gt))) return false;
  if ("gte" in condition && !(typeof actual === "number" && actual >= Number(condition.gte))) return false;
  if ("lt" in condition && !(typeof actual === "number" && actual < Number(condition.lt))) return false;
  if ("lte" in condition && !(typeof actual === "number" && actual <= Number(condition.lte))) return false;
  if ("contains" in condition) {
    if (typeof actual === "string" && typeof condition.contains === "string") {
      if (!actual.includes(condition.contains)) return false;
    } else if (Array.isArray(actual)) {
      if (!actual.some((item) => Object.is(item, condition.contains))) return false;
    } else {
      return false;
    }
  }
  if ("regex" in condition) {
    if (typeof actual !== "string" || typeof condition.regex !== "string") return false;
    const flags = typeof condition.flags === "string" ? condition.flags : "";
    if (!new RegExp(condition.regex, flags).test(actual)) return false;
  }
  return true;
}
```

Route `when` evaluation lives in `src/routes.ts` and is a pure function over a resolved snapshot (`payload`, `state`). The daemon supplies state.

## 5. Daemon schema and repository

Create `apps/daemon/src/host/daemonAutomationRepository.ts`. It owns the tables and all SQL. Create the schema in the constructor, matching `BunSessionRepository.ensureTable()`.

```ts
import type { Database as BunDatabase } from "bun:sqlite";
import type { AutomationEvent, RouteDefinition, SourceStatus } from "@argos/automation-runtime";

export class DaemonAutomationRepository {
  constructor(private readonly db: BunDatabase) {
    this.ensureSchema();
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS argos_automation_events (
        id TEXT PRIMARY KEY,
        topic TEXT NOT NULL,
        source_id TEXT,
        source_name TEXT,
        type TEXT NOT NULL,
        trust TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        trace_id TEXT,
        depth INTEGER NOT NULL DEFAULT 0,
        dedupe_key TEXT,
        reply_to TEXT,
        created_at INTEGER NOT NULL,
        delivered_at INTEGER
      )
    `);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_automation_events_topic ON argos_automation_events(topic, created_at DESC)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_automation_events_created ON argos_automation_events(created_at DESC)`);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS argos_automation_deliveries (
        event_id TEXT NOT NULL,
        subscription_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        delivered_at INTEGER NOT NULL,
        PRIMARY KEY (event_id, subscription_id)
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS argos_automation_state (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_by TEXT,
        updated_at INTEGER NOT NULL
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS argos_automation_sources (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        scope TEXT NOT NULL,
        agent_id TEXT,
        session_id TEXT,
        config_json TEXT NOT NULL,
        allowed_roots_json TEXT NOT NULL DEFAULT '[]',
        trust TEXT NOT NULL DEFAULT 'untrusted',
        enabled INTEGER NOT NULL DEFAULT 1,
        start_always INTEGER NOT NULL DEFAULT 0,
        status_json TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS argos_automation_subscriptions (
        id TEXT PRIMARY KEY,
        source_id TEXT NOT NULL,
        scope TEXT NOT NULL,
        agent_id TEXT,
        session_id TEXT,
        note TEXT NOT NULL DEFAULT '',
        paused INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      )
    `);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_automation_subs_source ON argos_automation_subscriptions(source_id)`);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS argos_automation_routes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        on_json TEXT NOT NULL,
        when_json TEXT,
        debounce_ms INTEGER,
        throttle_ms INTEGER,
        key_template TEXT,
        actions_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  }

  insertEvent(event: AutomationEvent): void {
    this.db
      .prepare(
        `INSERT INTO argos_automation_events
         (id, topic, source_id, source_name, type, trust, payload_json, trace_id, depth, dedupe_key, reply_to, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.id,
        event.topic,
        event.sourceId,
        event.sourceName,
        event.type,
        event.trust,
        JSON.stringify(event.payload),
        event.traceId,
        event.depth,
        event.dedupeKey,
        event.replyTo,
        event.createdAt,
      );
  }
}
```

Add the remaining methods as needed:

```ts
// events
listEvents(input: { topic?: string; limit: number; before?: number }): { events: AutomationEvent[]; nextBefore: number | null };
getEvent(id: string): AutomationEvent | null;
clearEvents(before?: number): number;
markDelivered(eventId: string, subscriptionId: string, sessionId: string): void;
hasDelivery(eventId: string, subscriptionId: string): boolean;
pruneEvents(before: number): number;

// state
getState(key: string): unknown;
listState(prefix?: string): Array<{ key: string; value: unknown; updatedAt: number }>;
snapshotState(): Record<string, unknown>;
setState(key: string, value: unknown, updatedBy: string): { updatedAt: number };
deleteState(key: string): boolean;

// sources, subscriptions, routes (added in 02/03)
listSources(): AutomationSourceRow[];
getSourceByName(name: string): AutomationSourceRow | null;
upsertSource(input: AutomationSourceInput): AutomationSourceRow;
removeSource(id: string): boolean;
setSourceStatus(id: string, status: SourceStatus): void;
listSubscriptions(sourceId?: string): AutomationSubscriptionRow[];
addSubscription(input: Omit<AutomationSubscriptionRow, "id" | "createdAt">): AutomationSubscriptionRow;
removeSubscription(id: string): boolean;
countSubscriptions(sourceId: string): number;
matchingSubscriptions(topic: string): AutomationSubscriptionRow[];
listEnabledRoutes(): Array<{ id: string; definition: RouteDefinition }>;
upsertRoute(input: RouteDefinition): RouteDefinition;
removeRoute(id: string): boolean;
```

Topic filtering: SQL cannot run `+`/`#` matching efficiently. For v1, query by `created_at` and filter in JS with `topicMatches`; the log is bounded by retention and the UI requests ≤500 rows. If this becomes a hot path, add a materialized `topic_root` column.

Retention: `DELETE FROM argos_automation_events WHERE created_at < ?` in a 5-minute interval timer; also delete orphan deliveries. Default 7 days, configurable.

## 6. Runtime class

`apps/daemon/src/host/daemonAutomationRuntime.ts`:

```ts
import { randomUUID } from "node:crypto";
import type { IEventPublisher, ProviderExecutionPort, SessionRepository } from "@argos/backend-core";
import type { AutomationEvent, EventTrust } from "@argos/automation-runtime";
import { isValidTopic, topicMatches } from "@argos/automation-runtime";
import { automationEventReceivedEvent } from "@argos/shared-contracts/events/automation.events";
import { chatStreamCompletedEvent } from "@argos/shared-contracts/events/chat.events";
import type { DaemonConfigPresenter } from "./daemonConfigPresenter";
import { DaemonAutomationRepository } from "./daemonAutomationRepository";

export interface DaemonAutomationDeps {
  db: BunDatabase;
  configPresenter: DaemonConfigPresenter;
  eventPublisher: IEventPublisher;
  sessionRepository: SessionRepository;
  providerExecutionPort: Pick<ProviderExecutionPort, "sendMessage" | "steerActiveTurn" | "getActiveGeneration">;
  dataDir: string;
  agentWorkspaceDir: string;
}

export interface EmitInput {
  topic: string;
  payload: unknown;
  type?: string;
  sourceId?: string | null;
  sourceName?: string | null;
  trust?: EventTrust;
  traceId?: string | null;
  depth?: number;
  dedupeKey?: string | null;
  replyTo?: string | null;
}

export class DaemonAutomationRuntime {
  readonly repository: DaemonAutomationRepository;
  private readonly deps: DaemonAutomationDeps;
  private retentionTimer: ReturnType<typeof setInterval> | null = null;

  constructor(deps: DaemonAutomationDeps) {
    this.deps = deps;
    this.repository = new DaemonAutomationRepository(deps.db);
  }

  start(): void {
    if (this.retentionTimer) return;
    this.retentionTimer = setInterval(() => {
      const days = this.deps.configPresenter.getAutomationSettings().eventRetentionDays;
      this.repository.pruneEvents(Date.now() - days * 24 * 60 * 60 * 1000);
    }, 5 * 60 * 1000);
    this.retentionTimer.unref?.();
  }

  stop(): void {
    if (this.retentionTimer) clearInterval(this.retentionTimer);
    this.retentionTimer = null;
  }

  emit(input: EmitInput): AutomationEvent {
    if (!isValidTopic(input.topic)) throw new Error(`Invalid event topic: ${input.topic}`);
    const event: AutomationEvent = {
      id: randomUUID(),
      topic: input.topic,
      sourceId: input.sourceId ?? null,
      sourceName: input.sourceName ?? null,
      type: input.type ?? "event",
      trust: input.trust ?? "owner",
      payload: input.payload ?? null,
      createdAt: Date.now(),
      traceId: input.traceId ?? null,
      depth: input.depth ?? 0,
      dedupeKey: input.dedupeKey ?? null,
      replyTo: input.replyTo ?? null,
    };
    this.repository.insertEvent(event);
    this.deps.eventPublisher.publish(automationEventReceivedEvent.name, {
      id: event.id,
      topic: event.topic,
      sourceName: event.sourceName,
      trust: event.trust,
      createdAt: event.createdAt,
      payloadPreview: previewPayload(event.payload),
    });
    return event;
  }

  listEvents(input: { topic?: string; limit: number; before?: number }) {
    const rows = this.repository.listEvents({ ...input, limit: Math.min(input.limit, 500) });
    const events = input.topic ? rows.events.filter((event) => topicMatches(input.topic!, event.topic)) : rows.events;
    return { events, nextBefore: rows.nextBefore };
  }
}

function previewPayload(payload: unknown): string {
  const text = typeof payload === "string" ? payload : JSON.stringify(payload);
  return text.length > 2_000 ? `${text.slice(0, 2_000)}…` : text;
}
```

`chatStreamCompletedEvent` import is not needed until 05; remove it if unused. Keep the runtime focused.

When delivery lands in 03, widen `sessionRepository` to the `AutomationSessionPort` (it adds `queuePendingInput`); the foundation runtime does not need it yet.

## 7. Contracts and events

`packages/shared-contracts/src/events/automation.events.ts`:

```ts
import zod from "zod";
import { defineEventContract } from "../common";

export const automationEventReceivedEvent = defineEventContract({
  name: "automation.event.received",
  payload: zod.object({
    id: zod.string(),
    topic: zod.string(),
    sourceName: zod.string().nullable(),
    trust: zod.enum(["owner", "untrusted"]),
    createdAt: zod.number().int(),
    payloadPreview: zod.string(),
  }),
});

export const automationStateChangedEvent = defineEventContract({
  name: "automation.state.changed",
  payload: zod.object({
    key: zod.string(),
    updatedAt: zod.number().int(),
    version: zod.number().int(),
  }),
});
```

Register both in `packages/shared-contracts/src/events.ts` (import, `export *`, catalog entry). The catalog is what typed clients see.

`packages/shared-contracts/src/routes/automation.routes.ts`:

```ts
import zod from "zod";
import { defineRouteContract } from "../common";

export const automationEventSchema = zod.object({
  id: zod.string(),
  topic: zod.string(),
  sourceId: zod.string().nullable(),
  sourceName: zod.string().nullable(),
  type: zod.string(),
  trust: zod.enum(["owner", "untrusted"]),
  payload: zod.unknown(),
  createdAt: zod.number().int(),
  traceId: zod.string().nullable(),
  depth: zod.number().int(),
  dedupeKey: zod.string().nullable(),
  replyTo: zod.string().nullable(),
});

export const automationEventsListRoute = defineRouteContract({
  name: "automationEvents.list",
  input: zod.object({
    topic: zod.string().optional(),
    limit: zod.number().int().min(1).max(500).default(100),
    before: zod.number().int().nonnegative().optional(),
  }),
  output: zod.object({
    events: zod.array(automationEventSchema),
    nextBefore: zod.number().int().nullable(),
  }),
});

export const automationEventsClearRoute = defineRouteContract({
  name: "automationEvents.clear",
  input: zod.object({ before: zod.number().int().nonnegative().optional() }),
  output: zod.object({ deleted: zod.number().int().nonnegative() }),
});

export const automationStateListRoute = defineRouteContract({
  name: "automationState.list",
  input: zod.object({ prefix: zod.string().optional() }),
  output: zod.object({
    entries: zod.array(
      zod.object({ key: zod.string(), value: zod.unknown(), updatedAt: zod.number().int() }),
    ),
  }),
});

export const automationStateSetRoute = defineRouteContract({
  name: "automationState.set",
  input: zod.object({ key: zod.string().min(1).max(200), value: zod.unknown() }),
  output: zod.object({ key: zod.string(), updatedAt: zod.number().int() }),
});

export const automationStateDeleteRoute = defineRouteContract({
  name: "automationState.delete",
  input: zod.object({ key: zod.string().min(1).max(200) }),
  output: zod.object({ deleted: zod.boolean() }),
});
```

Register all in `packages/shared-contracts/src/routes.ts` (`ARGOS_ROUTE_CATALOG`). The route catalog drift guard will tell you if an import or entry is missing.

## 8. Dispatcher wiring

`apps/daemon/src/dispatch/daemonDispatcher.ts`:

1. Add `automationRuntime: DaemonAutomationRuntime` to the factory parameters, next to `scheduledTasks`.
2. Add a local domain dispatcher above `createDaemonDispatcher` (mirror `dispatchRemoteRoute` at line 615):

```ts
type AutomationRuntimePort = {
  listEvents(input: { topic?: string; limit: number; before?: number }): {
    events: unknown[];
    nextBefore: number | null;
  };
  repository: {
    clearEvents(before?: number): number;
    listState(prefix?: string): Array<{ key: string; value: unknown; updatedAt: number }>;
    setState(key: string, value: unknown, updatedBy: string): { updatedAt: number };
    deleteState(key: string): boolean;
  };
};

async function dispatchAutomationRoute(
  runtime: AutomationRuntimePort,
  route: string,
  rawInput: unknown,
): Promise<unknown> {
  switch (route) {
    case automationEventsListRoute.name: {
      const input = automationEventsListRoute.input.parse(rawInput);
      return automationEventsListRoute.output.parse(runtime.listEvents(input));
    }
    case automationEventsClearRoute.name: {
      const input = automationEventsClearRoute.input.parse(rawInput);
      const deleted = runtime.repository.clearEvents(input.before);
      return automationEventsClearRoute.output.parse({ deleted });
    }
    case automationStateListRoute.name: {
      const input = automationStateListRoute.input.parse(rawInput);
      const entries = runtime.repository.listState(input.prefix);
      return automationStateListRoute.output.parse({ entries });
    }
    case automationStateSetRoute.name: {
      const input = automationStateSetRoute.input.parse(rawInput);
      const result = runtime.repository.setState(input.key, input.value, "user");
      return automationStateSetRoute.output.parse(result);
    }
    case automationStateDeleteRoute.name: {
      const input = automationStateDeleteRoute.input.parse(rawInput);
      const deleted = runtime.repository.deleteState(input.key);
      return automationStateDeleteRoute.output.parse({ deleted });
    }
    default:
      throw new Error(`Unhandled automation route: ${route}`);
  }
}
```

Each route parses its own input. This mirrors the `remote.*` domain's handler map (`daemonDispatcher.ts:615`) while keeping per-route schemas explicit. The main chain only routes by domain prefix:

3. In the main `if` chain, add:

```ts
if (route.startsWith("automationEvents.") || route.startsWith("automationState.")) {
  return await dispatchAutomationRoute(automationRuntime, route, rawInput);
}
```

Earlier in the chain, before this block, add `if (isDesktopOnlyRoute(route)) throw ...` as the existing code does. The dispatcher's output is re-parsed by `dispatchRoute`, so returning the route's output is enough.

## 9. Daemon wiring

`apps/daemon/src/index.ts`:

```ts
const automationRuntime = new DaemonAutomationRuntime({
  db,
  configPresenter,
  eventPublisher,
  sessionRepository,
  providerExecutionPort,
  dataDir: paths.getDataDir(),
  agentWorkspaceDir: paths.getDataDir() + "/agent-workspace",
});
if (configPresenter.getAutomationSettings().enabled) automationRuntime.start();
```

Place this after `const scheduledTasks = new DaemonScheduledTasks(...)` (around line 936) so all dependencies exist. Pass `automationRuntime` into `createDaemonDispatcher(...)` in the position next to `scheduledTasks`.

Shutdown: add `automationRuntime.stop()` to both:

- `setupGracefulShutdown(..., closeCallback)` near `scheduledTasks.stop()` (line ~1241).
- `DaemonHandle.close` (line ~1284).

If the runtime is disabled, `start()` is a no-op; routes still work against an empty log.

## 10. Config defaults

Extend `apps/daemon/src/host/daemonConfigPresenter.ts`:

```ts
export interface AutomationSettings {
  enabled: boolean;
  eventRetentionDays: number;
  maxEventsPerMinute: number;
  sourcesEnabled: boolean;
  webhooksEnabled: boolean;
  ownerTrustRoutes: boolean;
}

const DEFAULT_AUTOMATION_SETTINGS: AutomationSettings = {
  enabled: false,
  eventRetentionDays: 7,
  maxEventsPerMinute: 600,
  sourcesEnabled: false,
  webhooksEnabled: false,
  ownerTrustRoutes: false,
};

getAutomationSettings(): AutomationSettings {
  return { ...DEFAULT_AUTOMATION_SETTINGS, ...(this.getSetting<Partial<AutomationSettings>>("automation") ?? {}) };
}

setAutomationSettings(patch: Partial<AutomationSettings>): AutomationSettings {
  const next = { ...this.getAutomationSettings(), ...patch };
  this.setSetting("automation", next);
  return next;
}
```

Add typed routes `automationSettings.get/set` in the same automation contracts file. Put them behind the same flag; changing `enabled` from the UI should start/stop the runtime without a daemon restart (call `automationRuntime.start()/stop()` from the route handler).

## 11. Tests

`packages/automation-runtime/test/topics.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { isValidPattern, isValidTopic, topicMatches } from "../src/topics";

describe("topicMatches", () => {
  test("exact", () => expect(topicMatches("source/scans/new", "source/scans/new")).toBe(true));
  test("single level", () => expect(topicMatches("source/+/new", "source/scans/new")).toBe(true));
  test("hash includes the parent", () => expect(topicMatches("source/#", "source")).toBe(true));
  test("hash includes descendants", () => expect(topicMatches("source/#", "source/a/b")).toBe(true));
  test("plus does not cross levels", () => expect(topicMatches("source/+", "source/a/b")).toBe(false));
  test("rejects invalid patterns", () => expect(isValidPattern("source/#/x")).toBe(false));
});
```

`apps/daemon/test/automation-foundations.test.ts`:

- Create an in-memory `bun:sqlite` database.
- Instantiate `DaemonAutomationRepository`.
- Insert events, list with topic filter, assert `nextBefore`.
- Assert a second `insertEvent` with the same id fails (primary key) and the caller handles it.
- Set/get/delete state.
- Assert `pruneEvents` removes old rows and leaves newer ones.

No dispatcher test is needed in this PR; the route contract drift guard plus a route-level integration comes with the UI client.

## 12. Exit criteria

- [ ] `bun run typecheck` passes for the new package and daemon.
- [ ] `bun run lint` passes the route/event catalog drift guards.
- [ ] An event emitted through `DaemonAutomationRuntime.emit` is persisted and visible via `automationEvents.list`.
- [ ] State survives a daemon restart.
- [ ] Retention deletes old events and leaves the log bounded.
- [ ] `/automation` UI (next doc) renders the event log without a browser console error.
- [ ] Shutdown clears the retention timer; no open handles.
