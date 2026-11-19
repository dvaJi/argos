# MCP v2 Package Migration — Evaluation

Tracked strategic follow-up from the mcp-acp-update skill ledger. This document evaluates the migration; implementation is gated (see below).

## What v2 is

The typescript-sdk repo ships v2 as separate packages — `@modelcontextprotocol/client`, `@modelcontextprotocol/server`, `@modelcontextprotocol/core` (+ `server-legacy` as the frozen 1.x-compatible server, `codemod`, `node`, express/hono/fastify adapters). The legacy `@modelcontextprotocol/sdk` package remains on 1.x (backports only); Argos pins `1.32.2` from it.

## Why Argos is not on v2 yet

- The 1.x line is actively maintained (1.32.1/1.32.2 shipped alongside 2.4.0 with backports).
- Argos' entire MCP surface (transports, tools/prompts/resources, sampling, elicitation, roots, tasks, OAuth provider wiring) is written against the 1.x `@modelcontextprotocol/sdk` API.
- v2 breaking deltas that hit Argos' surfaces: structuredContent unwrapped for `$ref`-rooted object schemas (2025-11-25 connections), `x-mcp-header` on `number` params rejected (2026-07-28 spec), stricter Ajv/fast-uri schema validation, package split rewrites every import.

## Migration scope (when triggered)

1. Swap the catalog entry to the new packages: `@modelcontextprotocol/core` (protocol layer), `@modelcontextprotocol/client` (client + transports + sampling/elicitation/auth), `@modelcontextprotocol/server` (in-memory servers).
2. Rewrite imports across `packages/mcp-runtime` (~12 files) — the official upgrade guide is itself an installable agent skill (upstream PR #2968).
3. Re-run the protocol test surface (`mcpClient.test.ts`, elicitation/roots/tasks tests).
4. Server-legacy exists if a server behavior regresses.

## Trigger criteria

- Argos needs a v2-only feature (e.g. Skills over MCP, SEP-2640).
- 1.x backports stop landing for a full quarter.
- A security issue is fixed only in v2.

## Decision

Stay on 1.x; re-evaluate quarterly via the `mcp-acp-update` skill triage (the ledger flags it automatically).
