# CI Actions Storage Over-Quota

## Problem

GitHub sent a billing alert: the `dvaJi/argos` private repo has consumed 90%
(0.45 GB) of the 0.5 GB/month free Actions storage allocation. Inspection
reveals **~10 GB of active caches** and **~2.5 GB of build artifacts** that are
either stale, orphaned, or accumulating unboundedly.

### Root causes

1. **Stale build artifacts (7, ~2.5 GB)** — artifacts from Jul 2 release builds
   that have already been consumed by the release job. No `retention-days` set,
   so they persist for the default 90 days.

2. **Malformed-ref cache orphans (25 caches, ~6.7 GB)** — caches scoped to
   `refs/heads/refs/tags/v0.1.0`. This is a known GitHub Actions platform bug:
   tag-push-triggered workflows get their cache scope ref incorrectly prefixed
   with `refs/heads/`. The caches are real but the scope ref is unrecoverable,
   so they never match a restore and never self-evict by ref replacement.

3. **Merged-PR cache residue (~340 MB)** — per-PR cache entries (pnpm store,
   electron, turbo) for PRs #13–#28, all merged and closed.

4. **Turbo local-cache churn** — `setup-build/action.yml` keys the Turbo
   fallback cache with `github.sha`, producing a new ~150 MB cache entry on
   every build that is written but never overwritten (SHA is unique per
   commit). Entries accumulate until LRU eviction, which for a private repo
   counts against billed storage.

## Goal

Bring Actions storage well under the 0.5 GB free tier and prevent recurrence,
without slowing CI (keep dependency/toolchain caches that actually save time).

## Non-goals

- Making the repo public (would eliminate billing but is a product decision).
- Removing dependency caches (pnpm store, electron, runtime) — these are
  high-value and already keyed correctly by lockfile hash.
- Remote Turbo cache changes (already configured via `TURBO_API` env).
